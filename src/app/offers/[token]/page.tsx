import { getOfferByToken, respondToOffer } from "@/actions/hire";
import { CheckCircle2, XCircle, Building2 } from "lucide-react";
import { redirect } from "next/navigation";

interface Props {
  params: { token: string };
  searchParams: { response?: string };
}

async function handleOfferResponse(token: string, decision: "accepted" | "declined") {
  "use server";
  await respondToOffer(token, decision);
  redirect(`/offers/${token}`);
}

export default async function OfferResponsePage({ params, searchParams }: Props) {
  const responseParam = searchParams.response;
  if (responseParam === "accepted" || responseParam === "declined") {
    const respondResult = await respondToOffer(params.token, responseParam);
    if (!respondResult.success && respondResult.error === "Offer not found") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
            <h1 className="text-xl font-bold mb-2">Offer Not Found</h1>
            <p className="text-sm text-gray-500">This offer link is invalid or has expired.</p>
          </div>
        </div>
      );
    }
  }

  const result = await getOfferByToken(params.token);

  if (!result.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-xl font-bold mb-2">Offer Not Found</h1>
          <p className="text-sm text-gray-500">This offer link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const { offer, orgName } = result.data;
  const alreadyResponded = offer.status === "accepted" || offer.status === "declined";

  const acceptAction = handleOfferResponse.bind(null, params.token, "accepted");
  const declineAction = handleOfferResponse.bind(null, params.token, "declined");

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border mb-4">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-700">{orgName}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Offer Letter</h1>
        </div>

        {/* Offer Card */}
        <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
          <div className="border-b pb-4">
            <p className="text-sm text-gray-500">Congratulations,</p>
            <p className="text-xl font-bold mt-1">{offer.candidate_name}</p>
          </div>

          <p className="text-sm text-gray-600">
            We are pleased to extend this offer for the position of{" "}
            <strong className="text-gray-900">{offer.role_title}</strong> at{" "}
            <strong className="text-gray-900">{orgName}</strong>.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-indigo-50 px-4 py-3">
              <p className="text-xs text-indigo-600 font-medium">Annual CTC</p>
              <p className="text-lg font-bold text-indigo-700 mt-0.5">
                ₹{(offer.ctc / 100000).toFixed(2)} LPA
              </p>
              <p className="text-xs text-indigo-500">₹{offer.ctc.toLocaleString("en-IN")}/year</p>
            </div>
            <div className="rounded-xl bg-purple-50 px-4 py-3">
              <p className="text-xs text-purple-600 font-medium">Joining Date</p>
              <p className="text-base font-bold text-purple-700 mt-0.5">
                {new Date(offer.joining_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {offer.department_name && (
            <div className="text-sm">
              <span className="text-gray-500">Department: </span>
              <span className="font-medium">{offer.department_name}</span>
            </div>
          )}

          {offer.reporting_manager_name && (
            <div className="text-sm">
              <span className="text-gray-500">Reporting Manager: </span>
              <span className="font-medium">{offer.reporting_manager_name}</span>
            </div>
          )}

          {offer.additional_terms && (
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Additional Terms</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{offer.additional_terms}</p>
            </div>
          )}
        </div>

        {/* Response Section */}
        {alreadyResponded ? (
          <div className={`rounded-2xl border p-6 text-center ${
            offer.status === "accepted"
              ? "bg-green-50 border-green-200"
              : "bg-gray-50 border-gray-200"
          }`}>
            {offer.status === "accepted" ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-500 mb-3" />
                <h2 className="text-lg font-bold text-green-800">Offer Accepted!</h2>
                <p className="text-sm text-green-600 mt-1">
                  You&apos;ve accepted the offer. {orgName} will be in touch with next steps.
                </p>
              </>
            ) : (
              <>
                <XCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                <h2 className="text-lg font-bold text-gray-700">Offer Declined</h2>
                <p className="text-sm text-gray-500 mt-1">
                  You&apos;ve declined this offer. Thank you for considering {orgName}.
                </p>
              </>
            )}
          </div>
        ) : offer.status === "expired" ? (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6 text-center">
            <p className="text-sm font-medium text-yellow-800">This offer has expired.</p>
            <p className="text-xs text-yellow-600 mt-1">Please contact {orgName} if you have questions.</p>
          </div>
        ) : offer.status === "sent" ? (
          <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-4">
            <p className="text-sm text-gray-600 text-center">Please respond to this offer:</p>
            <div className="flex gap-3">
              <form action={acceptAction} className="flex-1">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold py-3 text-sm transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Accept Offer
                </button>
              </form>
              <form action={declineAction} className="flex-1">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 text-sm transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                  Decline
                </button>
              </form>
            </div>
          </div>
        ) : null}

        <p className="text-center text-xs text-gray-400">
          Powered by JambaHire · {orgName}
        </p>
      </div>
    </div>
  );
}
