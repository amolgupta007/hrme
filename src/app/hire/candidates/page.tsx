import { listCandidates } from "@/actions/hire";
import { getCurrentUser } from "@/lib/current-user";
import { CandidatesClient } from "@/components/hire/candidates-client";

export default async function CandidatesPage() {
  const [candidatesResult, user] = await Promise.all([listCandidates(), getCurrentUser()]);
  const candidates = candidatesResult.success ? candidatesResult.data : [];

  return <CandidatesClient candidates={candidates} />;
}
