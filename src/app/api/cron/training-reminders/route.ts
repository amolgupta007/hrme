import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { TrainingReminderEmail } from "@/components/emails/training-reminder";

const DAYS_AHEAD = 7; // alert for courses due within this many days

export async function GET(req: Request) {
  // Verify Vercel Cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + DAYS_AHEAD);

    const todayStr = today.toISOString().split("T")[0];
    const cutoffStr = cutoff.toISOString().split("T")[0];

    // Get all incomplete enrollments for mandatory courses
    const { data: enrollments, error } = await supabase
      .from("training_enrollments")
      .select(`
        id,
        employee_id,
        status,
        org_id,
        training_courses!course_id (
          id,
          title,
          category,
          due_date,
          is_mandatory
        )
      `)
      .in("status", ["assigned", "in_progress", "overdue"])
      .eq("training_courses.is_mandatory", true);

    if (error) {
      console.error("Training reminder query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // Filter to overdue or due within DAYS_AHEAD
    const relevant = (enrollments as any[]).filter((e) => {
      const course = e.training_courses;
      if (!course) return false;
      if (e.status === "overdue") return true;
      if (!course.due_date) return false;
      return course.due_date >= todayStr && course.due_date <= cutoffStr;
    });

    if (relevant.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // Get employee details
    const orgIds = [...new Set(relevant.map((e: any) => e.org_id))];
    const { data: employees } = await supabase
      .from("employees")
      .select("id, email, first_name, last_name, org_id")
      .in("org_id", orgIds)
      .eq("status", "active");

    if (!employees || employees.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const empMap = new Map((employees as any[]).map((e) => [e.id, e]));

    // Group pending courses by employee
    const pendingByEmployee: Record<
      string,
      { employee: any; courses: { title: string; category: string; dueDate: string | null; isOverdue: boolean }[] }
    > = {};

    for (const enrollment of relevant) {
      const course = enrollment.training_courses;
      if (!course) continue;

      const emp = empMap.get(enrollment.employee_id);
      if (!emp) continue;

      if (!pendingByEmployee[emp.id]) {
        pendingByEmployee[emp.id] = { employee: emp, courses: [] };
      }

      const isOverdue =
        enrollment.status === "overdue" ||
        (course.due_date && course.due_date < todayStr);

      pendingByEmployee[emp.id].courses.push({
        title: course.title,
        category: course.category,
        dueDate: course.due_date ?? null,
        isOverdue: !!isOverdue,
      });
    }

    // Send one email per employee
    let sent = 0;
    for (const { employee, courses } of Object.values(pendingByEmployee)) {
      if (courses.length === 0) continue;
      try {
        const overdueCount = courses.filter((c) => c.isOverdue).length;
        const subject =
          overdueCount > 0
            ? `JambaHR – ${overdueCount} overdue training ${overdueCount === 1 ? "course" : "courses"} require your attention`
            : `JambaHR – ${courses.length} training ${courses.length === 1 ? "course" : "courses"} due this week`;

        const html = await render(
          TrainingReminderEmail({
            employeeName: `${employee.first_name} ${employee.last_name}`,
            pendingCourses: courses,
            dashboardUrl: "https://jambahr.com/dashboard/training",
          })
        );

        await resend.emails.send({
          from: FROM_EMAIL,
          to: employee.email,
          subject,
          html,
        });
        sent++;
      } catch (err) {
        console.error(`Failed to send training reminder to ${employee.email}:`, err);
      }
    }

    return NextResponse.json({ sent, total: Object.keys(pendingByEmployee).length });
  } catch (err) {
    console.error("Training reminder cron error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
