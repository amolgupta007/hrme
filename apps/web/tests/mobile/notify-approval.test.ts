import { describe, expect, it, vi, beforeEach } from "vitest";

const sendPushMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/mobile/push", () => ({
  sendPush: (...args: unknown[]) => sendPushMock(...args),
}));

import { notifyApprovalPending } from "@/lib/mobile/notify";

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

describe("notifyApprovalPending", () => {
  it("inserts a notifications row with type approval_pending + data.approvalType, and calls sendPush", async () => {
    const { supabase, insertCalls } = makeSupabase();

    await notifyApprovalPending(supabase, {
      orgId: "org-1",
      employeeId: "mgr-1",
      approvalType: "leave",
      title: "New leave request",
      body: "Asha Rao requested leave",
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0]).toBe("notifications");
    expect(insertCalls[0][1]).toMatchObject({
      org_id: "org-1",
      employee_id: "mgr-1",
      type: "approval_pending",
      title: "New leave request",
      body: "Asha Rao requested leave",
      data: { type: "approval_pending", approvalType: "leave" },
    });

    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock).toHaveBeenCalledWith(supabase, ["mgr-1"], {
      title: "New leave request",
      body: "Asha Rao requested leave",
      data: { type: "approval_pending", approvalType: "leave" },
    });
  });

  it.each(["regularization", "ot", "payroll"] as const)(
    "supports approvalType=%s",
    async (approvalType) => {
      const { supabase } = makeSupabase();
      await notifyApprovalPending(supabase, {
        orgId: "org-1",
        employeeId: "mgr-1",
        approvalType,
        title: "t",
        body: "b",
      });
      expect(sendPushMock).toHaveBeenCalledWith(supabase, ["mgr-1"], {
        title: "t",
        body: "b",
        data: { type: "approval_pending", approvalType },
      });
    }
  );

  it("still calls sendPush and resolves when the insert throws", async () => {
    const { supabase } = makeSupabase({ insertThrows: true });

    await expect(
      notifyApprovalPending(supabase, {
        orgId: "org-1",
        employeeId: "mgr-1",
        approvalType: "leave",
        title: "t",
        body: "b",
      })
    ).resolves.toBeUndefined();

    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });
});
