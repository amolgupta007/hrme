"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import type { WeekOffPolicy, WeekOffOverride } from "@/lib/attendance/week-off";

const Schema = z.object({
  week_type: z.union([z.literal(5), z.literal(6)]),
  off_days: z.array(z.number().int().min(0).max(6)).min(1).max(2),
  alt_saturday_rule: z.enum(["none", "odd_off", "even_off"]).default("none"),
});

export async function getWeekOffPolicy(): Promise<ActionResult<WeekOffPolicy | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("week_off_policy")
    .select("week_type, off_days, alt_saturday_rule")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const policy: WeekOffPolicy | null = data
    ? {
        week_type: (data as any).week_type,
        off_days: (data as any).off_days,
        alt_saturday_rule:
          ((data as any).alt_saturday_rule as "none" | "odd_off" | "even_off" | null) ?? "none",
      }
    : null;
  return { success: true, data: policy };
}

export async function upsertWeekOffPolicy(input: unknown): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update week-off policy" };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Sanity: 5-day week → at least 2 off days; 6-day → exactly 1 off day.
  if (parsed.data.week_type === 5 && parsed.data.off_days.length !== 2) {
    return { success: false, error: "5-day week must pick exactly 2 off days" };
  }
  if (parsed.data.week_type === 6 && parsed.data.off_days.length !== 1) {
    return { success: false, error: "6-day week must pick exactly 1 off day" };
  }

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("week_off_policy")
    .upsert(
      {
        org_id: user.orgId,
        week_type: parsed.data.week_type,
        off_days: parsed.data.off_days,
        alt_saturday_rule: parsed.data.alt_saturday_rule,
      } as any,
      { onConflict: "org_id" }
    );
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Per-employee week-off overrides
// ---------------------------------------------------------------------------

export type EmployeeWeekOffOverrideRow = WeekOffOverride & {
  id: string;
  employee_id: string;
  employee_name: string;
  effective_from: string;
};

const OverrideSchema = z.object({
  employee_id: z.string().uuid(),
  week_type: z.union([z.literal(5), z.literal(6)]),
  off_days: z.array(z.number().int().min(0).max(6)).min(1).max(2),
  alt_saturday_rule: z.enum(["none", "odd_off", "even_off"]).default("none"),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Read the week-off override for one employee.
 * Admins can read any employee; employees can only read their own.
 */
export async function getEmployeeWeekOffOverride(
  employeeId: string
): Promise<ActionResult<WeekOffOverride | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role) && user.employeeId !== employeeId) {
    return { success: false, error: "Unauthorized" };
  }
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("employee_week_off_override")
    .select("week_type, off_days, alt_saturday_rule")
    .eq("org_id", user.orgId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, data: null };
  return {
    success: true,
    data: {
      week_type: (data as any).week_type,
      off_days: (data as any).off_days,
      alt_saturday_rule:
        ((data as any).alt_saturday_rule as "none" | "odd_off" | "even_off" | null) ?? "none",
    },
  };
}

/**
 * Create or update a per-employee week-off override. Admin-only.
 * Cross-tenant guard: verifies the target employee belongs to the caller's org.
 */
export async function upsertEmployeeWeekOffOverride(
  input: z.infer<typeof OverrideSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can set week-off overrides" };

  const parsed = OverrideSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  if (parsed.data.week_type === 5 && parsed.data.off_days.length !== 2) {
    return { success: false, error: "5-day week must pick exactly 2 off days" };
  }
  if (parsed.data.week_type === 6 && parsed.data.off_days.length !== 1) {
    return { success: false, error: "6-day week must pick exactly 1 off day" };
  }

  const sb = createAdminSupabase();

  // Cross-tenant guard: confirm the employee belongs to the caller's org.
  const { data: empOk } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("id", parsed.data.employee_id)
    .maybeSingle();
  if (!empOk) return { success: false, error: "Employee not found in your organisation" };

  const { error } = await sb
    .from("employee_week_off_override")
    .upsert(
      {
        org_id: user.orgId,
        employee_id: parsed.data.employee_id,
        week_type: parsed.data.week_type,
        off_days: parsed.data.off_days,
        alt_saturday_rule: parsed.data.alt_saturday_rule,
        effective_from: parsed.data.effective_from,
        created_by: user.employeeId ?? null,
      } as any,
      { onConflict: "employee_id" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

/**
 * Remove the week-off override for an employee, reverting them to the org policy. Admin-only.
 */
export async function deleteEmployeeWeekOffOverride(employeeId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can remove week-off overrides" };
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("employee_week_off_override")
    .delete()
    .eq("org_id", user.orgId)
    .eq("employee_id", employeeId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

/**
 * List all per-employee week-off overrides for the org, joined with employee name. Admin-only.
 */
export async function listAllWeekOffOverrides(): Promise<ActionResult<EmployeeWeekOffOverrideRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can list week-off overrides" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("employee_week_off_override")
    .select(
      "id, employee_id, week_type, off_days, alt_saturday_rule, effective_from, employees!employee_id(first_name, last_name)"
    )
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employees
        ? `${r.employees.first_name} ${r.employees.last_name}`
        : "Unknown",
      week_type: r.week_type,
      off_days: r.off_days,
      alt_saturday_rule:
        (r.alt_saturday_rule as "none" | "odd_off" | "even_off" | null) ?? "none",
      effective_from: r.effective_from,
    })),
  };
}

