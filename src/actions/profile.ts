"use server";

import { currentUser, clerkClient, auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult, Employee } from "@/types";

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
};

// ---- Helpers ----

async function getOrgId(): Promise<string | null> {
  const { orgId, userId } = auth();
  let clerkOrgId = orgId ?? null;
  if (!clerkOrgId && userId) {
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
  return (data as { id: string } | null)?.id ?? null;
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
});

export async function updateMyProfile(
  employeeId: string,
  formData: z.infer<typeof profileSchema>
): Promise<ActionResult<void>> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Organization not found" };

  const validated = profileSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
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
    })
    .eq("id", employeeId)
    .eq("org_id", orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/profile");
  return { success: true, data: undefined };
}
