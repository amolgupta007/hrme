import { listInterviews, listAllApplications } from "@/actions/hire";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { listEmployees } from "@/actions/employees";
import { InterviewsClient } from "@/components/hire/interviews-client";

export default async function InterviewsPage() {
  const [interviewsResult, appsResult, empsResult, user] = await Promise.all([
    listInterviews(),
    listAllApplications(),
    listEmployees(),
    getCurrentUser(),
  ]);

  const interviews = interviewsResult.success ? interviewsResult.data : [];
  const applications = appsResult.success ? appsResult.data : [];
  const employees = empsResult.success ? empsResult.data : [];
  const admin = user ? isAdmin(user.role) : false;

  return (
    <InterviewsClient
      interviews={interviews}
      applications={applications}
      employees={employees as any}
      isAdmin={admin}
    />
  );
}