// ---------------------------------------------------------------------------
// Per-department week-off overrides
// Precedence at resolve time: employee override > department override > org policy.
// ---------------------------------------------------------------------------

export type DepartmentWeekOffOverrideRow = WeekOffOverride & {
  id: string;
  department_id: string;
  department_name: string;
  effective_from: string;
};

const DeptOverrideSchema = z.object({
  department_id: z.string().uuid(),
  week_type: z.union([z.literal(5), z.literal(6)]),
  off_days: z.array(z.number().int().min(0).max(6)).min(1).max(2),
  alt_saturday_rule: z.enum(["none", "odd_off", "even_off"]).default("none"),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Read the week-off override for one department. Admin-only. */
export async function getDepartmentWeekOffOverride(
  departmentId: string
): Promise<ActionResult<WeekOffOverride | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("department_week_off_override")
    .select("week_type, off_days, alt_saturday_rule")
    .eq("org_id", user.orgId)
    .eq("department_id", departmentId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, data: null };
  return {
    success: true,
    data: {
      week_type: (data as any).week_type,
      off_days: (data as any).off_days,
      alt_saturday_rule:
        ((data as any).alt_saturday_rule as "none" | "odd_off" | "even_off" | null) ?? "none",
    },
  };
}

/**
 * Create or update a per-department week-off override. Admin-only.
 * Cross-tenant guard: verifies the target department belongs to the caller's org.
 */
export async function upsertDepartmentWeekOffOverride(
  input: z.infer<typeof DeptOverrideSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can set week-off overrides" };

  const parsed = DeptOverrideSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  if (parsed.data.week_type === 5 && parsed.data.off_days.length !== 2) {
    return { success: false, error: "5-day week must pick exactly 2 off days" };
  }
  if (parsed.data.week_type === 6 && parsed.data.off_days.length !== 1) {
    return { success: false, error: "6-day week must pick exactly 1 off day" };
  }

  const sb = createAdminSupabase();

  // Cross-tenant guard: confirm the department belongs to the caller's org.
  const { data: deptOk } = await sb
    .from("departments")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("id", parsed.data.department_id)
    .maybeSingle();
  if (!deptOk) return { success: false, error: "Department not found in your organisation" };

  const { error } = await sb
    .from("department_week_off_override")
    .upsert(
      {
        org_id: user.orgId,
        department_id: parsed.data.department_id,
        week_type: parsed.data.week_type,
        off_days: parsed.data.off_days,
        alt_saturday_rule: parsed.data.alt_saturday_rule,
        effective_from: parsed.data.effective_from,
        created_by: user.employeeId ?? null,
      } as any,
      { onConflict: "department_id" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

/** Remove the week-off override for a department, reverting it to the org policy. Admin-only. */
export async function deleteDepartmentWeekOffOverride(departmentId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can remove week-off overrides" };
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("department_week_off_override")
    .delete()
    .eq("org_id", user.orgId)
    .eq("department_id", departmentId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/attendance");
  return { success: true, data: undefined };
}

/** List all per-department week-off overrides for the org, joined with department name. Admin-only. */
export async function listAllDepartmentWeekOffOverrides(): Promise<ActionResult<DepartmentWeekOffOverrideRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can list week-off overrides" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("department_week_off_override")
    .select(
      "id, department_id, week_type, off_days, alt_saturday_rule, effective_from, departments!department_id(name)"
    )
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      department_id: r.department_id,
      department_name: r.departments ? r.departments.name : "Unknown",
      week_type: r.week_type,
      off_days: r.off_days,
      alt_saturday_rule:
        (r.alt_saturday_rule as "none" | "odd_off" | "even_off" | null) ?? "none",
      effective_from: r.effective_from,
    })),
  };
}
