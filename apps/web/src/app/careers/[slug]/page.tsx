import { notFound } from "next/navigation";
import { getPublicJobs } from "@/actions/hire";
import { CareersPageClient } from "@/components/hire/careers-page-client";

export default async function CareersPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { source?: string };
}) {
  const result = await getPublicJobs(params.slug);
  if (!result.success) notFound();
  return (
    <CareersPageClient
      org={result.data.org}
      jobs={result.data.jobs}
      defaultSource={searchParams.source}
    />
  );
}
