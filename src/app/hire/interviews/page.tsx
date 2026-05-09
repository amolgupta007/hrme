import { redirect } from "next/navigation";
import { listInterviews, listAllApplications } from "@/actions/hire";
import { isAdmin } from "@/lib/current-user";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { listEmployees } from "@/actions/employees";
import { InterviewsClient } from "@/components/hire/interviews-client";

export default async function InterviewsPage() {
  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const [interviewsResult, appsResult, empsResult] = await Promise.all([
    listInterviews(),
    listAllApplications(),
    listEmployees(),
  ]);

  const interviews = interviewsResult.success ? interviewsResult.data : [];
  const applications = appsResult.success ? appsResult.data : [];
  const employees = empsResult.success ? empsResult.data : [];
  const admin = isAdmin(access.user.role);

  return (
    <InterviewsClient
      interviews={interviews}
      applications={applications}
      employees={employees as { id: string; first_name: string; last_name: string }[]}
      isAdmin={admin}
    />
  );
}
