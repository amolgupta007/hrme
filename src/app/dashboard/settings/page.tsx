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
import { listLocations, listDevices } from "@/actions/attendance-devices";
import { getPerformanceSettings } from "@/lib/performance-settings";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getAttendanceSettings } from "@/actions/attendance";
import { listShifts, listShiftAssignments } from "@/actions/shifts";
import { getWeekOffPolicy, listAllWeekOffOverrides } from "@/actions/week-off";
import { listEmployees } from "@/actions/employees";
import { getSalaryStructureConfig } from "@/actions/payroll";
import { getOvertimeSettings } from "@/actions/overtime";
import { getRazorpayXCredentials } from "@/actions/razorpayx-credentials";
import { getLatePolicy } from "@/actions/late-policy";
import { getWhatsAppCredentials } from "@/actions/whatsapp-credentials";
import type { OvertimeSettings } from "@/lib/attendance/overtime-types";

const DEFAULT_OT_SETTINGS_FALLBACK: OvertimeSettings = {
  enabled: false,
  multiplier: 1.5,
  threshold_mode: "per_day",
  weekly_threshold_hours: 48,
  approval_required: true,
};

export default async function SettingsPage() {
  const [
    departmentsResult,
    profileResult,
    policiesResult,
    userCtx,
    onboardingSteps,
    fingerprintConfigResult,
    fingerprintEmployeesResult,
    attendanceSettingsResult,
    shiftsResult,
    shiftAssignmentsResult,
    weekOffPolicyResult,
    weekOffOverridesResult,
    employeesResult,
    payrollConfigResult,
    overtimeSettingsResult,
    razorpayxCredentialsResult,
    latePolicyResult,
    whatsappCredsResult,
    locationsResult,
    devicesResult,
  ] = await Promise.all([
    listDepartments(),
    getOrgProfile(),
    listSettingsPolicies(),
    getCurrentUser(),
    getOrgOnboardingConfig(),
    getFingerprintConfig(),
    listEmployeesWithDeviceCodes(),
    getAttendanceSettings(),
    listShifts(),
    listShiftAssignments(),
    getWeekOffPolicy(),
    listAllWeekOffOverrides(),
    listEmployees(),
    getSalaryStructureConfig(),
    getOvertimeSettings(),
    getRazorpayXCredentials(),
    getLatePolicy(),
    getWhatsAppCredentials(),
    listLocations(),
    listDevices(),
  ]);

  const biometricLocations = locationsResult.success ? locationsResult.data : [];
  const biometricDevices = devicesResult.success ? devicesResult.data : [];

  const departments = departmentsResult.success ? departmentsResult.data : [];
  const policies = policiesResult.success ? policiesResult.data : [];
  const plan = userCtx?.plan ?? "starter";
  const jambaHireEnabled = userCtx?.jambaHireEnabled ?? false;
  const attendanceEnabled = userCtx?.attendanceEnabled ?? false;
  const attendancePayrollEnabled = userCtx?.attendancePayrollEnabled ?? false;
  const grievancesEnabled = userCtx?.grievancesEnabled ?? false;
  const assistantEnabled = userCtx?.assistantEnabled ?? false;
  const assistantTenantDocsEnabled = userCtx?.assistantTenantDocsEnabled ?? false;
  const fingerprintConfig = fingerprintConfigResult.success
    ? fingerprintConfigResult.data
    : { enabled: false, device_token: null };
  const fingerprintEmployees = fingerprintEmployeesResult.success
    ? fingerprintEmployeesResult.data
    : [];
  const attendanceSettings = attendanceSettingsResult.success ? attendanceSettingsResult.data : null;
  const shifts = shiftsResult.success ? shiftsResult.data : [];
  const shiftAssignments = shiftAssignmentsResult.success ? shiftAssignmentsResult.data : [];
  const weekOffPolicy = weekOffPolicyResult.success ? weekOffPolicyResult.data : null;
  const weekOffOverrides = weekOffOverridesResult.success ? weekOffOverridesResult.data : [];
  const employees = employeesResult.success ? employeesResult.data : [];
  const payrollEnabled = hasFeature(plan, "payroll", userCtx?.customFeatures ?? null);
  const payrollActiveConfig = payrollConfigResult.success ? payrollConfigResult.data.active : null;
  const payrollConfigHistory = payrollConfigResult.success ? payrollConfigResult.data.history : [];
  const overtimeSettings = overtimeSettingsResult.success
    ? overtimeSettingsResult.data
    : DEFAULT_OT_SETTINGS_FALLBACK;
  const razorpayxCredentials = razorpayxCredentialsResult.success
    ? razorpayxCredentialsResult.data
    : null;
  const latePolicy = latePolicyResult.success ? latePolicyResult.data.policy : null;
  const latePolicyTargets = latePolicyResult.success ? latePolicyResult.data.targets : [];
  const whatsappCreds = whatsappCredsResult.success ? whatsappCredsResult.data : null;
  const lateDepartments = departments.map((d) => ({ id: d.id, name: d.name }));
  const lateEmployees = employees.map((e) => ({
    id: e.id,
    name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email,
    department_id: e.department_id,
  }));

  const supabase = createAdminSupabase();
  const orgSettingsResult = userCtx
    ? await supabase.from("organizations").select("settings").eq("id", userCtx.orgId).single()
    : { data: null };
  const performanceSettings = getPerformanceSettings((orgSettingsResult.data as any)?.settings ?? null);
  const rawOrgSettings = (orgSettingsResult.data as any)?.settings ?? {};
  const jambaGeoEnabled = userCtx?.jambaGeoEnabled ?? false;
  const jambaGeoSettings = {
    default_retention_days: (rawOrgSettings.jambageo?.default_retention_days as number) ?? 90,
    default_ping_interval_min: (rawOrgSettings.jambageo?.default_ping_interval_min as number) ?? 15,
  };

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
        isPlanEligible={hasFeature(plan, "ats", userCtx?.customFeatures ?? null)}
        attendanceEnabled={attendanceEnabled}
        attendancePayrollEnabled={attendancePayrollEnabled}
        grievancesEnabled={grievancesEnabled}
        assistantEnabled={assistantEnabled}
        assistantTenantDocsEnabled={assistantTenantDocsEnabled}
        onboardingSteps={onboardingSteps}
        fingerprintConfig={fingerprintConfig}
        fingerprintEmployees={fingerprintEmployees}
        biometricLocations={biometricLocations}
        biometricDevices={biometricDevices}
        userCtx={userCtx}
        performanceSettings={performanceSettings}
        attendanceSettings={attendanceSettings}
        shifts={shifts}
        shiftAssignments={shiftAssignments}
        weekOffPolicy={weekOffPolicy}
        weekOffOverrides={weekOffOverrides}
        employees={employees}
        latePolicy={latePolicy}
        latePolicyTargets={latePolicyTargets}
        whatsappCreds={whatsappCreds}
        lateDepartments={lateDepartments}
        lateEmployees={lateEmployees}
        payrollActiveConfig={payrollActiveConfig}
        payrollConfigHistory={payrollConfigHistory}
        payrollEnabled={payrollEnabled}
        overtimeSettings={overtimeSettings}
        razorpayxCredentials={razorpayxCredentials}
        jambaGeoEnabled={jambaGeoEnabled}
        jambaGeoSettings={jambaGeoSettings}
      />
    </div>
  );
}
