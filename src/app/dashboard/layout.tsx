import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getPendingCounts } from "@/actions/notifications";
import { getCurrentUser } from "@/lib/current-user";
import { ReportFeedbackTriggerRoot } from "@/components/feedback/report-feedback-trigger";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { canUseAssistant } from "@/lib/assistant/permissions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userCtx = await getCurrentUser();
  if (!userCtx) {
    redirect("/onboarding");
  }

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
        <Sidebar badges={badges} role={role} plan={plan} features={features} />
        <div className="flex flex-1 flex-col">
          <Header
            jambaHireEnabled={jambaHireEnabled}
            jambaGeoEnabled={userCtx.jambaGeoEnabled}
            badges={badges}
            role={role}
          />
          <main className="flex-1 p-6">{children}</main>
        </div>
        <AssistantLauncher enabled={assistantEnabled} role={role} />
      </div>
    </ReportFeedbackTriggerRoot>
  );
}
