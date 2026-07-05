import { getApplicationByLoiToken, respondToLOI } from "@/actions/hire";
import { CheckCircle2, XCircle, Clock, Building2, Mail } from "lucide-react";
import { redirect } from "next/navigation";

interface Props {
  params: { token: string };
  searchParams: { response?: string };
}

async function handleLoiResponse(token: string, decision: "accept" | "decline") {
  "use server";
  await respondToLOI(token, decision);
  redirect(`/loi/${token}`);
}

export default async function LoiResponsePage({ params, searchParams }: Props) {
  // Auto-handle one-click response from email
  const r = searchParams.response;
  if (r === "accept" || r === "decline") {
    await respondToLOI(params.token, r);
    redirect(`/loi/${params.token}`);
  }

  const result = await getApplicationByLoiToken(params.token);

  if (!result.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-xl font-bold mb-2">Link not found</h1>
          <p className="text-sm text-gray-500">{result.error}</p>
        </div>
      </div>
    );
  }

  const info = result.data;
  const acceptAction = handleLoiResponse.bind(null, params.token, "accept");
  const declineAction = handleLoiResponse.bind(null, params.token, "decline");

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border mb-4">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-700">{info.orgName}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Letter of Interest</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
          <div className="border-b pb-4">
            <p className="text-sm text-gray-500">Hi,</p>
            <p className="text-xl font-bold mt-1">{info.candidateName}</p>
          </div>

          <p className="text-sm text-gray-600 leading-relaxed">
            <strong className="text-gray-900">{info.orgName}</strong> would like to invite you to the
            interview process for the <strong className="text-gray-900">{info.roleTitle}</strong> role.
            Please let us know whether you&rsquo;re still interested in moving forward.
          </p>

          {info.expiresAt && info.status === "pending" && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Please respond by{" "}
                <strong>
                  {new Date(info.expiresAt).toLocaleDateString("en-IN", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </strong>
                . The link will expire afterwards.
              </span>
            </div>
          )}
        </div>

        {/* Action / Status */}
        {info.status === "pending" && (
          <div className="grid grid-cols-2 gap-3">
            <form action={acceptAction}>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors"
              >
                Yes, I&rsquo;m interested
              </button>
            </form>
            <form action={declineAction}>
              <button
                type="submit"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                No, not at this time
              </button>
            </form>
          </div>
        )}

        {info.status === "accepted" && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
            <h2 className="text-lg font-bold text-emerald-800">You&rsquo;re confirmed</h2>
            <p className="text-sm text-emerald-700 mt-1">
              Thanks — {info.orgName} will reach out shortly to schedule the first interview.
            </p>
          </div>
        )}

        {info.status === "declined" && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
            <XCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />
            <h2 className="text-lg font-bold text-gray-700">Response recorded</h2>
            <p className="text-sm text-gray-500 mt-1">
              Thanks for letting us know. Best of luck with your search.
            </p>
          </div>
        )}

        {info.status === "expired" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <Clock className="mx-auto h-10 w-10 text-amber-500 mb-3" />
            <h2 className="text-lg font-bold text-amber-800">This link has expired</h2>
            <p className="text-sm text-amber-700 mt-1">
              The response window has closed. If you&rsquo;re still interested, please reach out to{" "}
              {info.orgName} directly.
            </p>
          </div>
        )}

        <div className="text-center text-xs text-gray-400">
          <Mail className="inline h-3 w-3 mr-1" />
          Powered by JambaHire
        </div>
      </div>
    </div>
  );
}
