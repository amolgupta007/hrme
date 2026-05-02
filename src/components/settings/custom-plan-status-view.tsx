"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  cancelMyCustomPlanRequest,
  acceptCounterOffer,
  type CustomPlanRequest,
} from "@/actions/custom-plan";
import {
  ANNUAL_MULTIPLIER,
  formatPaise,
  CUSTOM_PER_FEATURE_DEFAULT_RATE,
  PLATFORM_FEES,
} from "@/config/billing";

interface Props {
  request: CustomPlanRequest;
  employeeCount: number;
}

export function CustomPlanStatusView({ request, employeeCount }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleCancel() {
    if (!confirm("Cancel this custom plan request?")) return;
    setBusy(true);
    try {
      const r = await cancelMyCustomPlanRequest(request.id);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Request cancelled.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    setBusy(true);
    try {
      const r = await acceptCounterOffer(request.id);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Counter-offer accepted. Awaiting founder activation.");
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (request.status === "rejected") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h3 className="font-semibold mb-2">Request not approved</h3>
        {request.rejection_reason && (
          <p className="text-sm mb-3">
            <strong>Reason:</strong> {request.rejection_reason}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Submit a new request, or contact support@jambahr.com.
        </p>
      </div>
    );
  }

  if (request.status === "pending") {
    return (
      <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10 p-6">
        <h3 className="font-semibold mb-2">Under review</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Submitted {new Date(request.created_at).toLocaleDateString("en-IN")}. We respond within 1 business day.
        </p>
        <RequestSummary request={request} />
        <Button variant="outline" size="sm" onClick={handleCancel} disabled={busy} className="mt-4">
          Cancel request
        </Button>
      </div>
    );
  }

  if (request.status === "counter_offered") {
    const founderRate = request.founder_per_feature_rate ?? CUSTOM_PER_FEATURE_DEFAULT_RATE;
    const founderFee = request.founder_platform_fee ?? PLATFORM_FEES.custom;
    const founderCap = request.founder_max_employees ?? request.requested_employees;
    const monthly = request.requested_features.length * Math.min(employeeCount, founderCap) * founderRate;
    const recurring =
      request.requested_billing_cycle === "annual" ? monthly * ANNUAL_MULTIPLIER : monthly;

    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
        <h3 className="font-semibold mb-2">Counter-offer from JambaHR</h3>
        <p className="text-sm text-muted-foreground mb-4">
          The founder reviewed your request and proposed adjusted terms.
        </p>

        {request.founder_notes && (
          <div className="rounded-lg bg-background p-3 text-sm mb-4">
            <p className="font-medium text-xs mb-1">Founder notes</p>
            <p className="text-muted-foreground">{request.founder_notes}</p>
          </div>
        )}

        <div className="space-y-1.5 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform fee (one-time)</span>
            <span className="font-medium">{formatPaise(founderFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Per-feature rate</span>
            <span className="font-medium">{formatPaise(founderRate)} / employee / month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max employees</span>
            <span className="font-medium">{founderCap}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5">
            <span className="text-muted-foreground">
              Recurring at current count ({Math.min(employeeCount, founderCap)} employees, {request.requested_billing_cycle})
            </span>
            <span className="font-semibold">
              {formatPaise(recurring)} / {request.requested_billing_cycle === "annual" ? "year" : "month"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pt-1">+ 18% GST</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleAccept} disabled={busy}>Accept counter-offer</Button>
          <Button variant="outline" onClick={handleCancel} disabled={busy}>Decline</Button>
        </div>
      </div>
    );
  }

  if (request.status === "accepted") {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
        <h3 className="font-semibold mb-2">Counter-offer accepted</h3>
        <p className="text-sm text-muted-foreground">
          Awaiting founder activation. You&apos;ll receive an email with the checkout link shortly.
        </p>
      </div>
    );
  }

  if (request.status === "approved") {
    return (
      <div className="rounded-xl border border-green-300/60 bg-green-50/40 dark:bg-green-900/10 p-6">
        <h3 className="font-semibold mb-2">Approved!</h3>
        <p className="text-sm text-muted-foreground">
          Check your email for the Razorpay checkout link. Once payment is confirmed, your custom plan activates automatically.
        </p>
      </div>
    );
  }

  return null;
}

function RequestSummary({ request }: { request: CustomPlanRequest }) {
  return (
    <div className="space-y-1 text-sm">
      <p>
        <strong>Features:</strong> {request.requested_features.length} selected
      </p>
      <p>
        <strong>Employees:</strong> {request.requested_employees}
      </p>
      <p>
        <strong>Cycle:</strong> {request.requested_billing_cycle === "annual" ? "Annual" : "Monthly"}
      </p>
    </div>
  );
}
