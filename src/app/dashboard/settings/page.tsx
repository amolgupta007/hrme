import { listDepartments } from "@/actions/departments";
import { getOrgProfile, listSettingsPolicies } from "@/actions/settings";
import { DepartmentsSection } from "@/components/settings/departments-section";
import { OrgProfileSection } from "@/components/settings/org-profile-section";
import { LeavePoliciesSection } from "@/components/settings/leave-policies-section";
import { BillingSection } from "@/components/settings/billing-section";

export default async function SettingsPage() {
  const [departmentsResult, profileResult, policiesResult] = await Promise.all([
    listDepartments(),
    getOrgProfile(),
    listSettingsPolicies(),
  ]);

  const departments = departmentsResult.success ? departmentsResult.data : [];
  const policies = policiesResult.success ? policiesResult.data : [];

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

      <LeavePoliciesSection policies={policies} />

      <DepartmentsSection departments={departments} />
    </div>
  );
}
