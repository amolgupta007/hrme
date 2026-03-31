import { notFound } from "next/navigation";
import { getJob, listApplications } from "@/actions/hire";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { JobDetailClient } from "@/components/hire/job-detail-client";
import { listDepartments } from "@/actions/departments";

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const [jobResult, appsResult, deptsResult, user] = await Promise.all([
    getJob(params.id),
    listApplications(params.id),
    listDepartments(),
    getCurrentUser(),
  ]);

  if (!jobResult.success) notFound();

  const applications = appsResult.success ? appsResult.data : [];
  const departments = deptsResult.success ? deptsResult.data : [];
  const admin = user ? isAdmin(user.role) : false;

  return (
    <JobDetailClient
      job={jobResult.data}
      applications={applications}
      departments={departments}
      isAdmin={admin}
    />
  );
}
