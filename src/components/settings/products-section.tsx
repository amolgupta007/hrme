"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Briefcase, ExternalLink } from "lucide-react";
import { toggleJambaHire } from "@/actions/settings";
import { useRouter } from "next/navigation";

interface Props {
  jambaHireEnabled: boolean;
  isPlanEligible: boolean;
}

export function ProductsSection({ jambaHireEnabled, isPlanEligible }: Props) {
  const [enabled, setEnabled] = useState(jambaHireEnabled);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    if (!isPlanEligible) {
      toast.error("JambaHire requires the Business plan");
      return;
    }
    setLoading(true);
    const next = !enabled;
    try {
      const result = await toggleJambaHire(next);
      if (result.success) {
        setEnabled(next);
        toast.success(next ? "JambaHire enabled" : "JambaHire disabled");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold mb-1">Products</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Enable additional JambaHR products for your organization.
      </p>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950">
            <Briefcase className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">JambaHire</p>
              {!isPlanEligible && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  Business plan
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Full-featured hiring suite — job postings, candidate pipeline, interviews, and offer letters.
            </p>
            {enabled && (
              <a
                href="/hire"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Open JambaHire <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={loading || !isPlanEligible}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-indigo-600" : "bg-muted"
          }`}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
