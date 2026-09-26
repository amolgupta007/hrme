"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";

/**
 * Shown when membership could not be READ (MembershipLookupError) — a database
 * outage, not an account problem.
 *
 * Deliberately distinct from the /onboarding "No workspace found" wall. That
 * wall says "no admin has added you yet" and sends the user off to chase an
 * invite; showing it during an outage told owners of live workspaces that their
 * company had vanished (2026-09-26). This screen says what is actually true:
 * we cannot reach the database right now, your data is fine, try again.
 *
 * Visual shell is lifted from onboarding-client.tsx on purpose — every
 * pre-dashboard gate should look like the same surface.
 */
export function WorkspaceUnavailable() {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();
  const [retried, setRetried] = useState(false);
  const wasRetrying = useRef(false);

  // If we're still mounted once a refresh settles, the database is still down.
  useEffect(() => {
    if (wasRetrying.current && !isRetrying) setRetried(true);
    wasRetrying.current = isRetrying;
  }, [isRetrying]);

  const handleRetry = () => {
    setRetried(false);
    startRetry(() => router.refresh());
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <CloudOff className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Can&apos;t reach your workspace right now
              </h1>
              <p className="mt-2 text-muted-foreground">
                JambaHR couldn&apos;t reach its database, so we can&apos;t load
                your workspace. This is a temporary outage on our side — not a
                problem with your account.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  Your data is safe.
                </span>{" "}
                Nothing has been deleted and you haven&apos;t been removed from
                anything. Your workspace will be exactly as you left it once the
                connection is back.
              </p>
              <p>
                Give it a minute, then hit{" "}
                <span className="font-medium text-foreground">Try again</span>.
              </p>
            </div>

            {retried && (
              <p className="text-center text-sm text-muted-foreground">
                Still no connection. Nothing is lost — try again shortly.
              </p>
            )}

            <div className="space-y-3">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
                />
                {isRetrying ? "Checking…" : "Try again"}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                Still stuck after a few minutes?{" "}
                <a
                  href="mailto:support@jambahr.com"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  support@jambahr.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
