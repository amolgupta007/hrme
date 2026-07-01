import { describe, it, expect } from "vitest";
import {
  canApprovePunch,
  canVoidPunch,
  autoApproveOnAdd,
} from "@/lib/attendance/punch-permissions";

const admin = { role: "admin" as const, employeeId: "A", scopedEmployeeIds: [] };
const mgr = { role: "manager" as const, employeeId: "M", scopedEmployeeIds: ["E1"] };
const emp = { role: "employee" as const, employeeId: "E1", scopedEmployeeIds: [] };

describe("punch permissions", () => {
  it("admin approves anyone", () => expect(canApprovePunch(admin, "Z")).toBe(true));
  it("manager approves own-dept only", () => {
    expect(canApprovePunch(mgr, "E1")).toBe(true);
    expect(canApprovePunch(mgr, "E9")).toBe(false);
  });
  it("employee approves nobody", () => expect(canApprovePunch(emp, "E1")).toBe(false));
  it("only admin voids", () => {
    expect(canVoidPunch(admin)).toBe(true);
    expect(canVoidPunch(mgr)).toBe(false);
    expect(canVoidPunch(emp)).toBe(false);
  });
  it("admin-added punches auto-approve", () => {
    expect(autoApproveOnAdd(admin)).toBe(true);
    expect(autoApproveOnAdd(mgr)).toBe(false);
    expect(autoApproveOnAdd(emp)).toBe(false);
  });
});
