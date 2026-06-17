import { describe, it, expect } from "vitest";
import { employeeSchema } from "@/lib/employees/employee-schema";

const base = {
  firstName: "Asha",
  lastName: "Rao",
  dateOfJoining: "2026-06-01",
  employmentType: "full_time",
  role: "employee",
};

describe("employeeSchema identity refinement", () => {
  it("accepts an email with no phone", () => {
    const r = employeeSchema.safeParse({ ...base, email: "asha@x.com" });
    expect(r.success).toBe(true);
  });
  it("accepts a phone with no email", () => {
    const r = employeeSchema.safeParse({ ...base, phone: "9876543210" });
    expect(r.success).toBe(true);
  });
  it("rejects when both email and phone are missing", () => {
    const r = employeeSchema.safeParse({ ...base });
    expect(r.success).toBe(false);
  });
  it("rejects an invalid email when no phone given", () => {
    const r = employeeSchema.safeParse({ ...base, email: "not-an-email" });
    expect(r.success).toBe(false);
  });
  it("rejects an invalid phone when no email given", () => {
    const r = employeeSchema.safeParse({ ...base, phone: "123" });
    expect(r.success).toBe(false);
  });
});
