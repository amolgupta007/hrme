import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";

// ---- Module mocks -------------------------------------------------------
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: () => new Map([["x-forwarded-for", "203.0.113.7, 10.0.0.1"], ["user-agent", "vitest"]]),
}));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }));

const notifyAckRequested = vi.fn(async () => {});
const emailAckReminders = vi.fn(async () => 0);
const emailNewAnnouncement = vi.fn(async () => 0);
vi.mock("@/lib/announcements/notify", () => ({
  notifyAckRequested: (...a: any[]) => (notifyAckRequested as any)(...a),
  emailAckReminders: (...a: any[]) => (emailAckReminders as any)(...a),
  emailNewAnnouncement: (...a: any[]) => (emailNewAnnouncement as any)(...a),
}));

let db: FakeDb;
vi.mock("@/lib/supabase/server", () => ({ createAdminSupabase: () => createFakeSupabase(db) }));

const ORG_A = "org-a";
const ORG_B = "org-b";
const ADMIN_A = "10000000-0000-4000-8000-000000000001";
const EMP_A1 = "10000000-0000-4000-8000-000000000002";
const EMP_A2 = "10000000-0000-4000-8000-000000000003";
const EMP_B1 = "20000000-0000-4000-8000-000000000001";
const DEPT_A = "30000000-0000-4000-8000-000000000001";
const DEPT_B = "30000000-0000-4000-8000-000000000002";

let currentUser: any;
const asUser = (orgId: string, employeeId: string, role: string) => {
  currentUser = { orgId, orgName: orgId, employeeId, role, clerkUserId: `clerk-${employeeId}` };
};
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => ["owner", "admin", "manager"].includes(role),
}));

import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  acknowledgeAnnouncement,
  listAnnouncements,
  getAnnouncementAckStatus,
  addLateJoiners,
  remindAnnouncementAck,
} from "../../src/actions/announcements";

const emp = (id: string, org_id: string, department_id: string | null, extra: object = {}) => ({
  id,
  org_id,
  first_name: id.slice(-4),
  last_name: "X",
  email: `${id}@x.test`,
  department_id,
  status: "active",
  avatar_url: null,
  ...extra,
});

beforeEach(() => {
  db = {
    employees: [
      emp(ADMIN_A, ORG_A, null),
      emp(EMP_A1, ORG_A, DEPT_A),
      emp(EMP_A2, ORG_A, null),
      emp(EMP_B1, ORG_B, DEPT_B),
    ],
    departments: [
      { id: DEPT_A, org_id: ORG_A, name: "Engineering" },
      { id: DEPT_B, org_id: ORG_B, name: "Sales" },
    ],
    announcements: [],
  };
  notifyAckRequested.mockClear();
  emailAckReminders.mockClear();
  emailNewAnnouncement.mockClear();
  asUser(ORG_A, ADMIN_A, "admin");
});

const base = { title: "New leave policy", body: "Please read.", is_pinned: false };

async function publishAckRequired(extra: object = {}) {
  const res = await createAnnouncement({ ...base, ack_required: true, ...extra });
  expect(res.success).toBe(true);
  return (res as any).data.id as string;
}

