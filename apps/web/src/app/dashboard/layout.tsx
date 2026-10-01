import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getPendingCounts } from "@/actions/notifications";
import { getCurrentUser, isMembershipLookupError } from "@/lib/current-user";
import { getMyOrgs } from "@/actions/active-org";
import { ReportFeedbackTriggerRoot } from "@/components/feedback/report-feedback-trigger";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { canUseAssistant } from "@/lib/assistant/permissions";
import { hasFeature } from "@/config/plans";
import { WorkspaceUnavailable } from "@/components/layout/workspace-unavailable";
import { SetPasswordBanner } from "@/components/layout/set-password-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A membership read that FAILED is not a membership read that found nothing.
  // Redirecting on an outage lands the user on /onboarding's "No workspace
  // found" wall, which reads as "your company is gone" (2026-09-26 outage).
  let userCtx;
  try {
    userCtx = await getCurrentUser();
  } catch (err) {
    if (isMembershipLookupError(err)) return <WorkspaceUnavailable />;
    throw err;
  }

  if (!userCtx) {
    redirect("/onboarding");
  }

  const orgs = await getMyOrgs();
  const badges = await getPendingCounts();
  const role = userCtx.role;
  const plan = userCtx.plan;
  const jambaHireEnabled = userCtx.jambaHireEnabled;
  const features = {
    attendance: userCtx.attendanceEnabled,
    grievances: userCtx.grievancesEnabled,
    jambahire: userCtx.jambaHireEnabled,
    referrals:
      userCtx.jambaHireEnabled &&
      process.env.JAMBAHIRE_REFERRALS_ENABLED === "true",
    jambageo: userCtx.jambaGeoEnabled,
  };

  const assistantClientFlag = process.env.NEXT_PUBLIC_ASSISTANT_ENABLED === "true";
  const assistantAccess = canUseAssistant({
    plan,
    role,
    orgEnabled: userCtx.assistantEnabled,
    monthUsage: 0,
  });
  const assistantEnabled = assistantClientFlag && assistantAccess.allowed;

  return (
    <ReportFeedbackTriggerRoot>
      <div className="flex min-h-screen">
        <Sidebar badges={badges} role={role} plan={plan} features={features} employmentType={userCtx.employmentType} />
        <div className="flex flex-1 flex-col">
          <Header
            jambaHireEnabled={jambaHireEnabled}
            jambaGeoEnabled={userCtx.jambaGeoEnabled}
            insightsEnabled={hasFeature(plan, "analytics", userCtx.customFeatures ?? null)}
            badges={badges}
            role={role}
            orgs={orgs}
            activeOrgId={userCtx.orgId}
          />
          <SetPasswordBanner />
          <main className="flex-1 p-6">{children}</main>
        </div>
        <AssistantLauncher enabled={assistantEnabled} role={role} />
      </div>
    </ReportFeedbackTriggerRoot>
  );
}

