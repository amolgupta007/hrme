import { describe, expect, it } from "vitest";
import { employeeIdsFromRow, employeeIdsSchema, employeeIdsToColumns, normalizeGenderOption } from "@/lib/employees/employee-ids";

describe("employee payroll & statutory IDs", () => {
  it("maps the gender spellings already in the data", () => {
    expect(normalizeGenderOption("female")).toBe("Female");
    expect(normalizeGenderOption("M")).toBe("Male");
    expect(normalizeGenderOption(null)).toBe("");
  });
  it("validates formats and stores blanks as null", () => {
    const ok = employeeIdsSchema.parse({
      ...employeeIdsFromRow({ employee_code: "007", gender: "Male", uan: "102389854276", pan_number: "abcde1234f" }),
    });
    expect(ok.pan).toBe("ABCDE1234F");
    const cols = employeeIdsToColumns(ok);
    expect(cols.employee_code).toBe("007");
    expect(cols.esic_number).toBeNull();
    expect(employeeIdsSchema.safeParse({ ...ok, uan: "123" }).success).toBe(false);
    expect(employeeIdsSchema.safeParse({ ...ok, esicNumber: "12345" }).success).toBe(false);
  });
});
