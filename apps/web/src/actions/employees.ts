"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { enqueueDeleteForEmployee } from "@/lib/attendance/device-provisioning";
import type { ActionResult, Employee, Department, UserRole } from "@/types";
import { employeeSchema } from "@/lib/employees/employee-schema";
import { normalizePhone } from "@/lib/phone";
import { provisionPhoneOnlyUser, syncEmployeeAuthIdentifiers } from "@/lib/clerk/provision-phone-user";
import { sendAccountSetupInvite } from "@/lib/invites/send-account-setup";
import { sendInvite } from "./invites";

// ---- Helpers ----

/** Returns the internal Supabase org UUID for the current user (active-org path). */
async function getOrgIds(): Promise<{ internalOrgId: string } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { internalOrgId: user.orgId! };
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

  // clerk_user_id is stamped at PROVISIONING time (identifier sync for anyone
  // with a phone), so it does not mean the person ever signed in — the invite
  // badge/actions must key off actual sign-in evidence. One batched Clerk call
  // answers lastSignInAt for the whole org; on failure we fall back to treating
  // linked as active (the old behavior) rather than mislabeling everyone.
  const clerkIds: string[] = (empResult.data ?? [])
    .map((e: any) => e.clerk_user_id)
    .filter((id: string | null): id is string => !!id);
  const signedInSet = new Set<string>();
  let signInLookupOk = false;
  if (clerkIds.length > 0) {
    try {
      const client = await clerkClient();
      for (let i = 0; i < clerkIds.length; i += 100) {
        const chunk = clerkIds.slice(i, i + 100);
        const res = await client.users.getUserList({ userId: chunk, limit: chunk.length });
        for (const u of res.data) {
          if (u.lastSignInAt) signedInSet.add(u.id);
        }
      }
      signInLookupOk = true;
    } catch (e: any) {
      console.warn("listEmployees: Clerk sign-in lookup failed (falling back):", e?.message ?? e);
    }
  }

  const employees = (empResult.data ?? []).map((e: any) => {
    const hasSignedIn = e.clerk_user_id
      ? signInLookupOk
        ? signedInSet.has(e.clerk_user_id)
        : true // fallback: assume linked = active, as before
      : false;

    let invite_status: "none" | "sent" | "expired" | null = null;
    if (!hasSignedIn) {
      if (!e.email) {
        // Phone-only: "none" only while unprovisioned (drives "Activate phone
        // login"); once provisioned there is nothing to send.
        invite_status = e.clerk_user_id ? null : "none";
      } else {
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

  const supabase = createAdminSupabase();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, max_employees")
    .eq("id", ids.internalOrgId)
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
      reporting_manager_2_id:
        validated.data.reportingManager2Id && validated.data.reportingManager2Id !== validated.data.reportingManagerId
          ? validated.data.reportingManager2Id
          : null,
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

  const newId = (data as { id: string }).id;

  if (phone) {
    // Phone present (with or without an email): mirror BOTH identifiers onto a
    // single Clerk user so this person can sign in by phone OR email. Without
    // this, a phone in the employees table is never a Clerk sign-in identifier.
    // Best-effort — the employee row is the source of truth; linking can retry.
    try {
      const client = await clerkClient();
      const { clerkUserId } = await syncEmployeeAuthIdentifiers(client, {
        email,
        phoneE164: phone,
        role: validated.data.role,
      });
      if (clerkUserId) {
        await supabase
          .from("employees")
          .update({ clerk_user_id: clerkUserId })
          .eq("id", newId);
      }
    } catch (provErr: any) {
      console.warn("Clerk identifier sync failed (non-fatal):", provErr?.message ?? provErr);
    }
  }

  if (email) {
    // Has email: send our own account-setup email (Clerk org invitations dropped).
    // Best-effort — failure doesn't block the add; admin can resend from the directory.
    // sendInvite returns an ActionResult rather than throwing — check it, or
    // failures are invisible (this hid the Medialoop invite outage, 2026-07-15).
    try {
      const inviteResult = await sendInvite(newId);
      if (!inviteResult.success) {
        console.warn(`Invite email not sent for employee ${newId} (non-fatal):`, inviteResult.error);
      }
    } catch (inviteErr: any) {
      console.warn("Invite email failed (non-fatal):", inviteErr?.message ?? inviteErr);
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

  const email =
    validated.data.email && validated.data.email.trim() !== ""
      ? validated.data.email.trim()
      : null;
  const phone = normalizePhone(validated.data.phone ?? null);

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("employees")
    .update({
      first_name: validated.data.firstName,
      last_name: validated.data.lastName,
      email,
      phone,
      department_id: validated.data.departmentId || null,
      designation: validated.data.designation || null,
      date_of_joining: validated.data.dateOfJoining,
      employment_type: validated.data.employmentType,
      role: validated.data.role,
      reporting_manager_id: validated.data.reportingManagerId || null,
      reporting_manager_2_id:
        validated.data.reportingManager2Id && validated.data.reportingManager2Id !== validated.data.reportingManagerId
          ? validated.data.reportingManager2Id
          : null,
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

  // Keep Clerk sign-in identifiers in step with the row. When a phone is set,
  // mirror email + phone onto the employee's Clerk user so either can be used
  // to sign in (e.g. a phone added to an existing email-login employee). This is
  // the path that fixes "phone is in employee data but login can't find it".
  // Best-effort — never block the update on a Clerk sync hiccup.
  if (phone) {
    try {
      const { data: emp } = await supabase
        .from("employees")
        .select("clerk_user_id")
        .eq("id", id)
        .eq("org_id", orgId)
        .single();
      const client = await clerkClient();
      const { clerkUserId } = await syncEmployeeAuthIdentifiers(client, {
        email,
        phoneE164: phone,
        role: validated.data.role,
        existingClerkUserId: (emp as { clerk_user_id: string | null } | null)?.clerk_user_id ?? null,
      });
      if (clerkUserId && (emp as { clerk_user_id: string | null } | null)?.clerk_user_id !== clerkUserId) {
        await supabase
          .from("employees")
          .update({ clerk_user_id: clerkUserId })
          .eq("id", id);
      }
    } catch (syncErr: any) {
      console.warn("Clerk identifier sync failed (non-fatal):", syncErr?.message ?? syncErr);
    }
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
  const { data: terminated, error } = await supabase
    .from("employees")
    .update({ status: "terminated" })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("device_code")
    .single();

  if (error) return { success: false, error: error.message };

  // Remove the ex-employee's user record from all devices. Best-effort.
  const terminatedPin = (terminated as any)?.device_code as string | null;
  if (terminatedPin) {
    await enqueueDeleteForEmployee(orgId, id, terminatedPin);
  }

  // Delete the pending invite record (no Clerk invitation to revoke anymore)
  await supabase.from("employee_invites").delete().eq("employee_id", id);

  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}

/**
 * Re-run Clerk provisioning for a phone-only employee whose initial provisioning
 * failed (clerk_user_id still null). Unlike addEmployee's best-effort path, this
 * RETURNS the real Clerk error so the admin can see why it failed.
 * Idempotent: provisionPhoneOnlyUser reuses an existing Clerk user / membership.
 */
export async function reprovisionPhoneEmployee(
  employeeId: string
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can activate employees" };
  const ids = await getOrgIds();
  if (!ids) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data: emp } = await supabase
    .from("employees")
    .select("id, email, phone, role, clerk_user_id")
    .eq("id", employeeId)
    .eq("org_id", ids.internalOrgId)
    .single();

  if (!emp) return { success: false, error: "Employee not found" };
  const e = emp as {
    id: string;
    email: string | null;
    phone: string | null;
    role: string;
    clerk_user_id: string | null;
  };

  if (e.clerk_user_id) return { success: true, data: undefined }; // already activated
  if (e.email) {
    return { success: false, error: "This employee has an email — send an invite instead." };
  }
  const phone = normalizePhone(e.phone);
  if (!phone) {
    return { success: false, error: "This employee has no valid phone number to activate." };
  }

  try {
    const client = await clerkClient();
    const { clerkUserId } = await provisionPhoneOnlyUser(client, {
      phoneE164: phone,
      role: e.role as UserRole,
    });
    await supabase.from("employees").update({ clerk_user_id: clerkUserId }).eq("id", e.id);
    revalidatePath("/dashboard/employees");
    return { success: true, data: undefined };
  } catch (err: any) {
    // Surface the actual Clerk error (NOT swallowed) so the root cause is visible.
    const msg = err?.errors?.[0]?.message ?? err?.message ?? "Clerk provisioning failed";
    return { success: false, error: msg };
  }
}

/**
 * One-shot backfill: for every active employee that has a phone, mirror their
 * email + phone onto their Clerk user so the number becomes a sign-in
 * identifier. Use this to fix employees who were added/edited before the
 * add/update Clerk-sync existed (phone in our DB but not on Clerk → phone login
 * "couldn't find account"). Idempotent and safe to re-run.
 */
export async function backfillAuthIdentifiers(): Promise<
  ActionResult<{ scanned: number; updated: number; addedPhone: number; addedEmail: number; failed: number }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can sync sign-in identifiers" };
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data: emps, error } = await supabase
    .from("employees")
    .select("id, email, phone, role, clerk_user_id")
    .eq("org_id", orgId)
    .neq("status", "terminated");
  if (error) return { success: false, error: error.message };

  const rows = (emps ?? []) as {
    id: string;
    email: string | null;
    phone: string | null;
    role: string;
    clerk_user_id: string | null;
  }[];
  const withPhone = rows.filter((e) => !!normalizePhone(e.phone));

  let updated = 0;
  let addedPhone = 0;
  let addedEmail = 0;
  let failed = 0;
  const client = await clerkClient();

  // Sequential — SMB scale (≤500) and keeps us well under Clerk's rate limits.
  for (const e of withPhone) {
    try {
      const res = await syncEmployeeAuthIdentifiers(client, {
        email: e.email,
        phoneE164: e.phone,
        role: e.role as UserRole,
        existingClerkUserId: e.clerk_user_id,
      });
      if (res.addedPhone) addedPhone++;
      if (res.addedEmail) addedEmail++;
      if (res.clerkUserId && res.clerkUserId !== e.clerk_user_id) {
        await supabase.from("employees").update({ clerk_user_id: res.clerkUserId }).eq("id", e.id);
        updated++;
      }
    } catch (err: any) {
      failed++;
      console.warn(`backfillAuthIdentifiers: failed for employee ${e.id}:`, err?.message ?? err);
    }
  }

  revalidatePath("/dashboard/employees");
  return { success: true, data: { scanned: withPhone.length, updated, addedPhone, addedEmail, failed } };
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
  reporting_manager_2_email?: string;
  device_code?: string;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  invitesSent: number;
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

  const supabase = createAdminSupabase();

  // Fetch plan limit (+ name for the account-setup invite emails)
  const { data: org } = await supabase
    .from("organizations")
    .select("max_employees, name")
    .eq("id", orgId)
    .single();
  const maxEmployees = (org as any)?.max_employees ?? 10;
  const orgName = ((org as any)?.name as string | undefined) ?? "your team";

  // Fetch current active count
  const { count: currentCount } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("status", "terminated");
  const activeCount = currentCount ?? 0;

  const remainingSlots = maxEmployees - activeCount;

  // Fetch existing emails, phones and device codes in org (for duplicate detection)
  const { data: existingEmps } = await supabase
    .from("employees")
    .select("email, status, phone, device_code")
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
  // device_code (biometric PIN) must be unique per org — backed by the
  // uq_employees_org_device_code partial index (migration 085).
  const existingDeviceCodeSet = new Set<string>(
    (existingEmps ?? [])
      .map((e: any) => e.device_code)
      .filter((c: any): c is string => !!c)
  );
  const deviceCodesSeen = new Set<string>();

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
  // Tracks every row with a phone so we can sync Clerk sign-in identifiers
  // (email + phone) after the batch insert — not just phone-only rows.
  const phoneRowIndices: {
    insertIndex: number;
    phoneE164: string;
    email: string | null;
    role: "admin" | "manager" | "employee";
  }[] = [];
  const phonesSeen = new Set<string>();

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
    let reportingManager2Id = row.reporting_manager_2_email
      ? (managerEmailMap.get(row.reporting_manager_2_email.toLowerCase()) ?? null)
      : null;
    if (reportingManager2Id && emailOk && row.reporting_manager_2_email!.toLowerCase() === rowEmail.toLowerCase()) {
      errors.push({ row: rowNum, reason: "reporting_manager_2_email cannot be the employee's own email", data: row });
      continue;
    }
    if (reportingManager2Id && reportingManager2Id === reportingManagerId) reportingManager2Id = null; // silent dedupe

    if (row.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)) {
      errors.push({ row: rowNum, reason: "Invalid date_of_birth format (use YYYY-MM-DD)", data: row });
      continue;
    }

    const deviceCode = row.device_code?.trim() || null;
    if (deviceCode) {
      if (!/^\d+$/.test(deviceCode)) {
        errors.push({ row: rowNum, reason: "device_code must be digits only", data: row });
        continue;
      }
      if (existingDeviceCodeSet.has(deviceCode) || deviceCodesSeen.has(deviceCode)) {
        errors.push({ row: rowNum, reason: `Duplicate device_code (PIN) "${deviceCode}" — must be unique per org`, data: row });
        continue;
      }
    }

    if (rowPhone) {
      // Phone must be unique per org for ANY row (email+phone or phone-only) —
      // the employees_org_phone_unique partial index would otherwise fail the
      // whole batch insert.
      if (existingPhoneSet.has(rowPhone) || phonesSeen.has(rowPhone)) {
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
      reporting_manager_2_id: reportingManager2Id,
      device_code: deviceCode,
      status: "active",
    });
    if (deviceCode) deviceCodesSeen.add(deviceCode); // prevent within-batch duplicate
    if (rowPhone) {
      phoneRowIndices.push({
        insertIndex,
        phoneE164: rowPhone,
        email: emailOk ? rowEmail.toLowerCase() : null,
        role: row.role,
      });
      phonesSeen.add(rowPhone); // prevent within-batch duplicate
    }
    if (emailOk) {
      existingEmailMap.set(rowEmail.toLowerCase(), "active"); // prevent within-batch duplicate
    }
  }

  let invitesSent = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("employees")
      .insert(toInsert)
      .select("id, phone, email, first_name");
    if (insertError) {
      if (insertError.message?.includes("uq_employees_org_device_code")) {
        return { success: false, error: "A device_code (PIN) is already used by another employee in this organization." };
      }
      return { success: false, error: insertError.message };
    }

    // Sync Clerk sign-in identifiers for every imported row with a phone, so
    // email+phone rows can sign in by either (not just phone-only rows).
    // Best-effort, non-fatal.
    if (phoneRowIndices.length > 0 && inserted) {
      const insertedRows = inserted as {
        id: string;
        phone: string | null;
        email: string | null;
        first_name: string | null;
      }[];
      const client = await clerkClient();
      for (const { insertIndex, phoneE164, email, role } of phoneRowIndices) {
        const insertedRow = insertedRows[insertIndex];
        if (!insertedRow || insertedRow.phone !== phoneE164) {
          console.warn(`Import identifier sync: positional mismatch at index ${insertIndex}; skipping`);
          continue;
        }
        try {
          const { clerkUserId } = await syncEmployeeAuthIdentifiers(client, {
            email,
            phoneE164,
            role,
          });
          if (clerkUserId) {
            await supabase
              .from("employees")
              .update({ clerk_user_id: clerkUserId })
              .eq("id", insertedRow.id);
          }
        } catch (e: any) {
          console.warn("Import identifier sync failed (non-fatal):", e?.message ?? e);
        }
      }
    }

    // Send account-setup invites to every imported row that has an email.
    // The import path previously sent nothing at all — imported employees never
    // learned they had an account (Medialoop outage, 2026-07-15). Sequential on
    // purpose: it naturally respects Resend's rate limit; best-effort, non-fatal.
    // Runs AFTER identifier sync — freshly imported rows have never signed in,
    // so no already-signed-in guard is needed here.
    if (inserted) {
      for (const row of inserted as {
        id: string;
        email: string | null;
        first_name: string | null;
      }[]) {
        if (!row.email) continue;
        const sent = await sendAccountSetupInvite(supabase, {
          orgId,
          orgName,
          employeeId: row.id,
          email: row.email,
          firstName: row.first_name,
        });
        if (sent.ok) invitesSent++;
      }
    }
  }

  revalidatePath("/dashboard/employees");

  return {
    success: true,
    data: {
      imported: toInsert.length,
      skipped: errors.length,
      invitesSent,
      errors,
    },
  };
}
