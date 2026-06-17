import { z } from "zod";
import { isValidPhone } from "@/lib/phone";

export const employeeSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z
      .union([z.string().email("Invalid email address"), z.literal("")])
      .optional(),
    phone: z
      .string()
      .optional()
      .refine((v) => !v || v.trim() === "" || isValidPhone(v), "Invalid phone number"),
    departmentId: z.string().uuid().optional().or(z.literal("")),
    designation: z.string().optional(),
    dateOfJoining: z.string().min(1, "Date of joining is required"),
    employmentType: z.enum(["full_time", "part_time", "contract", "intern"]),
    role: z.enum(["admin", "manager", "employee"]),
    reportingManagerId: z.string().uuid().optional().or(z.literal("")),
  })
  .refine(
    (d) => (d.email && d.email.trim() !== "") || (d.phone && d.phone.trim() !== ""),
    { message: "Provide an email or a phone number", path: ["email"] }
  );

export type EmployeeFormData = z.infer<typeof employeeSchema>;
