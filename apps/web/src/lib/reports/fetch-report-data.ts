// Server-only data assembly for attendance reports. Plain module (NOT "use server")
// so nothing here becomes a browser-callable RPC; the action + PDF route wrap it.
import { createAdminSupabase } from "@/lib/supabase/server";
import type { WeekOffOverride, WeekOffPolicy } from "@/lib/attendance/week-off";
import {
  buildReportData, enumerateDates, istToday,
  type AttendanceReportData, type RawReportInputs,
} from "./attendance-report";

const MAX_RANGE_DAYS = 92;
const PAGE = 1000;
const DEFAULT_POLICY: WeekOffPolicy = { week_type: 6, off_days: [0] };

export function validateRange(from: string, to: string): string | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to) || from > to) return "Invalid date range";
  if (enumerateDates(from, to).length > MAX_RANGE_DAYS) {
    return "Range too large — maximum 92 days";
  }
  return null;
}

// Page through PostgREST's 1000-row cap and stitch. `makeQuery` must apply
// .range(fromIdx, toIdx) itself so each call gets a fresh builder.
async function fetchAll<T>(
  makeQuery: (fromIdx: number, toIdx: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await makeQuery(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function fetchAttendanceReportData(
  orgId: string,
  orgName: string,
  params: { from: string; to: string; departmentId?: string | null },
): Promise<AttendanceReportData> {
  const invalid = validateRange(params.from, params.to);
  if (invalid) throw new Error(invalid);
  const sb = createAdminSupabase();
  const { from, to, departmentId } = params;

  // Employees (active), optionally department-filtered.
  // FK-disambiguated embed required: employees.department_id -> departments AND
  // departments.head_id -> employees both exist, so bare `departments(name)`
  // returns HTTP 300 Multiple Choices (see src/actions/shifts.ts:401-405).
  let empQuery = sb
    .from("employees")
    .select("id, first_name, last_name, department_id, departments!department_id(name)")
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .order("first_name");
  if (departmentId) empQuery = empQuery.eq("department_id", departmentId);
  const { data: empRows, error: empErr } = await empQuery;
  if (empErr) throw new Error(empErr.message);
  const employees = (empRows ?? []).map((e) => {
    const dept = e.departments as unknown as { name: string } | null;
    return {
      id: e.id as string,
      name: `${e.first_name} ${e.last_name ?? ""}`.trim(),
      department_id: (e.department_id as string | null) ?? null,
      department: dept?.name ?? null,
    };
  });
  const empIds = employees.map((e) => e.id);
  if (empIds.length === 0) {
    return buildReportData({
      from, to, todayIst: istToday(), orgName,
      generatedAt: new Date().toISOString(),
      employees: [], records: [], events: [], holidays: [], leaves: [],
      orgPolicy: DEFAULT_POLICY, deptOverrides: {}, empOverrides: {},
    });
  }

  const [records, events, holidayRows, leaveRows, policyRow, deptOvRows, empOvRows] =
    await Promise.all([
      fetchAll((a, b) =>
        // FK-disambiguated embed (departments!department_id precedent above):
        // attendance_records.shift_id is its only FK to shifts (migration 032),
        // so `shifts!shift_id(...)` is unambiguous — used explicitly anyway,
        // matching this file's existing embed idiom.
        sb.from("attendance_records")
          .select("employee_id, date, clock_in_at, clock_out_at, total_minutes, source, auto_closed, out_of_zone_count, is_late, shifts!shift_id(half_day_threshold_minutes)")
          .eq("org_id", orgId).gte("date", from).lte("date", to)
          .in("employee_id", empIds)
          .order("date").order("employee_id")
          .range(a, b),
      ),
      fetchAll((a, b) =>
        sb.from("attendance_punch_events")
          .select("employee_id, punched_at")
          .eq("org_id", orgId).eq("status", "approved")
          // punched_at window widened −1/+2 days (UTC) so IST attribution at BOTH range
          // edges is complete: an IST punch at 00:00–05:29 on `from` is the previous UTC
          // day (≥18:30Z), and one late on `to` spills into the next UTC day.
          // buildReportData ignores events whose IST day falls outside `dates`.
          .gte("punched_at", new Date(new Date(`${from}T00:00:00Z`).getTime() - 86_400_000).toISOString())
          .lte("punched_at", new Date(new Date(`${to}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString())
          .in("employee_id", empIds)
          // Deterministic total order across .range() pages: punched_at has
          // second-precision ties (shift change), so tiebreak on the uuid PK.
          .order("punched_at").order("id")
          .range(a, b),
      ),
      sb.from("holidays").select("date").eq("org_id", orgId).gte("date", from).lte("date", to),
      fetchAll((a, b) =>
        sb.from("leave_requests")
          .select("employee_id, start_date, end_date")
          .eq("org_id", orgId).eq("status", "approved")
          .lte("start_date", to).gte("end_date", from)
          .in("employee_id", empIds)
          // Deterministic total order across .range() pages (uuid PK).
          .order("id")
          .range(a, b),
      ),
      sb.from("week_off_policy").select("week_type, off_days, alt_saturday_rule").eq("org_id", orgId).maybeSingle(),
      sb.from("department_week_off_override").select("department_id, week_type, off_days, alt_saturday_rule").eq("org_id", orgId),
      sb.from("employee_week_off_override").select("employee_id, week_type, off_days, alt_saturday_rule").eq("org_id", orgId),
    ]);

  if (holidayRows.error) throw new Error(holidayRows.error.message);
  if (policyRow.error) throw new Error(policyRow.error.message);
  if (deptOvRows.error) throw new Error(deptOvRows.error.message);
  if (empOvRows.error) throw new Error(empOvRows.error.message);

  const deptOverrides: Record<string, WeekOffOverride> = {};
  for (const r of deptOvRows.data ?? []) {
    deptOverrides[r.department_id as string] = {
      week_type: r.week_type as 5 | 6, off_days: r.off_days as number[],
      alt_saturday_rule: (r.alt_saturday_rule ?? "none") as WeekOffOverride["alt_saturday_rule"],
    };
  }
  const empOverrides: Record<string, WeekOffOverride> = {};
  for (const r of empOvRows.data ?? []) {
    empOverrides[r.employee_id as string] = {
      week_type: r.week_type as 5 | 6, off_days: r.off_days as number[],
      alt_saturday_rule: (r.alt_saturday_rule ?? "none") as WeekOffOverride["alt_saturday_rule"],
    };
  }

  const orgPolicy: WeekOffPolicy = policyRow.data
    ? {
        week_type: policyRow.data.week_type as 5 | 6,
        off_days: policyRow.data.off_days as number[],
        alt_saturday_rule: (policyRow.data.alt_saturday_rule ?? "none") as WeekOffPolicy["alt_saturday_rule"],
      }
    : DEFAULT_POLICY;

  // Flatten the shifts!shift_id embed onto each record row (same idiom as the
  // employees/departments embed above) so the pure lib input stays a flat
  // record shape (plan §3 half-day classification).
  const flatRecords: RawReportInputs["records"] = (records as Array<Record<string, unknown>>).map((r) => {
    const shift = r.shifts as unknown as { half_day_threshold_minutes: number } | null;
    return {
      employee_id: r.employee_id as string,
      date: r.date as string,
      clock_in_at: r.clock_in_at as string | null,
      clock_out_at: r.clock_out_at as string | null,
      total_minutes: r.total_minutes as number | null,
      source: r.source as string | null,
      auto_closed: r.auto_closed as boolean | null,
      out_of_zone_count: r.out_of_zone_count as number | null,
      is_late: r.is_late as boolean | null,
      half_day_threshold_minutes: shift?.half_day_threshold_minutes ?? null,
    };
  });

  return buildReportData({
    from, to, todayIst: istToday(), orgName,
    generatedAt: new Date().toISOString(),
    employees,
    records: flatRecords,
    events: events as RawReportInputs["events"],
    holidays: (holidayRows.data ?? []) as { date: string }[],
    leaves: (leaveRows ?? []) as RawReportInputs["leaves"],
    orgPolicy, deptOverrides, empOverrides,
  });
}
