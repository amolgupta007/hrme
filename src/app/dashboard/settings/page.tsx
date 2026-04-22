import { listDepartments } from "@/actions/departments";
import { getOrgProfile, listSettingsPolicies } from "@/actions/settings";
import { OrgProfileSection } from "@/components/settings/org-profile-section";
import { BillingSection } from "@/components/settings/billing-section";
import { SettingsContent } from "@/components/settings/settings-content";
import { getCurrentUser } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { getOrgOnboardingConfig } from "@/actions/onboarding";
import {
  getFingerprintConfig,
  listEmployeesWithDeviceCodes,
} from "@/actions/fingerprint";
import { getPerformanceSettings } from "@/lib/performance-settings";
import { createAdminSupabase } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const [
    departmentsResult,
    profileResult,
    policiesResult,
    userCtx,
    onboardingSteps,
    fingerprintConfigResult,
    fingerprintEmployeesResult,
  ] = await Promise.all([
    listDepartments(),
    getOrgProfile(),
    listSettingsPolicies(),
    getCurrentUser(),
    getOrgOnboardingConfig(),
    getFingerprintConfig(),
    listEmployeesWithDeviceCodes(),
  ]);

  const departments = departmentsResult.success ? departmentsResult.data : [];
  const policies = policiesResult.success ? policiesResult.data : [];
  const plan = userCtx?.plan ?? "starter";
  const jambaHireEnabled = userCtx?.jambaHireEnabled ?? false;
  const attendanceEnabled = userCtx?.attendanceEnabled ?? false;
  const attendancePayrollEnabled = userCtx?.attendancePayrollEnabled ?? false;
  const grievancesEnabled = userCtx?.grievancesEnabled ?? false;
  const fingerprintConfig = fingerprintConfigResult.success
    ? fingerprintConfigResult.data
    : { enabled: false, device_token: null };
  const fingerprintEmployees = fingerprintEmployeesResult.success
    ? fingerprintEmployeesResult.data
    : [];

  const supabase = createAdminSupabase();
  const orgSettingsResult = userCtx
    ? await supabase.from("organizations").select("settings").eq("id", userCtx.orgId).single()
    : { data: null };
  const performanceSettings = getPerformanceSettings((orgSettingsResult.data as any)?.settings ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your organization, billing, leave policies, and departments.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {profileResult.success && (
          <OrgProfileSection profile={profileResult.data} />
        )}
        {profileResult.success && (
          <BillingSection profile={profileResult.data} />
        )}
      </div>

      <SettingsContent
        policies={policies}
        departments={departments}
        jambaHireEnabled={jambaHireEnabled}
        isPlanEligible={hasFeature(plan, "ats")}
        attendanceEnabled={attendanceEnabled}
        attendancePayrollEnabled={attendancePayrollEnabled}
        grievancesEnabled={grievancesEnabled}
        onboardingSteps={onboardingSteps}
        fingerprintConfig={fingerprintConfig}
        fingerprintEmployees={fingerprintEmployees}
        userCtx={userCtx}
        performanceSettings={performanceSettings}
      />
    </div>
  );
}
