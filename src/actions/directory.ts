"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import type { ActionResult } from "@/types";

async function getOrgId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.orgId ?? null;
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
  is_on_leave: boolean;
  avatar_url: string | null;
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
    .select("id, first_name, last_name, email, designation, role, employment_type, status, avatar_url, department_id, reporting_manager_id, departments!department_id(name)")
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .order("first_name");

  if (error) return { success: false, error: error.message };

  const today = new Date().toISOString().split("T")[0];
  const { data: onLeaveData } = await supabase
    .from("leave_requests")
    .select("employee_id")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .lte("start_date", today)
    .gte("end_date", today);

  const onLeaveSet = new Set((onLeaveData ?? []).map((r: any) => r.employee_id));

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
    is_on_leave: onLeaveSet.has(e.id),
    avatar_url: e.avatar_url,
    department_name: e.departments?.name ?? null,
    reporting_manager_id: e.reporting_manager_id,
    manager_name: e.reporting_manager_id ? (empMap.get(e.reporting_manager_id) ?? null) : null,
  }));

  return { success: true, data: employees };
}
