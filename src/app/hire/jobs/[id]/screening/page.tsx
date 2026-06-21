import { redirect } from "next/navigation";
import { assertJambaHireAccess } from "@/lib/jambahire-access";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getScreeningResults, getScreeningRoster } from "@/actions/screening";
import { ScreeningClient } from "@/components/hire/screening/screening-client";

export default async function ScreeningPage({ params }: { params: { id: string } }) {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) redirect("/dashboard/settings#billing");
  const { user } = gate;

  const supabase = createAdminSupabase();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", params.id)
    .eq("org_id", user.orgId)
    .single();
  if (!job) redirect("/hire/jobs");

  const [results, roster] = await Promise.all([
    getScreeningResults(params.id),
    getScreeningRoster(params.id),
  ]);
  return (
    <ScreeningClient
      jobId={params.id}
      jobTitle={(job as any).title}
      results={results.success ? results.data : []}
      roster={roster.success ? roster.data : []}
    />
  );
}
