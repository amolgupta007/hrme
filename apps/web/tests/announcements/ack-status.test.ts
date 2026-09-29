import { describe, it, expect } from "vitest";
import {
  resolveAudienceIds,
  computeAckStatus,
  findLateJoiners,
  canRemind,
  splitRemindable,
  isContentChanged,
  isOverdue,
  REMIND_COOLDOWN_MS,
} from "@/lib/announcements/ack-status";

const emp = (id: string, department_id: string | null = null, status = "active") => ({
  id,
  department_id,
  status,
});

describe("resolveAudienceIds", () => {
  const employees = [emp("e1", "d1"), emp("e2", "d2"), emp("e3", null), emp("e4", "d1", "terminated")];

  it("'all' = every non-left employee", () => {
    expect([...resolveAudienceIds({ audienceType: "all", targets: [], employees })].sort()).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
  });

  it("'all' ignores any targets passed", () => {
    const ids = resolveAudienceIds({
      audienceType: "all",
      targets: [{ target_type: "employee", target_id: "e1" }],
      employees,
    });
    expect(ids.size).toBe(3);
  });

  it("'targeted' = departments ∪ employees, excluding people who left", () => {
    const ids = resolveAudienceIds({
      audienceType: "targeted",
      targets: [
        { target_type: "department", target_id: "d1" },
        { target_type: "employee", target_id: "e3" },
      ],
      employees,
    });
    expect([...ids].sort()).toEqual(["e1", "e3"]);
  });

  it("on_leave staff are still in the audience; inactive are not", () => {
    const ids = resolveAudienceIds({
      audienceType: "all",
      targets: [],
      employees: [emp("a", null, "on_leave"), emp("b", null, "inactive")],
    });
    expect([...ids]).toEqual(["a"]);
  });
});

describe("computeAckStatus", () => {
  const employees = [emp("e1"), emp("e2"), emp("e3"), emp("e4", null, "terminated")];
  const recipients = ["e1", "e2", "e3", "e4"].map((employee_id) => ({ employee_id }));

  it("pending means no ack at or after ack_version", () => {
    const s = computeAckStatus({
      recipients,
      acks: [
        { employee_id: "e1", version: 2, acknowledged_at: "2026-09-01T10:00:00Z" },
        { employee_id: "e2", version: 1, acknowledged_at: "2026-08-01T10:00:00Z" },
      ],
      employees,
      ackVersion: 2,
      dueDate: null,
      todayIst: "2026-09-30",
    });
    const byId = Object.fromEntries(s.rows.map((r) => [r.employeeId, r.state]));
    expect(byId).toEqual({ e1: "acknowledged", e2: "pending", e3: "pending", e4: "left" });
    // Left recipients are outside the denominator.
    expect(s.totals).toEqual({ total: 3, acknowledged: 1, pending: 2, overdue: 0, left: 1 });
  });

  it("pending becomes overdue after the due date (IST day precision)", () => {
    const base = { recipients: [{ employee_id: "e1" }], acks: [], employees, ackVersion: 1 };
    expect(computeAckStatus({ ...base, dueDate: "2026-09-30", todayIst: "2026-09-30" }).rows[0].state).toBe("pending");
    const late = computeAckStatus({ ...base, dueDate: "2026-09-29", todayIst: "2026-09-30" });
    expect(late.rows[0].state).toBe("overdue");
    // Overdue is a subset of pending in the totals.
    expect(late.totals).toMatchObject({ pending: 1, overdue: 1 });
  });

  it("a left employee's ack is kept and shown, but they stay out of the denominator", () => {
    const s = computeAckStatus({
      recipients: [{ employee_id: "e4" }],
      acks: [{ employee_id: "e4", version: 1, acknowledged_at: "2026-09-01T10:00:00Z" }],
      employees,
      ackVersion: 1,
      dueDate: null,
      todayIst: "2026-09-30",
    });
    expect(s.rows[0]).toMatchObject({ state: "left", acknowledgedAt: "2026-09-01T10:00:00Z" });
    expect(s.totals.total).toBe(0);
  });

  it("an ack of a later content version (minor edit) satisfies ack_version", () => {
    const s = computeAckStatus({
      recipients: [{ employee_id: "e1" }],
      acks: [{ employee_id: "e1", version: 3, acknowledged_at: "2026-09-02T00:00:00Z" }],
      employees,
      ackVersion: 2,
      dueDate: null,
      todayIst: "2026-09-30",
    });
    expect(s.rows[0].state).toBe("acknowledged");
  });

  it("uses the latest ack at the current version", () => {
    const s = computeAckStatus({
      recipients: [{ employee_id: "e1" }],
      acks: [{ employee_id: "e1", version: 3, acknowledged_at: "2026-09-02T00:00:00Z" }],
      employees,
      ackVersion: 3,
      dueDate: null,
      todayIst: "2026-09-30",
    });
    expect(s.rows[0].acknowledgedAt).toBe("2026-09-02T00:00:00Z");
  });
});

