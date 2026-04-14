import { listCandidates } from "@/actions/hire";
import { CandidatesClient } from "@/components/hire/candidates-client";

export default async function CandidatesPage() {
  const candidatesResult = await listCandidates();
  const candidates = candidatesResult.success ? candidatesResult.data : [];

  return <CandidatesClient candidates={candidates} />;
}
