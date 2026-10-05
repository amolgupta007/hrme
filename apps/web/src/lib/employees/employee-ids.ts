// Payroll & statutory identifiers an admin keeps on an employee (Employees →
// Add/Edit). Plain module — the dialog and the server action both import it.
import { z } from "zod";

export const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say", "Other"] as const;

const blank = z.literal("");
const digits = (n: string, msg: string) => z.union([blank, z.string().trim().regex(new RegExp(`^\\d{${n}}$`), msg)]);

export const employeeIdsSchema = z.object({
  employeeCode: z.string().trim().max(20, "Employee code is at most 20 characters"),
  gender: z.union([blank, z.enum(GENDER_OPTIONS)]),
  dateOfBirth: z.union([blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date of birth")]),
  pan: z.union([blank, z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN looks like ABCDE1234F")]),
  uan: digits("12", "UAN is 12 digits"),
  pfNumber: z.string().trim().max(30, "PF number is at most 30 characters"),
  esicNumber: digits("10,17", "ESIC number is 10–17 digits"),
  pran: digits("12", "PRAN is 12 digits"),
  nationality: z.string().trim().max(40),
  workLocation: z.string().trim().max(60),
});

export type EmployeeIds = z.infer<typeof employeeIdsSchema>;

export const EMPTY_EMPLOYEE_IDS: EmployeeIds = {
  employeeCode: "", gender: "", dateOfBirth: "", pan: "", uan: "", pfNumber: "", esicNumber: "", pran: "",
  nationality: "", workLocation: "",
};

/** Stored gender is free text from older paths ("female", "M"); map to an option. */
export function normalizeGenderOption(raw: string | null | undefined): EmployeeIds["gender"] {
  const g = raw?.trim().toLowerCase();
  if (!g) return "";
  if (g === "m" || g === "male") return "Male";
  if (g === "f" || g === "female") return "Female";
  return GENDER_OPTIONS.find((o) => o.toLowerCase() === g) ?? "Other";
}

/** Form values from an employees row. */
export function employeeIdsFromRow(row: Record<string, unknown>): EmployeeIds {
  const s = (k: string) => (typeof row[k] === "string" ? (row[k] as string) : "");
  return {
    employeeCode: s("employee_code"),
    gender: normalizeGenderOption(s("gender")),
    dateOfBirth: s("date_of_birth").slice(0, 10),
    pan: s("pan_number"),
    uan: s("uan"),
    pfNumber: s("pf_number"),
    esicNumber: s("esic_number"),
    pran: s("pran"),
    nationality: s("nationality"),
    workLocation: s("work_location"),
  };
}

/** employees columns from validated values (blank → null). */
export function employeeIdsToColumns(v: EmployeeIds) {
  return {
    employee_code: v.employeeCode || null,
    gender: v.gender || null,
    date_of_birth: v.dateOfBirth || null,
    pan_number: v.pan || null,
    uan: v.uan || null,
    pf_number: v.pfNumber || null,
    esic_number: v.esicNumber || null,
    pran: v.pran || null,
    nationality: v.nationality || null,
    work_location: v.workLocation || null,
  };
}
