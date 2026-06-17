"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult, Employee, Department } from "@/types";
import { employeeSchema } from "@/lib/employees/employee-schema";
import { normalizePhone } from "@/lib/phone";
import { provisionPhoneOnlyUser } from "@/lib/clerk/provision-phone-user";

// ---- Helpers ----

/** Returns the internal Supabase org UUID and the Clerk org ID for the current user. */
async function getOrgIds(): Promise<{ internalOrgId: string; clerkOrgId: string } | null> {
  const { orgId, userId } = auth();

  // Resolve Clerk org ID — prefer session orgId, fall back to membership lookup
  let clerkOrgId = orgId ?? null;

  if (!clerkOrgId) {
    if (!userId) return null;
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    clerkOrgId = memberships.data[0]?.organization.id ?? null;
  }

  if (!clerkOrgId) return null;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!data) return null;
  return { internalOrgId: (data as { id: string }).id, clerkOrgId };
}

/** Convenience wrapper — returns just the internal Supabase org UUID. */
async function getOrgId(): Promise<string | null> {
  const ids = await getOrgIds();
  return ids?.internalOrgId ?? null;
}

// ---- Schemas ----

// ---- Actions ----

export async function listEmployees(): Promise<
  ActionResult<(Employee & { department_name: string | null; is_on_leave: boolean; invite_status: "none" | "sent" | "expired" | null })[]>
> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const today = new Date().toISOString().split("T")[0];

  const [empResult, leaveResult, inviteResult] = await Promise.all([
    supabase
      .from("employees")
      .select("*, departments!department_id(name)")
      .eq("org_id", orgId)
      .neq("status", "terminated")
      .order("created_at", { ascending: false }),
    supabase
      .from("leave_requests")
      .select("employee_id")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
    supabase
      .from("employee_invites")
      .select("employee_id, accepted_at, expires_at")
      .eq("org_id", orgId),
  ]);

  if (empResult.error) return { success: false, error: empResult.error.message };

  const onLeaveSet = new Set((leaveResult.data ?? []).map((r: any) => r.employee_id));

  const now = new Date();
  const inviteMap = new Map((inviteResult.data ?? []).map((r: any) => [r.employee_id, r]));

  const employees = (empResult.data ?? []).map((e: any) => {
    let invite_status: "none" | "sent" | "expired" | null = null;
    if (!e.clerk_user_id) {
      const invite = inviteMap.get(e.id);
      if (!invite) {
        invite_status = "none";
      } else if (invite.accepted_at) {
        invite_status = null;
      } else if (new Date(invite.expires_at) <= now) {
        invite_status = "expired";
      } else {
        invite_status = "sent";
      }
    }
    return {
      ...e,
      department_name: e.departments?.name ?? null,
      is_on_leave: onLeaveSet.has(e.id),
      invite_status,
    };
  });

  return { success: true, data: employees };
}

