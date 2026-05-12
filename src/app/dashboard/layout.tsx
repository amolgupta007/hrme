import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getPendingCounts } from "@/actions/notifications";
import { getCurrentUser } from "@/lib/current-user";
import { ReportFeedbackTriggerRoot } from "@/components/feedback/report-feedback-trigger";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [badges, userCtx] = await Promise.all([
    getPendingCounts(),
    getCurrentUser(),
  ]);

  const role = userCtx?.role ?? "employee";
  const plan = userCtx?.plan ?? "starter";
  const jambaHireEnabled = userCtx?.jambaHireEnabled ?? false;
  const features = {
    attendance: userCtx?.attendanceEnabled ?? false,
    grievances: userCtx?.grievancesEnabled ?? false,
    jambahire: userCtx?.jambaHireEnabled ?? false,
    referrals:
      (userCtx?.jambaHireEnabled ?? false) &&
      process.env.JAMBAHIRE_REFERRALS_ENABLED === "true",
  };

  return (
    <ReportFeedbackTriggerRoot>
      <div className="flex min-h-screen">
        <Sidebar badges={badges} role={role} plan={plan} features={features} />
        <div className="flex flex-1 flex-col">
          <Header jambaHireEnabled={jambaHireEnabled} badges={badges} role={role} />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </ReportFeedbackTriggerRoot>
  );
}
