import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }));

let db: FakeDb;
vi.mock("@/lib/supabase/server", () => ({ createAdminSupabase: () => createFakeSupabase(db) }));

let currentUser: any;
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => ["owner", "admin", "manager"].includes(role),
}));

import { deletePayrollRun } from "../../src/actions/payroll";

const ORG_A = "org-a";
const ORG_B = "org-b";
const ADMIN_A = "10000000-0000-4000-8000-000000000001";

const run = (id: string, org_id: string, status: string) => ({
  id, org_id, month: "2026-08", status, total_gross: 1000, total_deductions: 100, total_net: 900, employee_count: 1,
});
const entry = (id: string, org_id: string, payroll_run_id: string) => ({ id, org_id, payroll_run_id, employee_id: "e" });

beforeEach(() => {
  currentUser = { orgId: ORG_A, employeeId: ADMIN_A, role: "admin", clerkUserId: "c" };
  db = {
    payroll_runs: [run("run-a-draft", ORG_A, "draft"), run("run-a-processed", ORG_A, "processed"), run("run-b", ORG_B, "draft")],
    payroll_entries: [
      entry("ea1", ORG_A, "run-a-draft"),
      entry("ea2", ORG_A, "run-a-processed"),
      entry("eb1", ORG_B, "run-b"),
    ],
    disbursement_batches: [],
    payroll_audit_log: [],
  };
});

describe("deletePayrollRun", () => {
  it("deletes a draft, its entries, and records who deleted what", async () => {
    const res = await deletePayrollRun("run-a-draft");
    expect(res.success).toBe(true);
    expect(db.payroll_runs.map((r) => r.id)).toEqual(["run-a-processed", "run-b"]);
    expect(db.payroll_entries.map((e) => e.id)).toEqual(["ea2", "eb1"]);
    expect(db.payroll_audit_log).toHaveLength(1);
    expect(db.payroll_audit_log[0]).toMatchObject({
      org_id: ORG_A, entity: "run", entity_id: "run-a-draft", action: "delete", actor_employee_id: ADMIN_A,
    });
    expect(db.payroll_audit_log[0].old_value).toMatchObject({ month: "2026-08", status: "draft", entries: 1 });
  });

  it("refuses a processed (locked) run — reopen first", async () => {
    const res = await deletePayrollRun("run-a-processed");
    expect(res).toMatchObject({ success: false });
    expect((res as any).error).toMatch(/reopen/i);
    expect(db.payroll_runs).toHaveLength(3);
    expect(db.payroll_entries).toHaveLength(3);
    expect(db.payroll_audit_log).toHaveLength(0);
  });

  it("can't touch another company's run or its entries", async () => {
    const res = await deletePayrollRun("run-b");
    expect(res).toEqual({ success: false, error: "Payroll run not found" });
    expect(db.payroll_runs.find((r) => r.id === "run-b")).toBeTruthy();
    expect(db.payroll_entries.find((e) => e.id === "eb1")).toBeTruthy();
  });

  it("is admin-only", async () => {
    currentUser = { ...currentUser, role: "employee" };
    expect((await deletePayrollRun("run-a-draft")).success).toBe(false);
    expect(db.payroll_runs).toHaveLength(3);
  });
});
