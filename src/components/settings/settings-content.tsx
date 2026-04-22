"use client";

import React from "react";
import {
  CalendarDays,
  Building2,
  Settings,
  ClipboardList,
  Fingerprint,
  BarChart3,
} from "lucide-react";
import { CollapsibleSection } from "@/components/settings/collapsible-section";
import { LeavePoliciesSection } from "@/components/settings/leave-policies-section";
import { DepartmentsSection } from "@/components/settings/departments-section";
import { ProductsSection } from "@/components/settings/products-section";
import { OnboardingStepsSection } from "@/components/settings/onboarding-steps-section";
import { FingerprintSection } from "@/components/settings/fingerprint-section";
import { PerformanceSection } from "@/components/settings/performance-section";
import type { LeavePolicy, Department } from "@/types";
import type { OnboardingStepConfig } from "@/config/onboarding";
import type { FingerprintConfig, EmployeeWithDeviceCode } from "@/actions/fingerprint";
import type { PerformanceSettings } from "@/lib/performance-settings";

type UserCtx = {
  role: string;
} | null;

type SettingsContentProps = {
  policies: LeavePolicy[];
  departments: Department[];
  jambaHireEnabled: boolean;
  isPlanEligible: boolean;
  attendanceEnabled: boolean;
  attendancePayrollEnabled: boolean;
  grievancesEnabled: boolean;
  onboardingSteps: OnboardingStepConfig[];
  fingerprintConfig: FingerprintConfig;
  fingerprintEmployees: EmployeeWithDeviceCode[];
  userCtx: UserCtx;
  performanceSettings: PerformanceSettings;
};

function pluralise(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function SettingsContent({
  policies,
  departments,
  jambaHireEnabled,
  isPlanEligible,
  attendanceEnabled,
  attendancePayrollEnabled,
  grievancesEnabled,
  onboardingSteps,
  fingerprintConfig,
  fingerprintEmployees,
  userCtx,
  performanceSettings,
}: SettingsContentProps) {
  const [openSection, setOpenSection] = React.useState<string | null>(null);

  function toggle(id: string) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  // Summary strings
  const policySummary =
    policies.length === 0
      ? "None configured"
      : `${policies.length} ${pluralise(policies.length, "policy", "policies")}`;

  const deptSummary =
    departments.length === 0
      ? "None configured"
      : `${departments.length} ${pluralise(departments.length, "department", "departments")}`;

  const modulesEnabled = [
    jambaHireEnabled,
    attendanceEnabled,
    grievancesEnabled,
    attendancePayrollEnabled,
  ].filter(Boolean).length;
  const productsSummary =
    modulesEnabled === 0
      ? "None enabled"
      : `${modulesEnabled} ${pluralise(modulesEnabled, "module", "modules")} enabled`;

  const stepsEnabled = onboardingSteps.filter((s) => s.enabled).length;
  const onboardingSummary =
    stepsEnabled === 0
      ? "None configured"
      : `${stepsEnabled} ${pluralise(stepsEnabled, "step", "steps")} enabled`;

  const fingerprintSummary = fingerprintConfig.enabled ? "Enabled" : "Not configured";

  const isAdmin =
    userCtx !== null &&
    userCtx.role !== "employee" &&
    userCtx.role !== "manager";

  return (
    <div className="space-y-4">
      <CollapsibleSection
        title="Leave Policies"
        icon={<CalendarDays className="h-5 w-5 text-muted-foreground" />}
        summary={policySummary}
        isOpen={openSection === "leave-policies"}
        onToggle={() => toggle("leave-policies")}
      >
        <LeavePoliciesSection policies={policies} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Departments"
        icon={<Building2 className="h-5 w-5 text-muted-foreground" />}
        summary={deptSummary}
        isOpen={openSection === "departments"}
        onToggle={() => toggle("departments")}
      >
        <DepartmentsSection departments={departments} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Products & Features"
        icon={<Settings className="h-5 w-5 text-muted-foreground" />}
        summary={productsSummary}
        isOpen={openSection === "products"}
        onToggle={() => toggle("products")}
      >
        <ProductsSection
          jambaHireEnabled={jambaHireEnabled}
          isPlanEligible={isPlanEligible}
          attendanceEnabled={attendanceEnabled}
          attendancePayrollEnabled={attendancePayrollEnabled}
          grievancesEnabled={grievancesEnabled}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Onboarding Steps"
        icon={<ClipboardList className="h-5 w-5 text-muted-foreground" />}
        summary={onboardingSummary}
        isOpen={openSection === "onboarding"}
        onToggle={() => toggle("onboarding")}
      >
        <OnboardingStepsSection initialSteps={onboardingSteps} />
      </CollapsibleSection>

      {attendanceEnabled && isAdmin && (
        <CollapsibleSection
          title="Fingerprint Integration"
          icon={<Fingerprint className="h-5 w-5 text-muted-foreground" />}
          summary={fingerprintSummary}
          isOpen={openSection === "fingerprint"}
          onToggle={() => toggle("fingerprint")}
        >
          <FingerprintSection
            initialConfig={fingerprintConfig}
            initialEmployees={fingerprintEmployees}
          />
        </CollapsibleSection>
      )}

      {isAdmin && (
        <CollapsibleSection
          title="Performance & Reviews"
          icon={<BarChart3 className="h-5 w-5 text-muted-foreground" />}
          summary={`${performanceSettings.competencies.length} competencies · ${performanceSettings.rating_labels.join(", ")}`}
          isOpen={openSection === "performance"}
          onToggle={() => toggle("performance")}
        >
          <PerformanceSection initialSettings={performanceSettings} />
        </CollapsibleSection>
      )}
    </div>
  );
}
