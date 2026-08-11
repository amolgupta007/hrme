import { describe, expect, it, vi, beforeEach } from "vitest";

const sendPushMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/mobile/push", () => ({
  sendPush: (...args: unknown[]) => sendPushMock(...args),
}));

import { notify, notifyLeaveDecision, notifyPayslipPaid, notifyDocAck } from "@/lib/mobile/notify";

function makeSupabase(opts: { insertThrows?: boolean } = {}) {
  const insertCalls: any[] = [];
  const supabase = {
    from: (table: string) => ({
      insert: async (payload: any) => {
        insertCalls.push([table, payload]);
        if (opts.insertThrows) throw new Error("insert failed");
        return { data: null, error: null };
      },
    }),
  };
  return { supabase, insertCalls };
}

beforeEach(() => {
  sendPushMock.mockClear();
});

describe("notify", () => {
  it("inserts a notifications row then calls sendPush", async () => {
    const { supabase, insertCalls } = makeSupabase();

    await notify(supabase, {
      orgId: "org-1",
      employeeId: "emp-1",
      type: "leave_decision",
      title: "Leave approved",
      body: "Your leave request has been approved.",
      data: { requestId: "req-1" },
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0]).toBe("notifications");
    expect(insertCalls[0][1]).toMatchObject({
      org_id: "org-1",
      employee_id: "emp-1",
      type: "leave_decision",
      title: "Leave approved",
      body: "Your leave request has been approved.",
      data: { requestId: "req-1" },
    });

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock).toHaveBeenCalledWith(supabase, ["emp-1"], {
      title: "Leave approved",
      body: "Your leave request has been approved.",
      data: { requestId: "req-1", type: "leave_decision" },
    });
  });

  it("includes `type` in the push data even when no extra data is passed", async () => {
    const { supabase } = makeSupabase();

    await notify(supabase, {
      orgId: "org-1",
      employeeId: "emp-1",
      type: "announcement",
      title: "t",
      body: "b",
    });

    expect(sendPushMock).toHaveBeenCalledWith(supabase, ["emp-1"], {
      title: "t",
      body: "b",
      data: { type: "announcement" },
    });
  });

  it("still calls sendPush and resolves when the insert throws", async () => {
    const { supabase } = makeSupabase({ insertThrows: true });

    await expect(
      notify(supabase, {
        orgId: "org-1",
        employeeId: "emp-1",
        type: "announcement",
        title: "t",
        body: "b",
      })
    ).resolves.toBeUndefined();

    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });
});

describe("notify wrapper copy (verbatim from the plan)", () => {
  it("notifyLeaveDecision — approved", async () => {
    const { supabase } = makeSupabase();
    await notifyLeaveDecision(supabase, { orgId: "org-1", employeeId: "emp-1", approved: true });
    expect(sendPushMock).toHaveBeenCalledWith(supabase, ["emp-1"], {
      title: "Leave approved",
      body: "Your leave request has been approved.",
      data: { type: "leave_decision" },
    });
  });

  it("notifyLeaveDecision — rejected", async () => {
    const { supabase } = makeSupabase();
    await notifyLeaveDecision(supabase, { orgId: "org-1", employeeId: "emp-1", approved: false });
    expect(sendPushMock).toHaveBeenCalledWith(supabase, ["emp-1"], {
      title: "Leave update",
      body: "Your leave request was not approved.",
      data: { type: "leave_decision" },
    });
  });

  it("notifyPayslipPaid interpolates monthLabel", async () => {
    const { supabase } = makeSupabase();
    await notifyPayslipPaid(supabase, { orgId: "org-1", employeeId: "emp-1", monthLabel: "August 2026" });
    expect(sendPushMock).toHaveBeenCalledWith(supabase, ["emp-1"], {
      title: "Payslip ready",
      body: "Your payslip for August 2026 is ready to view.",
      data: { type: "payslip_paid" },
    });
  });

  it("notifyDocAck interpolates docTitle", async () => {
    const { supabase } = makeSupabase();
    await notifyDocAck(supabase, { orgId: "org-1", employeeId: "emp-1", docTitle: "Code of Conduct" });
    expect(sendPushMock).toHaveBeenCalledWith(supabase, ["emp-1"], {
      title: "Action needed",
      body: "Code of Conduct needs your acknowledgment.",
      data: { type: "doc_ack" },
    });
  });
});
