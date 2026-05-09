import { redirect } from "next/navigation";
import { listCandidates } from "@/actions/hire";
import { requireJambaHireAccess } from "@/lib/jambahire-access";
import { CandidatesClient } from "@/components/hire/candidates-client";

export default async function CandidatesPage() {
  const access = await requireJambaHireAccess();
  if (!access.allowed) redirect("/dashboard");

  const candidatesResult = await listCandidates();
  const candidates = candidatesResult.success ? candidatesResult.data : [];

  return <CandidatesClient candidates={candidates} />;
}
