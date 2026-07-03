"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import type { ActionResult } from "@/types";

export type GroupMemberRow = { org_id: string; org_name: string; joined_at: string };
export type CompanyGroupRow = { id: string; name: string; created_at: string; members: GroupMemberRow[] };
export type PinCollision = { pin: string; orgs: { org_id: string; org_name: string }[] };

function unauth<T>(): ActionResult<T> {
  return { success: false, error: "Not authorized" };
}

export async function listGroups(): Promise<ActionResult<CompanyGroupRow[]>> {
  if (!isSuperadminAuthenticated()) return unauth();
  const sb = createAdminSupabase();
  const { data: groups, error } = await sb
    .from("company_groups")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };

  const { data: members } = await sb
    .from("org_group_memberships")
    .select("group_id, org_id, joined_at, organizations:org_id(name)");

  const byGroup = new Map<string, GroupMemberRow[]>();
  for (const m of ((members ?? []) as any[])) {
    const arr = byGroup.get(m.group_id) ?? [];
    arr.push({ org_id: m.org_id, org_name: m.organizations?.name ?? "—", joined_at: m.joined_at });
    byGroup.set(m.group_id, arr);
  }

  const rows: CompanyGroupRow[] = ((groups ?? []) as any[]).map((g) => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    members: byGroup.get(g.id) ?? [],
  }));
  return { success: true, data: rows };
}

/** Orgs not yet in any group (candidates to add). */
export async function listUngroupedOrgs(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  if (!isSuperadminAuthenticated()) return unauth();
  const sb = createAdminSupabase();
  const { data: orgs } = await sb.from("organizations").select("id, name").order("name");
  const { data: memberships } = await sb.from("org_group_memberships").select("org_id");
  const grouped = new Set(((memberships ?? []) as any[]).map((m) => m.org_id));
  const rows = ((orgs ?? []) as any[])
    .filter((o) => !grouped.has(o.id))
    .map((o) => ({ id: o.id, name: o.name }));
  return { success: true, data: rows };
}

export async function createGroup(name: string): Promise<ActionResult<{ id: string }>> {
  if (!isSuperadminAuthenticated()) return unauth();
  const parsed = z.string().min(1).max(120).safeParse(name);
  if (!parsed.success) return { success: false, error: "Group name is required" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("company_groups")
    .insert({ name: parsed.data, created_by: "superadmin" })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  revalidatePath("/superadmin/groups");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function addOrgToGroup(input: {
  groupId: string;
  orgId: string;
}): Promise<ActionResult<{ collisions: PinCollision[] }>> {
  if (!isSuperadminAuthenticated()) return unauth();
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("org_group_memberships")
    .insert({ group_id: input.groupId, org_id: input.orgId });
  if (error) {
    if (/duplicate|uq_org_one_group/i.test(error.message))
      return { success: false, error: "That organization is already in a group." };
    return { success: false, error: error.message };
  }
  revalidatePath("/superadmin/groups");
  // Warn (don't block) on any device_code assigned in >1 member org.
  const scan = await scanGroupPinCollisions(input.groupId);
  return { success: true, data: { collisions: scan.success ? scan.data : [] } };
}

export async function removeOrgFromGroup(orgId: string): Promise<ActionResult<void>> {
  if (!isSuperadminAuthenticated()) return unauth();
  const sb = createAdminSupabase();
  const { error } = await sb.from("org_group_memberships").delete().eq("org_id", orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/superadmin/groups");
  return { success: true, data: undefined };
}

/** PINs (device_code) assigned to employees in more than one member org → ambiguous. */
export async function scanGroupPinCollisions(
  groupId: string,
): Promise<ActionResult<PinCollision[]>> {
  if (!isSuperadminAuthenticated()) return unauth();
  const sb = createAdminSupabase();
  const { data: members } = await sb
    .from("org_group_memberships")
    .select("org_id, organizations:org_id(name)")
    .eq("group_id", groupId);
  const orgIds = ((members ?? []) as any[]).map((m) => m.org_id);
  const orgNameById = new Map<string, string>(
    ((members ?? []) as any[]).map((m) => [m.org_id, m.organizations?.name ?? "—"]),
  );
  if (orgIds.length < 2) return { success: true, data: [] };

  const { data: emps } = await sb
    .from("employees")
    .select("device_code, org_id")
    .in("org_id", orgIds)
    .not("device_code", "is", null)
    .neq("status", "terminated");

  const byPin = new Map<string, Set<string>>();
  for (const e of ((emps ?? []) as any[])) {
    const pin = String(e.device_code);
    const set = byPin.get(pin) ?? new Set<string>();
    set.add(e.org_id);
    byPin.set(pin, set);
  }

  const collisions: PinCollision[] = [];
  for (const [pin, orgSet] of byPin) {
    if (orgSet.size > 1) {
      collisions.push({
        pin,
        orgs: [...orgSet].map((id) => ({ org_id: id, org_name: orgNameById.get(id) ?? "—" })),
      });
    }
  }
  collisions.sort((a, b) => a.pin.localeCompare(b.pin, undefined, { numeric: true }));
  return { success: true, data: collisions };
}
