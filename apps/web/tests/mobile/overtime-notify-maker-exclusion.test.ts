import { describe, it, expect, vi, beforeEach } from "vitest";

// Finding 2 (Important, push-task14): notifyAdminsOvertimePending notified
// EVERY owner/admin, including the admin who just ran compute themselves.
// This drives the real computeAndRecordOvertime action end-to-end (per-day
// mode, approval_required=true) and asserts the caller's own employeeId is
// excluded from the notified set — mirrors the maker-exclusion already used
// in disbursement.ts's "Notify checker admins" block.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sendPushMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/mobile/push", () => ({
  sendPush: (...args: unknown[]) => sendPushMock(...args),
}));

const CALLER_ID = "admin-caller";
const OTHER_ADMIN_ID = "admin-other";

const mockUser = {
  orgId: "org-1",
  orgName: "Acme",
  clerkUserId: "clerk_admin",
  role: "admin" as const,
  employeeId: CALLER_ID,
  firstName: "Amol",
  employmentType: "full_time" as const,
  plan: "business" as const,
  customFeatures: null,
  jambaHireEnabled: false,
  assistantEnabled: false,
  assistantTenantDocsEnabled: false,
  attendanceEnabled: true,
  attendancePayrollEnabled: false,
  grievancesEnabled: false,
  jambaGeoEnabled: false,
};

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => mockUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
}));

// Org has two active admins: the caller (who ran compute) and one other.
// notifyAdminsOvertimePending must page only the other one.
const ADMINS = [{ id: CALLER_ID }, { id: OTHER_ADMIN_ID }];

function tableProxy(table: string) {
  const b: any = {};
  ["select", "eq", "not", "gte", "lte", "in", "order"].forEach((m) => {
    b[m] = () => b;
  });
  b.upsert = () => Promise.resolve({ data: null, error: null });
  b.insert = () => Promise.resolve({ data: null, error: null });
  b.single = () => {
    if (table === "organizations") {
      return Promise.resolve({
        data: {
          settings: {
            attendance: {
              overtime: {
                enabled: true,
                approval_required: true,
                threshold_mode: "per_day",
                multiplier: 1.5,
                weekly_threshold_hours: 48,
              },
            },
          },
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  };
  b.then = (resolve: any, reject: any) => {
    let result: any = { data: [], error: null };
    if (table === "attendance_records") {
      // One record with 2h of OT (600 worked mins vs an 8h/480min shift).
      result = {
        data: [
          {
            id: "rec-1",
            employee_id: "emp-1",
            date: "2026-08-10",
            total_minutes: 600,
            worked_minutes: 600,
            shift_id: "shift-1",
            shifts: { total_hours: 8 },
          },
        ],
        error: null,
      };
    } else if (table === "employees") {
      result = { data: ADMINS, error: null };
    }
    return Promise.resolve(result).then(resolve, reject);
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (table: string) => tableProxy(table) }),
}));

import { computeAndRecordOvertime } from "../../src/actions/overtime";

beforeEach(() => {
  sendPushMock.mockClear();
});

describe("computeAndRecordOvertime — pending-OT notification excludes the maker", () => {
  it("does not notify the admin who ran compute; still notifies the other admin", async () => {
    const res = await computeAndRecordOvertime({ from: "2026-08-10", to: "2026-08-10" } as any);

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.inserted).toBe(1);
    }

    // notify() → sendPush(supabase, [employeeId], {...}) — one call per
    // notified recipient; recipient id is args[1][0].
    const notifiedIds = sendPushMock.mock.calls.map((c: any) => c[1][0]);
    expect(notifiedIds).not.toContain(CALLER_ID);
    expect(notifiedIds).toEqual([OTHER_ADMIN_ID]);
  });
});
