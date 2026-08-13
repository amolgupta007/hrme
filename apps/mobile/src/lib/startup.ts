import { Sentry } from "@/lib/sentry";

/**
 * Cold-start instrumentation (Mobile PRD-04 §4).
 *
 * The PRD sets a hard budget — "cold start → interactive Home: < 2s on a
 * mid-range device" — but until now nothing measured it, so the budget was an
 * assertion rather than a fact. This records the elapsed time from JS bundle
 * evaluation to the first committed render of the root navigator and reports it
 * to Sentry, where it can be tracked per release.
 *
 * Bundle-eval time is not process start: native init and splash happen before
 * any JS runs, so this measures the JS half of the budget. That is the half we
 * can actually regress with a bad import, which makes it the useful signal.
 */

const bundleEvaluatedAt = Date.now();

let reported = false;

/** Cold-start budget from PRD-04 §4, in milliseconds. */
export const COLD_START_BUDGET_MS = 2_000;

/**
 * Call once, from the root layout's mount effect. Idempotent — a Fast Refresh
 * or a re-mount must not emit a second, meaningless measurement.
 */
export function markColdStartInteractive(): void {
  if (reported) return;
  reported = true;

  const elapsedMs = Date.now() - bundleEvaluatedAt;

  try {
    // A measurement, not an event: this should be queryable per release, and it
    // must never look like an error in the issues stream.
    Sentry.setMeasurement?.("cold_start_js_ms", elapsedMs, "millisecond");
    Sentry.setTag?.("cold_start_within_budget", String(elapsedMs <= COLD_START_BUDGET_MS));
  } catch {
    // Sentry may be DSN-gated off (see lib/sentry.ts) — instrumentation must
    // never be the thing that breaks startup.
  }

  if (__DEV__) {
    console.log(
      `[startup] JS cold start → interactive: ${elapsedMs}ms (budget ${COLD_START_BUDGET_MS}ms)`,
    );
  }
}

/** Exposed for tests/diagnostics. */
export function coldStartElapsedMs(): number {
  return Date.now() - bundleEvaluatedAt;
}