describe("createAnnouncement", () => {
  it("only admins can post", async () => {
    asUser(ORG_A, EMP_A1, "employee");
    expect(await createAnnouncement(base)).toMatchObject({ success: false });
    asUser(ORG_A, EMP_A1, "manager");
    expect(await createAnnouncement(base)).toMatchObject({ success: false });
  });

  it("snapshots every current employee for an 'Everyone' ack announcement — own org only", async () => {
    const id = await publishAckRequired();
    const recips = db.announcement_recipients.filter((r) => r.announcement_id === id);
    expect(recips.map((r) => r.employee_id).sort()).toEqual([ADMIN_A, EMP_A1, EMP_A2].sort());
    expect(recips.every((r) => r.org_id === ORG_A)).toBe(true);
    expect(db.announcement_versions).toHaveLength(1);
    expect(notifyAckRequested).toHaveBeenCalledTimes(1);
  });

  it("does not snapshot when acknowledgement isn't required", async () => {
    await createAnnouncement(base);
    expect(db.announcement_recipients ?? []).toHaveLength(0);
  });

  it("targeted: snapshots only the chosen department ∪ employees", async () => {
    const id = await publishAckRequired({
      audience_type: "targeted",
      targets: [
        { target_type: "department", target_id: DEPT_A },
        { target_type: "employee", target_id: EMP_A2 },
      ],
    });
    const recips = db.announcement_recipients.filter((r) => r.announcement_id === id).map((r) => r.employee_id);
    expect(recips.sort()).toEqual([EMP_A1, EMP_A2].sort());
  });

  it("rejects targets from another org (department or employee)", async () => {
    const r1 = await createAnnouncement({
      ...base,
      audience_type: "targeted",
      targets: [{ target_type: "department", target_id: DEPT_B }],
    });
    const r2 = await createAnnouncement({
      ...base,
      audience_type: "targeted",
      targets: [{ target_type: "employee", target_id: EMP_B1 }],
    });
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
    expect(db.announcements).toHaveLength(0);
  });

  it("emails everyone in the org except the author on publish — even without ack", async () => {
    await createAnnouncement(base);
    await new Promise((r) => setTimeout(r, 0));
    expect(emailNewAnnouncement).toHaveBeenCalledTimes(1);
    const args = (emailNewAnnouncement.mock.calls[0] as any[])[0];
    expect(args.recipients.map((r: any) => r.id).sort()).toEqual([EMP_A1, EMP_A2].sort());
    expect(args).toMatchObject({ title: base.title, body: base.body, ackRequired: false, orgName: ORG_A });
  });

  it("targeted publish emails only the chosen audience, excluding leavers", async () => {
    db.employees.push(emp("10000000-0000-4000-8000-000000000009", ORG_A, DEPT_A, { status: "terminated" }));
    await publishAckRequired({
      audience_type: "targeted",
      targets: [{ target_type: "department", target_id: DEPT_A }],
      ack_due_date: "2099-01-05",
    });
    await new Promise((r) => setTimeout(r, 0));
    const args = (emailNewAnnouncement.mock.calls[0] as any[])[0];
    expect(args.recipients.map((r: any) => r.id)).toEqual([EMP_A1]);
    expect(args).toMatchObject({ ackRequired: true, dueDateLabel: "5 Jan 2099" });
  });

  it("targeted with no targets is rejected", async () => {
    const res = await createAnnouncement({ ...base, audience_type: "targeted", targets: [] });
    expect(res).toMatchObject({ success: false });
  });

  it("rejects a past due date", async () => {
    const res = await createAnnouncement({ ...base, ack_required: true, ack_due_date: "2020-01-01" });
    expect(res).toMatchObject({ success: false });
  });
});

describe("acknowledgeAnnouncement", () => {
  it("records version, IP (first hop) and user agent", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    const res = await acknowledgeAnnouncement(id);
    expect(res.success).toBe(true);
    expect(db.announcement_acknowledgements).toEqual([
      expect.objectContaining({
        org_id: ORG_A,
        announcement_id: id,
        employee_id: EMP_A1,
        version: 1,
        ip_address: "203.0.113.7",
        user_agent: "vitest",
      }),
    ]);
  });

  it("is idempotent — a double click leaves exactly one row and still succeeds", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    const [a, b] = await Promise.all([acknowledgeAnnouncement(id), acknowledgeAnnouncement(id)]);
    expect(a.success && b.success).toBe(true);
    expect(db.announcement_acknowledgements).toHaveLength(1);
  });

  it("cross-tenant: an employee of org B cannot acknowledge org A's announcement", async () => {
    const id = await publishAckRequired();
    asUser(ORG_B, EMP_B1, "admin");
    const res = await acknowledgeAnnouncement(id);
    expect(res).toMatchObject({ success: false, error: "Announcement not found" });
    expect(db.announcement_acknowledgements ?? []).toHaveLength(0);
  });

  it("a non-recipient in the same org cannot acknowledge", async () => {
    const id = await publishAckRequired({
      audience_type: "targeted",
      targets: [{ target_type: "employee", target_id: EMP_A1 }],
    });
    asUser(ORG_A, EMP_A2, "employee");
    expect(await acknowledgeAnnouncement(id)).toMatchObject({ success: false });
  });
});

