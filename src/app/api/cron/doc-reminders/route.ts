import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { DocReminderEmail } from "@/components/emails/doc-reminder";

export async function GET(req: Request) {
  // Verify Vercel Cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();

  try {
    // Get all docs that require acknowledgment
    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id, name, category, org_id, is_company_wide, employee_id")
      .eq("requires_acknowledgment", true);

    if (docsError || !docs || docs.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // Get all acknowledgments so far
    const { data: allAcks } = await supabase
      .from("document_acknowledgments")
      .select("document_id, employee_id");

    const ackedSet = new Set(
      (allAcks ?? []).map((a: any) => `${a.document_id}:${a.employee_id}`)
    );

    // Get all active employees per org
    const orgIds = [...new Set((docs as any[]).map((d: any) => d.org_id))];
    const { data: employees } = await supabase
      .from("employees")
      .select("id, email, first_name, last_name, org_id")
      .in("org_id", orgIds)
      .eq("status", "active");

    if (!employees || employees.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // Build per-employee pending doc list
    const pendingByEmployee: Record<
      string,
      { employee: any; docs: { name: string; category: string }[] }
    > = {};

    for (const doc of docs as any[]) {
      // Determine which employees should acknowledge this doc
      const eligible = (employees as any[]).filter((emp) => {
        if (emp.org_id !== doc.org_id) return false;
        // Company-wide docs: all employees
        // Employee-specific docs: only that employee
        if (!doc.is_company_wide && doc.employee_id && doc.employee_id !== emp.id) {
          return false;
        }
        return true;
      });

      for (const emp of eligible) {
        const key = `${doc.id}:${emp.id}`;
        if (ackedSet.has(key)) continue; // Already acknowledged

        if (!pendingByEmployee[emp.id]) {
          pendingByEmployee[emp.id] = { employee: emp, docs: [] };
        }
        pendingByEmployee[emp.id].docs.push({
          name: doc.name,
          category: doc.category ?? "Document",
        });
      }
    }

    // Send reminder emails
    let sent = 0;
    for (const { employee, docs: pending } of Object.values(pendingByEmployee)) {
      if (pending.length === 0) continue;
      try {
        const html = await render(
          DocReminderEmail({
            employeeName: `${employee.first_name} ${employee.last_name}`,
            pendingDocs: pending,
            dashboardUrl: "https://jambahr.com/dashboard/documents",
          })
        );

        await resend.emails.send({
          from: FROM_EMAIL,
          to: employee.email,
          subject: `JambaHR – ${pending.length} document${pending.length > 1 ? "s" : ""} awaiting your acknowledgment`,
          html,
        });
        sent++;
      } catch (err) {
        console.error(`Failed to send doc reminder to ${employee.email}:`, err);
      }
    }

    return NextResponse.json({ sent, total: Object.keys(pendingByEmployee).length });
  } catch (err) {
    console.error("Doc reminder cron error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
