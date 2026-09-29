// Plain module — NOT "use server" (gotcha #85): takes raw org/employee ids.
// Used by the web dashboard banners and the mobile Home card, which each show
// a handful of the latest announcements and must hide targeted ones the
// viewer isn't part of.

import { isVisibleTo, type AudienceTarget, type AudienceType } from "@/lib/announcements/ack-status";

export async function filterVisibleAnnouncements<
  T extends { id: string; audience_type?: AudienceType | null },
>(
  supabase: any,
  params: { orgId: string; employeeId: string | null; isAdmin: boolean; rows: T[] }
): Promise<T[]> {
  const { orgId, employeeId, isAdmin, rows } = params;
  const targeted = rows.filter((r) => r.audience_type === "targeted").map((r) => r.id);
  if (isAdmin || targeted.length === 0) return rows;
  if (!employeeId) return rows.filter((r) => r.audience_type !== "targeted");

  const [{ data: targets }, { data: recips }, { data: me }] = await Promise.all([
    supabase
      .from("announcement_targets")
      .select("announcement_id, target_type, target_id")
      .eq("org_id", orgId)
      .in("announcement_id", targeted),
    supabase
      .from("announcement_recipients")
      .select("announcement_id")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .in("announcement_id", targeted),
    supabase.from("employees").select("department_id").eq("id", employeeId).eq("org_id", orgId).maybeSingle(),
  ]);
  const recipientOf = new Set(((recips ?? []) as Array<{ announcement_id: string }>).map((r) => r.announcement_id));
  const allTargets = (targets ?? []) as Array<AudienceTarget & { announcement_id: string }>;

  return rows.filter((r) =>
    isVisibleTo({
      isAdmin: false,
      audienceType: r.audience_type === "targeted" ? "targeted" : "all",
      targets: allTargets.filter((t) => t.announcement_id === r.id),
      viewer: { id: employeeId, department_id: (me as any)?.department_id ?? null },
      isRecipient: recipientOf.has(r.id),
    })
  );
}