describe("cross-tenant reads", () => {
  it("org B's admin sees none of org A's announcements or ack status", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    await acknowledgeAnnouncement(id);

    asUser(ORG_B, EMP_B1, "admin");
    const list = await listAnnouncements();
    expect(list).toEqual({ success: true, data: [] });
    expect(await getAnnouncementAckStatus(id)).toMatchObject({ success: false });
    expect(await remindAnnouncementAck(id)).toMatchObject({ success: false });
    expect(await addLateJoiners(id)).toMatchObject({ success: false });
    expect(await deleteAnnouncement(id)).toMatchObject({ success: true }); // no-op: filtered by org
    expect(db.announcements.find((a) => a.id === id)?.archived_at ?? null).toBeNull();
    expect(db.announcements.some((a) => a.id === id)).toBe(true);
  });

  it("employees cannot read ack status", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    expect(await getAnnouncementAckStatus(id)).toMatchObject({ success: false, error: "Unauthorized" });
  });
});

describe("listAnnouncements visibility + my_ack", () => {
  it("hides targeted announcements from people outside the audience", async () => {
    await createAnnouncement({
      ...base,
      audience_type: "targeted",
      targets: [{ target_type: "department", target_id: DEPT_A }],
    });
    asUser(ORG_A, EMP_A2, "employee");
    expect((await listAnnouncements() as any).data).toHaveLength(0);
    asUser(ORG_A, EMP_A1, "employee");
    expect((await listAnnouncements() as any).data).toHaveLength(1);
  });

  it("reports the viewer's pending → acknowledged state", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    expect((await listAnnouncements() as any).data[0].my_ack.state).toBe("pending");
    await acknowledgeAnnouncement(id);
    expect((await listAnnouncements() as any).data[0].my_ack.state).toBe("acknowledged");
  });
});

describe("edits after publish", () => {
  it("a content edit re-requires acknowledgement by default; old acks are kept", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    await acknowledgeAnnouncement(id);

    asUser(ORG_A, ADMIN_A, "admin");
    const res = await updateAnnouncement(id, { ...base, body: "Materially different.", ack_required: true });
    expect(res).toEqual({ success: true, data: { reackTriggered: true } });

    const status = (await getAnnouncementAckStatus(id) as any).data;
    expect(status.rows.find((r: any) => r.employee_id === EMP_A1).state).toBe("pending");
    expect(db.announcement_acknowledgements).toHaveLength(1); // audit row survives
    expect(db.announcement_versions).toHaveLength(2);

    // Found in the browser walkthrough: after a re-ack, the current-version
    // count is 0 but delete must still be presented (and act) as an archive.
    const [listed] = (await listAnnouncements() as any).data;
    expect(listed.ack_totals.acknowledged).toBe(0);
    expect(listed.has_ack_records).toBe(true);
    expect(await deleteAnnouncement(id)).toEqual({ success: true, data: { archived: true } });
  });

  it("'minor fix' keeps existing acknowledgements", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    await acknowledgeAnnouncement(id);
    asUser(ORG_A, ADMIN_A, "admin");
    const res = await updateAnnouncement(
      id,
      { ...base, body: "Please read!", ack_required: true },
      { requireReack: false }
    );
    expect(res).toEqual({ success: true, data: { reackTriggered: false } });
    const status = (await getAnnouncementAckStatus(id) as any).data;
    expect(status.rows.find((r: any) => r.employee_id === EMP_A1).state).toBe("acknowledged");
  });

  it("a pin-only change doesn't bump the version or reset acks", async () => {
    const id = await publishAckRequired();
    const res = await updateAnnouncement(id, { ...base, is_pinned: true, ack_required: true });
    expect(res).toEqual({ success: true, data: { reackTriggered: false } });
    expect(db.announcement_versions).toHaveLength(1);
  });

  it("turning acknowledgement on after publishing snapshots the audience then", async () => {
    const res = await createAnnouncement(base);
    const id = (res as any).data.id;
    expect(await updateAnnouncement(id, { ...base, ack_required: true })).toMatchObject({ success: true });
    expect(db.announcement_recipients.filter((r) => r.announcement_id === id)).toHaveLength(3);
  });

  it("edits never re-send the new-announcement email", async () => {
    const id = await publishAckRequired();
    await updateAnnouncement(id, { ...base, body: "Materially different.", ack_required: true });
    await updateAnnouncement(id, { ...base, ack_required: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(emailNewAnnouncement).toHaveBeenCalledTimes(1);
  });
});

