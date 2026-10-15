// Plain module — NOT "use server" (gotcha #85): it reads employee emails and
// sends mail/push, so it must never be a browser-callable RPC.
//
// Clock-in / clock-out reminders. Run every 5 minutes by pg_cron →
// /api/cron/attendance-reminders. Each (employee, IST date, kind) is claimed in
// attendance_reminder_log BEFORE anything is sent, so overlapping or repeated
// runs never remind anyone twice. Everything after the claim is best-effort.

import { render } from "@react-email/render";
import {
  dueReminderKinds,
  formatReminderTime,
  istClock,
  needsReminder,
  normalizeReminderSettings,
  type AttendanceReminderSettings,
  type ReminderCandidate,
  type ReminderKind,
} from "@jambahr/shared/attendance/reminders";
import { loadNonWorkingDates } from "@/lib/payroll/non-working-days";
import { sendPush } from "@/lib/mobile/push";
import { resend, NOREPLY_EMAIL, FROM_EMAIL } from "@/lib/resend";
import { AttendanceReminderEmail } from "@/components/emails/attendance-reminder";

type Supabase = { from: (table: string) => any };

const APP_URL = "https://jambahr.com";
const ATTENDANCE_URL = `${APP_URL}/dashboard/attendance`;

export type ReminderEmployee = {
  id: string;
  first_name: string | null;
  email: string | null;
  department_id: string | null;
};

/**
 * Today's reminder state for a set of employees: week-off/holiday, approved
 * leave, and clock-in state. Throws if a read fails — a failed lookup must
 * never read as "working day, not clocked in" and spam everyone (gotcha #102).
 */
export async function loadReminderCandidates(
  supabase: Supabase,
  args: { orgId: string; date: string; employees: ReminderEmployee[]; excludedIds: ReadonlySet<string> }
): Promise<Map<string, ReminderCandidate>> {
  const { orgId, date, employees, excludedIds } = args;
  const out = new Map<string, ReminderCandidate>();
  if (employees.length === 0) return out;
  const ids = employees.map((e) => e.id);

  const [records, leaves, nonWorking] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("employee_id, clock_in_at, clock_out_at")
      .eq("org_id", orgId)
      .eq("date", date)
      .in("employee_id", ids),
    supabase
      .from("leave_requests")
      .select("employee_id")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .lte("start_date", date)
      .gte("end_date", date)
      .in("employee_id", ids),
    loadNonWorkingDates(supabase, { orgId, month: date.slice(0, 7), employees }),
  ]);
  if (records.error) throw new Error(`attendance_records: ${records.error.message}`);
  if (leaves.error) throw new Error(`leave_requests: ${leaves.error.message}`);

  const recordBy = new Map<string, { clock_in_at: string | null; clock_out_at: string | null }>(
    ((records.data ?? []) as any[]).map((r) => [r.employee_id, r])
  );
  const onLeave = new Set(((leaves.data ?? []) as any[]).map((l) => l.employee_id as string));

  for (const e of employees) {
    const rec = recordBy.get(e.id);
    out.set(e.id, {
      excluded: excludedIds.has(e.id),
      nonWorkingToday: nonWorking.get(e.id)?.dates.includes(date) ?? false,
      onLeaveToday: onLeave.has(e.id),
      clockedIn: !!rec?.clock_in_at,
      sessionOpen: !!rec?.clock_in_at && !rec?.clock_out_at,
    });
  }
  return out;
}

const COPY: Record<ReminderKind, { title: string; body: string; subject: (org: string) => string }> = {
  clock_in: {
    title: "You haven't clocked in yet",
    body: "If you're working today, clock in now so your attendance is recorded.",
    subject: () => "Reminder: you haven't clocked in yet today",
  },
  clock_out: {
    title: "Don't forget to clock out",
    body: "You're still clocked in. Clock out when you finish for the day.",
    subject: () => "Reminder: you're still clocked in",
  },
};

export type ReminderRunSummary = {
  orgs: number;
  sent: Array<{ orgId: string; kind: ReminderKind; reminded: number; emailed: number }>;
  errors: string[];
};

/** One pass over every org with reminders switched on. Idempotent. */
export async function runAttendanceReminders(supabase: Supabase, now: Date = new Date()): Promise<ReminderRunSummary> {
  const { date, minutes } = istClock(now);
  const summary: ReminderRunSummary = { orgs: 0, sent: [], errors: [] };

  const { data: orgs, error: orgErr } = await supabase.from("organizations").select("id, name, settings");
  if (orgErr) throw new Error(`organizations: ${orgErr.message}`);

  for (const org of (orgs ?? []) as Array<{ id: string; name: string | null; settings: any }>) {
    if (org.settings?.attendance_enabled !== true) continue;
    const settings = normalizeReminderSettings(org.settings);
    const kinds = dueReminderKinds(settings, minutes);
    if (kinds.length === 0) continue;
    summary.orgs++;
    try {
      for (const kind of kinds) {
        const r = await remindOrg(supabase, { org, settings, kind, date });
        summary.sent.push({ orgId: org.id, kind, ...r });
      }
    } catch (e) {
      // One org's failure must not stop the others.
      summary.errors.push(`${org.id}: ${(e as Error).message}`);
    }
  }
  return summary;
}

