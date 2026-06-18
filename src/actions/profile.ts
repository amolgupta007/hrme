"use server";

import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import type { ActionResult, Employee } from "@/types";

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  designation: "Designation",
  personalEmail: "Personal email",
  phone: "Phone",
  gender: "Gender",
  pronouns: "Pronouns",
  maritalStatus: "Marital status",
  country: "Country",
  dateOfBirth: "Date of birth",
  panNumber: "PAN number",
  aadharNumber: "Aadhar number",
  communicationAddress: "Communication address",
  permanentAddress: "Permanent address",
  name: "Emergency contact name",
  relationship: "Emergency contact relationship",
  line1: "Address line 1",
  line2: "Address line 2",
  city: "City",
  state: "State",
  pincode: "PIN code",
};

function fieldKeyFromPath(path: (string | number)[]): string {
  if (path.length === 0) return "_form";
  return path.map((p) => p.toString()).join(".");
}

function labelForField(fieldKey: string): string {
  if (fieldKey === "_form") return "Form";
  const parts = fieldKey.split(".");
  return parts
    .map((p) => FIELD_LABELS[p] ?? p)
    .join(" → ");
}

function describeIssue(issue: z.ZodIssue): string {
  if (issue.code === "invalid_type") {
    return `Expected ${issue.expected}, received ${issue.received}.`;
  }
  return issue.message;
}

export type ProfileFieldErrors = Record<string, string>;

function buildValidationFailure(error: z.ZodError): { error: string; fieldErrors: ProfileFieldErrors } {
  const fieldErrors: ProfileFieldErrors = {};
  for (const issue of error.errors) {
    const key = fieldKeyFromPath(issue.path as (string | number)[]);
    if (!fieldErrors[key]) {
      fieldErrors[key] = `${labelForField(key)}: ${describeIssue(issue)}`;
    }
  }

  // Build a summary that lists each offending field, not just the first one
  const summary =
    Object.values(fieldErrors).length === 1
      ? Object.values(fieldErrors)[0]
      : `Fix ${Object.keys(fieldErrors).length} fields: ${Object.values(fieldErrors).join("; ")}`;

  return { error: summary, fieldErrors };
}

export type Address = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

export type EmployeeProfile = Employee & {
  personal_email: string | null;
  gender: string | null;
  pronouns: string | null;
  marital_status: string | null;
  country: string | null;
  pan_number: string | null;
  aadhar_number: string | null;
  communication_address: Address | null;
  permanent_address: Address | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  whatsapp_opt_in: boolean | null;
  whatsapp_opt_in_at: string | null;
};

// ---- Helpers ----

async function getOrgId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.orgId ?? null;
}

// ---- Actions ----

export async function getMyProfile(): Promise<ActionResult<EmployeeProfile>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Organization not found" };

  const supabase = createAdminSupabase();

  // Try matching by clerk_user_id first, then by email
  let { data } = await supabase
    .from("employees")
    .select("*")
    .eq("org_id", orgId)
    .eq("clerk_user_id", user.id)
    .neq("status", "terminated")
    .single();

  if (!data) {
    const email = user.emailAddresses[0]?.emailAddress;
    if (email) {
      const res = await supabase
        .from("employees")
        .select("*")
        .eq("org_id", orgId)
        .eq("email", email)
        .neq("status", "terminated")
        .single();
      data = res.data;

      // Link clerk_user_id for future lookups
      if (data) {
        await supabase
          .from("employees")
          .update({ clerk_user_id: user.id })
          .eq("id", (data as { id: string }).id);
      }
    }
  }

  if (!data) return { success: false, error: "No employee profile found for your account" };
  return { success: true, data: data as EmployeeProfile };
}

const addressSchema = z.object({
  line1: z.string(),
  line2: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
});

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  designation: z.string().optional(),
  personalEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  gender: z.string().optional(),
  pronouns: z.string().optional(),
  maritalStatus: z.string().optional(),
  country: z.string().optional(),
  dateOfBirth: z.string().optional(),
  panNumber: z.string().optional(),
  aadharNumber: z.string().optional(),
  communicationAddress: addressSchema.optional(),
  permanentAddress: addressSchema.optional(),
  whatsapp_opt_in: z.boolean().optional(),
});

export type ProfileSaveResult =
  | { success: true; data: undefined }
  | { success: false; error: string; fieldErrors?: ProfileFieldErrors };

export async function updateMyProfile(
  employeeId: string,
  formData: z.infer<typeof profileSchema>
): Promise<ProfileSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (user.employeeId !== employeeId) return { success: false, error: "Forbidden" };

  const validated = profileSchema.safeParse(formData);
  if (!validated.success) {
    const { error, fieldErrors } = buildValidationFailure(validated.error);
    return { success: false, error, fieldErrors };
  }

  const d = validated.data;
  const supabase = createAdminSupabase();

  const { error } = await supabase
    .from("employees")
    .update({
      first_name: d.firstName,
      last_name: d.lastName,
      designation: d.designation || null,
      personal_email: d.personalEmail || null,
      phone: d.phone || null,
      gender: d.gender || null,
      pronouns: d.pronouns || null,
      marital_status: d.maritalStatus || null,
      country: d.country || null,
      date_of_birth: d.dateOfBirth || null,
      pan_number: d.panNumber || null,
      aadhar_number: d.aadharNumber || null,
      communication_address: d.communicationAddress ?? null,
      permanent_address: d.permanentAddress ?? null,
      ...(d.whatsapp_opt_in !== undefined
        ? {
            whatsapp_opt_in: d.whatsapp_opt_in,
            whatsapp_opt_in_at: d.whatsapp_opt_in ? new Date().toISOString() : null,
          }
        : {}),
    } as any)
    .eq("id", employeeId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/profile");
  return { success: true, data: undefined };
}

const emergencyContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  relationship: z.string().optional(),
});

export async function updateEmergencyContact(
  formData: z.infer<typeof emergencyContactSchema>
): Promise<ProfileSaveResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const validated = emergencyContactSchema.safeParse(formData);
  if (!validated.success) {
    const { error, fieldErrors: rawFieldErrors } = buildValidationFailure(validated.error);
    // Namespace emergency-contact field keys so they don't collide with profile keys
    const fieldErrors: ProfileFieldErrors = {};
    for (const [k, v] of Object.entries(rawFieldErrors)) {
      fieldErrors[`emergency.${k}`] = v;
    }
    return { success: false, error, fieldErrors };
  }

  const d = validated.data;
  const supabase = createAdminSupabase();

  // Find employee record for this user
  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("clerk_user_id", user.clerkUserId)
    .neq("status", "terminated")
    .single();

  if (!emp) return { success: false, error: "Employee record not found" };

  const { error } = await supabase
    .from("employees")
    .update({
      emergency_contact_name: d.name,
      emergency_contact_phone: d.phone,
      emergency_contact_relationship: d.relationship || null,
    })
    .eq("id", (emp as { id: string }).id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/profile");
  return { success: true, data: undefined };
}