export async function listDepartments(): Promise<ActionResult<Department[]>> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", orgId)
    .order("name");

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function addEmployee(
  formData: z.infer<typeof employeeSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can add employees" };
  const ids = await getOrgIds();
  if (!ids) return { success: false, error: "Not authenticated" };

  const validated = employeeSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const email =
    validated.data.email && validated.data.email.trim() !== ""
      ? validated.data.email.trim()
      : null;
  const phone = normalizePhone(validated.data.phone);
  const isPhoneOnly = !email && !!phone;

  const supabase = createAdminSupabase();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, max_employees")
    .eq("clerk_org_id", ids.clerkOrgId)
    .single();

  if (orgError || !org) return { success: false, error: "Organization not found" };

  const typedOrg = org as { id: string; max_employees: number };

  const { count } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("org_id", typedOrg.id)
    .eq("status", "active");

  if ((count ?? 0) >= typedOrg.max_employees) {
    return {
      success: false,
      error: `Employee limit reached (${typedOrg.max_employees}). Upgrade your plan to add more.`,
    };
  }

  const { data, error } = await supabase
    .from("employees")
    .insert({
      org_id: typedOrg.id,
      first_name: validated.data.firstName,
      last_name: validated.data.lastName,
      email: email,
      phone: phone,
      department_id: validated.data.departmentId || null,
      designation: validated.data.designation || null,
      date_of_joining: validated.data.dateOfJoining,
      employment_type: validated.data.employmentType,
      role: validated.data.role,
      reporting_manager_id: validated.data.reportingManagerId || null,
      status: "active",
      metadata: {},
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const msg = `${error.message ?? ""} ${(error as any).details ?? ""}`;
      const isPhoneDup = msg.includes("employees_org_phone_unique") || /\bphone\b/.test(msg);
      return {
        success: false,
        error: `An employee with this ${isPhoneDup ? "phone number" : "email"} already exists`,
      };
    }
    return { success: false, error: error.message };
  }

  if (isPhoneOnly) {
    // Phone-only: provision the Clerk user + org membership directly and link synchronously.
    try {
      const client = await clerkClient();
      const { clerkUserId } = await provisionPhoneOnlyUser(client, {
        phoneE164: phone!,
        clerkOrgId: ids.clerkOrgId,
        role: validated.data.role,
      });
      await supabase
        .from("employees")
        .update({ clerk_user_id: clerkUserId })
        .eq("id", (data as { id: string }).id);
    } catch (provErr: any) {
      // Non-fatal: the employee row exists but Clerk linking failed (clerk_user_id stays null).
      // provisionPhoneOnlyUser is idempotent; recovery today is to delete and re-add the employee.
      // (A directory "retry provisioning" action is a known Phase-1 follow-up.)
      console.warn("Phone provisioning failed (non-fatal):", provErr?.message ?? provErr);
    }
  } else if (email) {
    // Has email: existing behaviour — Clerk org invitation.
    try {
      const client = await clerkClient();
      await client.organizations.createOrganizationInvitation({
        organizationId: ids.clerkOrgId,
        emailAddress: email,
        role: "org:member",
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard`,
      });
    } catch (inviteErr: any) {
      console.warn("Clerk invitation failed (non-fatal):", inviteErr?.message ?? inviteErr);
    }
  }

  revalidatePath("/dashboard/employees");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function updateEmployee(
  id: string,
  formData: z.infer<typeof employeeSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update employees" };
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const validated = employeeSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("employees")
    .update({
      first_name: validated.data.firstName,
      last_name: validated.data.lastName,
      email:
        validated.data.email && validated.data.email.trim() !== ""
          ? validated.data.email.trim()
          : null,
      phone: normalizePhone(validated.data.phone ?? null),
      department_id: validated.data.departmentId || null,
      designation: validated.data.designation || null,
      date_of_joining: validated.data.dateOfJoining,
      employment_type: validated.data.employmentType,
      role: validated.data.role,
      reporting_manager_id: validated.data.reportingManagerId || null,
    })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    if (error.code === "23505") {
      const msg = `${error.message ?? ""} ${(error as any).details ?? ""}`;
      const isPhoneDup = msg.includes("employees_org_phone_unique") || /\bphone\b/.test(msg);
      return {
        success: false,
        error: `An employee with this ${isPhoneDup ? "phone number" : "email"} already exists`,
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}

export async function terminateEmployee(id: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can terminate employees" };
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("employees")
    .update({ status: "terminated" })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { success: false, error: error.message };

  // Revoke pending Clerk invitation if one exists (best-effort)
  try {
    const { orgId: clerkOrgId, userId } = auth();
    const { data: invite } = await supabase
      .from("employee_invites")
      .select("clerk_invitation_id")
      .eq("employee_id", id)
      .is("accepted_at", null)
      .single();

    if (invite && (invite as any).clerk_invitation_id && clerkOrgId && userId) {
      const client = await clerkClient();
      await client.organizations.revokeOrganizationInvitation({
        organizationId: clerkOrgId,
        invitationId: (invite as any).clerk_invitation_id,
        requestingUserId: userId,
      });
    }
  } catch {
    // Best-effort — don't fail termination if invite revocation fails
  }

  // Delete the invite record regardless
  await supabase.from("employee_invites").delete().eq("employee_id", id);

  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}

export type ImportRow = {
  first_name: string;
  last_name: string;
  email?: string;
  role: "admin" | "manager" | "employee";
  employment_type: "full_time" | "part_time" | "contract" | "intern";
  date_of_joining: string;
  phone?: string;
  department?: string;
  designation?: string;
  date_of_birth?: string;
  reporting_manager_email?: string;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string; data: ImportRow }[];
};

export async function bulkImportEmployees(
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  // Resolve both internal org id and Clerk org id (needed for phone-only provisioning)
  const ids = await getOrgIds();
  if (!ids) return { success: false, error: "Organization not found" };
  const orgId = ids.internalOrgId;
  const clerkOrgId = ids.clerkOrgId;

  const supabase = createAdminSupabase();

  // Fetch plan limit
  const { data: org } = await supabase
    .from("organizations")
    .select("max_employees")
    .eq("id", orgId)
    .single();
  const maxEmployees = (org as any)?.max_employees ?? 10;

  // Fetch current active count
  const { count: currentCount } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("status", "terminated");
  const activeCount = currentCount ?? 0;

  const remainingSlots = maxEmployees - activeCount;

  // Fetch existing emails and phones in org (for duplicate detection)
  const { data: existingEmps } = await supabase
    .from("employees")
    .select("email, status, phone")
    .eq("org_id", orgId);
  const existingEmailMap = new Map(
    (existingEmps ?? [])
      .filter((e: any) => e.email != null)
      .map((e: any) => [e.email.toLowerCase(), e.status])
  );
  const existingPhoneSet = new Set<string>(
    (existingEmps ?? [])
      .map((e: any) => e.phone)
      .filter((p: any): p is string => !!p)
  );

  // Fetch departments (for name→id lookup)
  const { data: depts } = await supabase
    .from("departments")
    .select("id, name")
    .eq("org_id", orgId);
  const deptMap = new Map(
    (depts ?? []).map((d: any) => [d.name.toLowerCase(), d.id])
  );

  // Fetch existing employees for reporting_manager_email lookup
  const { data: managers } = await supabase
    .from("employees")
    .select("id, email")
    .eq("org_id", orgId)
    .neq("status", "terminated");
  const managerEmailMap = new Map(
    (managers ?? [])
      .filter((m: any) => m.email != null)
      .map((m: any) => [m.email.toLowerCase(), m.id])
  );

  const errors: ImportResult["errors"] = [];
  const toInsert: any[] = [];
  // Tracks phone-only rows so we can provision Clerk accounts after batch insert
  const phoneOnlyIndices: { insertIndex: number; phoneE164: string; role: "admin" | "manager" | "employee" }[] = [];
  const phoneOnlyPhonesSeen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    if (!row.first_name?.trim()) {
      errors.push({ row: rowNum, reason: "Missing first_name", data: row });
      continue;
    }
    if (!row.last_name?.trim()) {
      errors.push({ row: rowNum, reason: "Missing last_name", data: row });
      continue;
    }
    const rowEmail = row.email?.trim() || "";
    const rowPhone = normalizePhone(row.phone);
    const emailOk = rowEmail !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rowEmail);

    if (!emailOk && !rowPhone) {
      errors.push({ row: rowNum, reason: "Each row needs a valid email or phone", data: row });
      continue;
    }
    if (!["admin", "manager", "employee"].includes(row.role)) {
      errors.push({ row: rowNum, reason: `Invalid role "${row.role}" — must be admin, manager, or employee`, data: row });
      continue;
    }
    if (!["full_time", "part_time", "contract", "intern"].includes(row.employment_type)) {
      errors.push({ row: rowNum, reason: `Invalid employment_type "${row.employment_type}"`, data: row });
      continue;
    }
    if (!row.date_of_joining || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_joining)) {
      errors.push({ row: rowNum, reason: "Missing or invalid date_of_joining (use YYYY-MM-DD)", data: row });
      continue;
    }

    if (emailOk) {
      const emailLower = rowEmail.toLowerCase();
      const existingStatus = existingEmailMap.get(emailLower);
      if (existingStatus === "terminated") {
        errors.push({ row: rowNum, reason: "Email belongs to a terminated employee — re-activate manually", data: row });
        continue;
      }
      if (existingStatus) {
        errors.push({ row: rowNum, reason: "Email already exists in this organization", data: row });
        continue;
      }
    }

    if (toInsert.length >= remainingSlots) {
      errors.push({ row: rowNum, reason: `Plan limit reached (${maxEmployees} employees). Upgrade to import more.`, data: row });
      continue;
    }

    const departmentId = row.department
      ? (deptMap.get(row.department.toLowerCase()) ?? null)
      : null;
    const reportingManagerId = row.reporting_manager_email
      ? (managerEmailMap.get(row.reporting_manager_email.toLowerCase()) ?? null)
      : null;

    if (row.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)) {
      errors.push({ row: rowNum, reason: "Invalid date_of_birth format (use YYYY-MM-DD)", data: row });
      continue;
    }

    if (!emailOk && rowPhone) {
      if (existingPhoneSet.has(rowPhone) || phoneOnlyPhonesSeen.has(rowPhone)) {
        errors.push({ row: rowNum, reason: "Duplicate phone (already exists)", data: row });
        continue;
      }
    }

    // Track phone-only rows by their index in toInsert for post-insert provisioning
    const insertIndex = toInsert.length;
    toInsert.push({
      org_id: orgId,
      first_name: row.first_name.trim(),
      last_name: row.last_name.trim(),
      email: emailOk ? rowEmail.toLowerCase() : null,
      role: row.role,
      employment_type: row.employment_type,
      date_of_joining: row.date_of_joining,
      phone: rowPhone,
      department_id: departmentId,
      designation: row.designation?.trim() || null,
      date_of_birth: row.date_of_birth || null,
      reporting_manager_id: reportingManagerId,
      status: "active",
    });
    if (!emailOk && rowPhone) {
      phoneOnlyIndices.push({ insertIndex, phoneE164: rowPhone, role: row.role });
      phoneOnlyPhonesSeen.add(rowPhone); // prevent within-batch duplicate
    }
    if (emailOk) {
      existingEmailMap.set(rowEmail.toLowerCase(), "active"); // prevent within-batch duplicate
    }
  }

  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("employees")
      .insert(toInsert)
      .select("id, phone");
    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Provision Clerk accounts for phone-only rows (best-effort, non-fatal)
    if (phoneOnlyIndices.length > 0 && inserted) {
      const insertedRows = inserted as { id: string; phone: string | null }[];
      const client = await clerkClient();
      for (const { insertIndex, phoneE164, role } of phoneOnlyIndices) {
        const insertedRow = insertedRows[insertIndex];
        if (!insertedRow || insertedRow.phone !== phoneE164) {
          console.warn(`Import phone provisioning: positional mismatch at index ${insertIndex}; skipping back-fill`);
          continue;
        }
        try {
          const { clerkUserId } = await provisionPhoneOnlyUser(client, {
            phoneE164,
            clerkOrgId,
            role,
          });
          await supabase
            .from("employees")
            .update({ clerk_user_id: clerkUserId })
            .eq("id", insertedRow.id);
        } catch (e: any) {
          console.warn("Import phone provisioning failed (non-fatal):", e?.message ?? e);
        }
      }
    }
  }

  revalidatePath("/dashboard/employees");

  return {
    success: true,
    data: {
      imported: toInsert.length,
      skipped: errors.length,
      errors,
    },
  };
}
