"use server";

import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import {
  DEFAULT_ONBOARDING_STEPS,
  STEP_LABELS,
  STEP_ACTION_URLS,
  type OnboardingStepConfig,
  type OnboardingStepId,
  type OnboardingStepStatus,
  type OnboardingStatusResult,
  type EmployeeOnboardingSummary,
} from "@/config/onboarding";
import { getMyProfile } from "@/actions/profile";

// ---- Helpers ----

export async function getOrgOnboardingConfig(): Promise<OnboardingStepConfig[]> {
  const user = await getCurrentUser();
  if (!user) return DEFAULT_ONBOARDING_STEPS;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const steps = (data as any)?.settings?.onboarding_steps;
  if (!Array.isArray(steps) || steps.length === 0) return DEFAULT_ONBOARDING_STEPS;
  return steps as OnboardingStepConfig[];
}

type EmployeeFields = {
  phone: string | null;
  personal_email: string | null;
  avatar_url: string | null;
  communication_address: unknown;
  pan_number: string | null;
  aadhar_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

function computeStepComplete(
  stepId: OnboardingStepId,
  employee: EmployeeFields,
  docAckCount: number
): boolean {
  switch (stepId) {
    case "profile":
      return !!(employee.phone && employee.personal_email);
    case "photo":
      return !!employee.avatar_url;
    case "address":
      return !!employee.communication_address;
    case "id_proof":
      return !!(employee.pan_number || employee.aadhar_number);
    case "emergency_contact":
      return !!(employee.emergency_contact_name && employee.emergency_contact_phone);
    case "documents":
      return docAckCount > 0;
  }
}

function buildOnboardingResult(
  employee: EmployeeFields,
  docAckCount: number,
  steps: OnboardingStepConfig[]
): OnboardingStatusResult {
  const enabledSteps = steps.filter((s) => s.enabled);

  const stepsWithStatus: OnboardingStepStatus[] = enabledSteps.map((s) => ({
    ...s,
    label: STEP_LABELS[s.id],
    actionUrl: STEP_ACTION_URLS[s.id],
    complete: computeStepComplete(s.id, employee, docAckCount),
  }));

  const totalEnabled = stepsWithStatus.length;
  const totalComplete = stepsWithStatus.filter((s) => s.complete).length;
  const allRequiredComplete = stepsWithStatus
    .filter((s) => s.required)
    .every((s) => s.complete);

  return { steps: stepsWithStatus, totalEnabled, totalComplete, allRequiredComplete };
}

// ---- Public actions ----

export async function getMyOnboardingStatus(): Promise<ActionResult<OnboardingStatusResult>> {
  const profileResult = await getMyProfile();
  if (!profileResult.success) return { success: false, error: profileResult.error };

  const profile = profileResult.data;
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [configResult, acksResult] = await Promise.all([
    getOrgOnboardingConfig(),
    supabase
      .from("document_acknowledgments")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", profile.id),
  ]);

  const docAckCount = acksResult.count ?? 0;
  const result = buildOnboardingResult(profile, docAckCount, configResult);

  return { success: true, data: result };
}

export async function getAllEmployeesOnboardingStatus(): Promise<
  ActionResult<EmployeeOnboardingSummary[]>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  const [empResult, acksResult, steps] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, first_name, last_name, avatar_url, department_id, created_at, phone, personal_email, communication_address, pan_number, aadhar_number, emergency_contact_name, emergency_contact_phone"
      )
      .eq("org_id", user.orgId)
      .eq("status", "active")
      .order("first_name"),
    supabase
      .from("document_acknowledgments")
      .select("employee_id"),
    getOrgOnboardingConfig(),
  ]);

  if (empResult.error) return { success: false, error: empResult.error.message };

  const employees = empResult.data ?? [];

  // Build a set of employee_ids scoped to this org that have at least one ack
  const orgEmployeeIds = new Set(employees.map((e) => e.id));
  const ackedIds = new Set(
    (acksResult.data ?? [])
      .map((a) => a.employee_id)
      .filter((id) => orgEmployeeIds.has(id))
  );

  const summaries: EmployeeOnboardingSummary[] = employees.map((emp) => {
    const docAckCount = ackedIds.has(emp.id) ? 1 : 0;
    const { totalEnabled, totalComplete, allRequiredComplete } = buildOnboardingResult(
      emp as EmployeeFields,
      docAckCount,
      steps
    );
    return {
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      avatar_url: emp.avatar_url,
      department_id: emp.department_id,
      created_at: emp.created_at,
      totalEnabled,
      totalComplete,
      allRequiredComplete,
    };
  });

  return { success: true, data: summaries };
}