async function remindOrg(
  supabase: Supabase,
  args: { org: { id: string; name: string | null }; settings: AttendanceReminderSettings; kind: ReminderKind; date: string }
): Promise<{ reminded: number; emailed: number }> {
  const { org, settings, kind, date } = args;

  const { data: emps, error } = await supabase
    .from("employees")
    .select("id, first_name, email, department_id")
    .eq("org_id", org.id)
    .not("status", "in", "(terminated,inactive)");
  if (error) throw new Error(`employees: ${error.message}`);
  const employees = (emps ?? []) as ReminderEmployee[];

  const candidates = await loadReminderCandidates(supabase, {
    orgId: org.id,
    date,
    employees,
    excludedIds: new Set(settings.excludedEmployeeIds),
  });
  const due = employees.filter((e) => needsReminder(kind, candidates.get(e.id)!));
  if (due.length === 0) return { reminded: 0, emailed: 0 };

  // Claim first: only rows this run actually inserted get reminded.
  const { data: claimed, error: claimErr } = await supabase
    .from("attendance_reminder_log")
    .upsert(
      due.map((e) => ({ org_id: org.id, employee_id: e.id, date, kind })),
      { onConflict: "employee_id,date,kind", ignoreDuplicates: true }
    )
    .select("id, employee_id");
  if (claimErr) throw new Error(`attendance_reminder_log: ${claimErr.message}`);
  const claimedRows = (claimed ?? []) as Array<{ id: string; employee_id: string }>;
  if (claimedRows.length === 0) return { reminded: 0, emailed: 0 };
  const claimedIds = new Set(claimedRows.map((r) => r.employee_id));
  const recipients = due.filter((e) => claimedIds.has(e.id));
  const copy = COPY[kind];

  if (settings.inApp) {
    try {
      // supabase-js returns errors instead of throwing — check it, or a
      // rejected row (e.g. the notifications type CHECK) vanishes silently.
      const { error: feedErr } = await supabase.from("notifications").insert(
        recipients.map((e) => ({
          org_id: org.id,
          employee_id: e.id,
          type: "attendance_reminder",
          title: copy.title,
          body: copy.body,
          data: { kind, date },
        }))
      );
      if (feedErr) console.warn("[attendance-reminders] in-app insert failed", feedErr.message);
    } catch (err) {
      // Feed write failure must not block the push or the email.
      console.warn("[attendance-reminders] in-app insert threw", (err as Error).message);
    }
    try {
      await sendPush(supabase, recipients.map((e) => e.id), {
        title: copy.title,
        body: copy.body,
        data: { type: "attendance_reminder", kind },
      });
    } catch {
      // sendPush swallows internally; defense in depth.
    }
  }

  const status = new Map<string, "sent" | "failed" | "skipped_no_email" | "skipped_disabled">();
  let emailed = 0;
  if (!settings.email || !process.env.RESEND_API_KEY) {
    for (const e of recipients) status.set(e.id, "skipped_disabled");
  } else {
    const orgName = (org.name ?? "your company").trim();
    const timeLabel = formatReminderTime(kind === "clock_in" ? settings.clockIn.time : settings.clockOut.time);
    const withEmail = recipients.filter((e) => !!e.email?.trim());
    for (const e of recipients) if (!e.email?.trim()) status.set(e.id, "skipped_no_email");
    // Resend's batch endpoint takes ≤100 per call — stays under its rate limit.
    for (let i = 0; i < withEmail.length; i += 100) {
      const chunk = withEmail.slice(i, i + 100);
      try {
        const messages = await Promise.all(
          chunk.map(async (e) => ({
            from: `JambaHR <${NOREPLY_EMAIL}>`,
            replyTo: FROM_EMAIL,
            to: e.email!.trim(),
            subject: copy.subject(orgName),
            html: await render(
              AttendanceReminderEmail({
                firstName: e.first_name?.trim() || "there",
                orgName,
                kind,
                timeLabel,
                attendanceUrl: ATTENDANCE_URL,
              })
            ),
          }))
        );
        const { error: sendErr } = await resend.batch.send(messages);
        if (sendErr) throw new Error(sendErr.message);
        for (const e of chunk) status.set(e.id, "sent");
        emailed += chunk.length;
      } catch (err) {
        console.warn("[attendance-reminders] email batch failed", (err as Error).message);
        for (const e of chunk) status.set(e.id, "failed");
      }
    }
  }

  // Record the outcome per status (diagnostics only — never blocks).
  const byStatus = new Map<string, string[]>();
  for (const row of claimedRows) {
    const s = status.get(row.employee_id) ?? "failed";
    byStatus.set(s, [...(byStatus.get(s) ?? []), row.id]);
  }
  for (const [s, ids] of byStatus) {
    try {
      await supabase.from("attendance_reminder_log").update({ email_status: s }).in("id", ids);
    } catch {
      // ignore
    }
  }

  return { reminded: recipients.length, emailed };
}
