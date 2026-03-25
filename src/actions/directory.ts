"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

async function getOrgId(): Promise<string | null> {
  const { orgId, userId } = auth();
  let clerkOrgId = orgId ?? null;
  if (!clerkOrgId && userId) {
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    clerkOrgId = memberships.data[0]?.organization.id ?? null;
  }
  if (!clerkOrgId) return null;
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

export type DirectoryEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  designation: string | null;
  role: string;
  employment_type: string;
  status: string;
  department_name: string | null;
  reporting_manager_id: string | null;
  manager_name: string | null;
};

export async function listDirectoryEmployees(): Promise<ActionResult<DirectoryEmployee[]>> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, designation, role, employment_type, status, department_id, reporting_manager_id, departments!department_id(name)")
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .order("first_name");

  if (error) return { success: false, error: error.message };

  // Build a lookup map for manager names
  const empMap = new Map<string, string>();
  for (const e of data ?? []) {
    empMap.set(e.id, `${e.first_name} ${e.last_name}`);
  }

  const employees: DirectoryEmployee[] = (data ?? []).map((e: any) => ({
    id: e.id,
    first_name: e.first_name,
    last_name: e.last_name,
    email: e.email,
    designation: e.designation,
    role: e.role,
    employment_type: e.employment_type,
    status: e.status,
    department_name: e.departments?.name ?? null,
    reporting_manager_id: e.reporting_manager_id,
    manager_name: e.reporting_manager_id ? (empMap.get(e.reporting_manager_id) ?? null) : null,
  }));

  return { success: true, data: employees };
}
