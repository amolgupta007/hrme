import { getAgreementByToken } from "@/actions/contractor-agreements";
import { AgreementSignForm } from "@/components/contractors/agreement-sign-form";
import { XCircle, Building2, Mail } from "lucide-react";

interface Props {
  params: { token: string };
  searchParams: { response?: string };
}

function CenteredCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
        <XCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h1 className="text-xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}

export default async function AgreementPage({ params, searchParams }: Props) {
  const result = await getAgreementByToken(params.token);

  if (!result.success) {
    return (
      <CenteredCard
        title="Link not found"
        message="This agreement link is invalid or has expired."
      />
    );
  }

  const a = result.data;
  // autoSign = came via one-click "Sign directly" link in email AND agreement is still actionable
  const autoSign = searchParams.response === "sign" && a.status === "sent";

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border mb-4">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-primary">{a.orgName}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
          <p className="text-muted-foreground mt-1">
            {a.orgName} · for {a.contractorName}
          </p>
        </div>

        {/* Agreement body */}
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <article className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 max-h-[400px] overflow-y-auto">
            {a.body_text}
          </article>
        </div>

        {/* Action / Status */}
        {a.status === "signed" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="text-emerald-700 font-semibold">
              Signed by {a.signed_by_name}
            </p>
            <p className="text-sm text-emerald-600 mt-1">
              on {new Date(a.signed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        ) : a.status === "declined" ? (
          <div className="rounded-2xl border border-gray-200 bg-muted p-6 text-center">
            <p className="text-sm text-muted-foreground">You declined this agreement.</p>
          </div>
        ) : a.status === "expired" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="text-sm text-amber-700">This agreement has expired. Please contact {a.orgName} for a new link.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <AgreementSignForm
              token={params.token}
              contractorName={a.contractorName}
              autoSign={autoSign}
            />
          </div>
        )}

        <div className="text-center text-xs text-gray-400">
          <Mail className="inline h-3 w-3 mr-1" />
          Powered by JambaHR
        </div>
      </div>
    </div>
  );
}
