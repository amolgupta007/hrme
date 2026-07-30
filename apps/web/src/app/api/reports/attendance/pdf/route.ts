import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { fetchAttendanceReportData, validateRange } from "@/lib/reports/fetch-report-data";
import { renderAttendanceReportPdf } from "@/lib/reports/attendance-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (!isAdmin(user.role)) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const departmentId = url.searchParams.get("departmentId");
  if (validateRange(from, to)) {
    return Response.json({ error: "invalid_range" }, { status: 400 });
  }

  try {
    const sb = createAdminSupabase();
    const { data: org } = await sb.from("organizations").select("name").eq("id", user.orgId).single();
    const orgName = org?.name ?? "Organization";
    const data = await fetchAttendanceReportData(user.orgId, orgName, { from, to, departmentId });
    const pdf = await renderAttendanceReportPdf(data);
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="attendance-${slug}-${from}-${to}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[reports/attendance/pdf] failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "render_failed" }, { status: 500 });
  }
}
