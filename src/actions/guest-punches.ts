"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

export type GuestPunchRow = {
  id: string;
  punched_at: string;
  guest_org_name: string;
  guest_employee_name: string | null;
  location_name: string | null;
  pin: string | null;
};

/**
 * Host-org read of guest punches — group-company employees who punched at THIS
 * org's devices. Audit/security awareness only; these never affect this org's
 * attendance or payroll (they live in a separate table read by no payroll code).
 */
export async function listGuestPunches(input: {
  from: string;
  to: string;
}): Promise<ActionResult<GuestPunchRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const sb = createAdminSupabase();
  const start = new Date(`${input.from}T00:00:00+05:30`).toISOString();
  const end = new Date(`${input.to}T23:59:59+05:30`).toISOString();

  const { data, error } = await sb
    .from("guest_punch_logs")
    .select(
      "id, punched_at, pin, guest_org:guest_org_id(name), guest_employee:guest_employee_id(first_name, last_name), location:location_id(name)",
    )
    .eq("host_org_id", user.orgId)
    .gte("punched_at", start)
    .lte("punched_at", end)
    .order("punched_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  const rows: GuestPunchRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    punched_at: r.punched_at,
    guest_org_name: r.guest_org?.name ?? "—",
    guest_employee_name: r.guest_employee
      ? `${r.guest_employee.first_name ?? ""} ${r.guest_employee.last_name ?? ""}`.trim() || null
      : null,
    location_name: r.location?.name ?? null,
    pin: r.pin,
  }));
  return { success: true, data: rows };
}