describe("late joiners + leavers", () => {
  it("lists nobody when nobody joined, then offers + adds a new joiner", async () => {
    const id = await publishAckRequired();
    expect((await getAnnouncementAckStatus(id) as any).data.late_joiners).toEqual([]);

    db.employees.push(emp("10000000-0000-4000-8000-000000000009", ORG_A, null));
    const status = (await getAnnouncementAckStatus(id) as any).data;
    expect(status.late_joiners).toHaveLength(1);

    expect(await addLateJoiners(id)).toEqual({ success: true, data: { added: 1 } });
    expect((await getAnnouncementAckStatus(id) as any).data.late_joiners).toEqual([]);
  });

  it("a terminated recipient drops out of the denominator", async () => {
    const id = await publishAckRequired();
    db.employees.find((e) => e.id === EMP_A2)!.status = "terminated";
    const { totals } = (await getAnnouncementAckStatus(id) as any).data;
    expect(totals).toMatchObject({ total: 2, left: 1 });
  });
});

describe("delete", () => {
  it("hard-deletes when nobody acknowledged", async () => {
    const id = await publishAckRequired();
    expect(await deleteAnnouncement(id)).toEqual({ success: true, data: { archived: false } });
    expect(db.announcements).toHaveLength(0);
  });

  it("archives (keeps the audit trail) once someone acknowledged", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    await acknowledgeAnnouncement(id);
    asUser(ORG_A, ADMIN_A, "admin");
    expect(await deleteAnnouncement(id)).toEqual({ success: true, data: { archived: true } });
    expect(db.announcements[0].archived_at).toBeTruthy();
    expect((await listAnnouncements() as any).data).toHaveLength(0);
  });
});

describe("remindAnnouncementAck", () => {
  it("reminds only pending people and then enforces the 24h cooldown", async () => {
    const id = await publishAckRequired();
    asUser(ORG_A, EMP_A1, "employee");
    await acknowledgeAnnouncement(id);
    asUser(ORG_A, ADMIN_A, "admin");

    const first = await remindAnnouncementAck(id);
    expect(first).toMatchObject({ success: true, data: { reminded: 2, skippedCooldown: 0 } });
    const second = await remindAnnouncementAck(id);
    expect(second).toMatchObject({ success: true, data: { reminded: 0, skippedCooldown: 2 } });
    expect(db.announcement_recipients.find((r) => r.employee_id === EMP_A2)!.reminder_count).toBe(1);
  });

  it("per-employee reminder targets just that person", async () => {
    const id = await publishAckRequired();
    const res = await remindAnnouncementAck(id, [EMP_A2]);
    expect(res).toMatchObject({ success: true, data: { reminded: 1 } });
  });
});
