import { notFound, redirect } from "next/navigation";
import { getJob, listApplications } from "@/actions/hire";
import { isAdmin } from "@/lib/current-user";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { JobDetailClient } from "@/components/hire/job-detail-client";
import { listDepartments } from "@/actions/departments";

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const [jobResult, appsResult, deptsResult] = await Promise.all([
    getJob(params.id),
    listApplications(params.id),
    listDepartments(),
  ]);

  if (!jobResult.success) notFound();

  const applications = appsResult.success ? appsResult.data : [];
  const departments = deptsResult.success ? deptsResult.data : [];
  const admin = isAdmin(access.user.role);

  return (
    <JobDetailClient
      job={jobResult.data}
      applications={applications}
      departments={departments}
      isAdmin={admin}
    />
  );
}