describe("findLateJoiners", () => {
  it("returns audience members who are not in the snapshot", () => {
    expect(findLateJoiners(new Set(["a", "b", "c"]), ["a", "b"])).toEqual(["c"]);
  });
  it("is empty when nobody new joined", () => {
    expect(findLateJoiners(new Set(["a"]), ["a", "z"])).toEqual([]);
  });
});

describe("reminder cooldown", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  it("allows a never-reminded recipient", () => {
    expect(canRemind(null, now)).toBe(true);
  });
  it("blocks within 24h and allows after", () => {
    expect(canRemind(new Date(now.getTime() - REMIND_COOLDOWN_MS + 1000).toISOString(), now)).toBe(false);
    expect(canRemind(new Date(now.getTime() - REMIND_COOLDOWN_MS).toISOString(), now)).toBe(true);
  });
  it("splitRemindable partitions by cooldown", () => {
    const out = splitRemindable(
      [
        { employee_id: "a", last_reminded_at: null },
        { employee_id: "b", last_reminded_at: "2026-09-30T06:00:00Z" },
      ],
      now
    );
    expect(out).toEqual({ remind: ["a"], cooldown: ["b"] });
  });
});

describe("isContentChanged", () => {
  it("detects title/body changes, ignoring surrounding whitespace", () => {
    const prev = { title: "Policy", body: "Read this" };
    expect(isContentChanged(prev, { title: "Policy ", body: "Read this\n" })).toBe(false);
    expect(isContentChanged(prev, { title: "Policy v2", body: "Read this" })).toBe(true);
    expect(isContentChanged(prev, { title: "Policy", body: "Read that" })).toBe(true);
  });
});

describe("isOverdue", () => {
  it("is false with no due date", () => {
    expect(isOverdue(null, "2026-09-30")).toBe(false);
  });
  it("is true only strictly after the due date", () => {
    expect(isOverdue("2026-09-30", "2026-09-30")).toBe(false);
    expect(isOverdue("2026-09-29", "2026-09-30")).toBe(true);
  });
});

import { isVisibleTo } from "@/lib/announcements/ack-status";

describe("isVisibleTo", () => {
  const viewer = { id: "e1", department_id: "d1" };
  const base = { isAdmin: false, audienceType: "targeted" as const, targets: [], viewer, isRecipient: false };

  it("admins and 'all' announcements are always visible", () => {
    expect(isVisibleTo({ ...base, isAdmin: true })).toBe(true);
    expect(isVisibleTo({ ...base, audienceType: "all" })).toBe(true);
  });
  it("targeted: visible via department or direct employee target", () => {
    expect(isVisibleTo({ ...base, targets: [{ target_type: "department", target_id: "d1" }] })).toBe(true);
    expect(isVisibleTo({ ...base, targets: [{ target_type: "employee", target_id: "e1" }] })).toBe(true);
    expect(isVisibleTo({ ...base, targets: [{ target_type: "department", target_id: "d2" }] })).toBe(false);
  });
  it("a snapshot recipient keeps visibility after moving department", () => {
    expect(
      isVisibleTo({ ...base, targets: [{ target_type: "department", target_id: "d2" }], isRecipient: true })
    ).toBe(true);
  });
  it("a viewer with no department never matches a department target", () => {
    expect(
      isVisibleTo({
        ...base,
        viewer: { id: "e1", department_id: null },
        targets: [{ target_type: "department", target_id: "d1" }],
      })
    ).toBe(false);
  });
});
