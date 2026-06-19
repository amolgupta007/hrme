import { getOwnershipTransferByToken } from "@/actions/ownership";
import { ClaimClient } from "@/components/transfer/claim-client";

export default async function TransferClaimPage({ params }: { params: { token: string } }) {
  const res = await getOwnershipTransferByToken(params.token);
  if (!res.success) {
    return <CenteredMessage title="Invitation unavailable" body={res.error} />;
  }
  if (!res.data) {
    return <CenteredMessage title="This invitation is no longer valid" body="It may have been accepted, cancelled, or expired." />;
  }
  return <ClaimClient token={params.token} orgName={res.data.orgName} inviterName={res.data.inviterName} />;
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-24 max-w-md rounded-xl border p-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <a href="/dashboard" className="mt-4 inline-block text-sm text-primary underline">Go to dashboard</a>
    </div>
  );
}
