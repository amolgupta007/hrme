"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  approveCustomPlan,
  counterOfferCustomPlan,
  rejectCustomPlan,
  type CustomPlanRequestRow,
} from "@/actions/superadmin-custom-plan";

interface Props {
  requests: CustomPlanRequestRow[];
}

const STATUS_BADGE: Record<CustomPlanRequestRow["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  counter_offered: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-gray-200 text-gray-700",
  cancelled: "bg-gray-200 text-gray-700",
};

function fmt(paise: number): string {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function CustomPlansTable({ requests }: Props) {
  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No custom plan requests in the queue.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.map((r) => (
        <RequestRow key={r.id} request={r} />
      ))}
    </div>
  );
}

function RequestRow({ request }: { request: CustomPlanRequestRow }) {
  const [busy, setBusy] = useState(false);

  const [platformFee, setPlatformFee] = useState<number>(
    Math.round((request.founder_platform_fee ?? 499900) / 100)
  );
  const [perFeatureRate, setPerFeatureRate] = useState<number>(
    Math.round((request.founder_per_feature_rate ?? 12000) / 100)
  );
  const [maxEmployees, setMaxEmployees] = useState<number>(
    request.founder_max_employees ?? request.requested_employees
  );
  const [notes, setNotes] = useState<string>(request.founder_notes ?? "");

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string>("");

  async function handleApprove() {
    if (!confirm("Approve this request and create a Razorpay subscription?")) return;
    setBusy(true);
    try {
      const r = await approveCustomPlan({ requestId: request.id });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Approved. Customer will receive checkout email.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleCounter() {
    setBusy(true);
    try {
      const r = await counterOfferCustomPlan({
        requestId: request.id,
        platformFee: platformFee * 100,
        perFeatureRate: perFeatureRate * 100,
        maxEmployees,
        notes,
      });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Counter-offer sent.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }
    setBusy(true);
    try {
      const r = await rejectCustomPlan({ requestId: request.id, reason: rejectionReason });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Request rejected.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">{request.org_name}</p>
          <p className="text-xs text-gray-500">/{request.org_slug}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[request.status]}`}
        >
          {request.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm mb-4 p-3 bg-gray-50 rounded">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Features</p>
          <p className="font-medium">{request.requested_features.length}</p>
          <p className="text-xs text-gray-600 truncate" title={request.requested_features.join(", ")}>
            {request.requested_features.join(", ")}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Employees</p>
          <p className="font-medium">{request.requested_employees}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Cycle</p>
          <p className="font-medium capitalize">{request.requested_billing_cycle}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Platform fee (₹)</label>
          <input
            type="number"
            min={0}
            value={platformFee}
            onChange={(e) => setPlatformFee(Number(e.target.value) || 0)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Per-feature rate (₹)</label>
          <input
            type="number"
            min={0}
            value={perFeatureRate}
            onChange={(e) => setPerFeatureRate(Number(e.target.value) || 0)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Max employees</label>
          <input
            type="number"
            min={1}
            value={maxEmployees}
            onChange={(e) => setMaxEmployees(Number(e.target.value) || 1)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Estimated</label>
          <p className="px-2 py-1 text-sm text-gray-700">
            {fmt(platformFee * 100)} +{" "}
            {fmt(
              request.requested_features.length *
                Math.min(request.requested_employees, maxEmployees) *
                perFeatureRate *
                100 *
                (request.requested_billing_cycle === "annual" ? 10 : 1)
            )}
            /{request.requested_billing_cycle === "annual" ? "yr" : "mo"}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">Founder notes (visible to customer on counter-offer)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          rows={2}
          placeholder="Optional context..."
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={busy}
          className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={handleCounter}
          disabled={busy}
          className="rounded border border-blue-600 px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          {request.status === "counter_offered" ? "Update counter-offer" : "Counter-offer"}
        </button>
        <button
          type="button"
          onClick={() => setShowRejectModal(true)}
          disabled={busy}
          className="rounded border border-red-600 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Reject
        </button>
        <span className="text-xs text-gray-400 ml-auto self-center">
          {new Date(request.created_at).toLocaleString("en-IN")}
        </span>
      </div>

      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h4 className="font-semibold mb-2">Reject this request?</h4>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason (sent to customer in email)..."
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm mb-4"
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRejectModal(false)}
                className="rounded border border-gray-300 px-4 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={busy}
                className="rounded bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                Reject and email customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
