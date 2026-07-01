"use client";

import { validateBands, type PenaltyBand } from "@/lib/attendance/late-penalty-bands";

/**
 * Rule-builder for late-penalty bands. Each rule reads:
 *   "If late FROM to TO days → deduct N day(s) salary"
 * Every field is a dropdown so an invalid value can't be typed. The top rule's
 * "to" can be "and above" for an open-ended range. Shows an inline validation
 * message for gaps/overlaps.
 */

// Whole late-day counts 1..31 for the range dropdowns.
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);
// Deduction amounts in days of salary (half-day granularity, then whole days).
const DEDUCT_OPTIONS = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10, 12, 15,
];

function deductLabel(n: number): string {
  return `${n} day${n === 1 ? "" : "s"} salary`;
}

export function LatePenaltyBandsEditor({
  value,
  onChange,
}: {
  value: PenaltyBand[];
  onChange: (bands: PenaltyBand[]) => void;
}) {
  const validation = validateBands(value);

  function update(i: number, patch: Partial<PenaltyBand>) {
    onChange(value.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    const last = value[value.length - 1];
    const nextMin = last?.max_late_days != null ? last.max_late_days + 1 : (last?.min_late_days ?? 0) + 1;
    onChange([
      ...value,
      { min_late_days: Math.min(nextMin, 31), max_late_days: null, deduction_days: 1 },
    ]);
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No rules yet. Add a rule to start deducting salary for late days.
        </p>
      )}

      {value.map((b, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
        >
          <span className="text-muted-foreground">If late</span>

          <select
            className="rounded-md border bg-background px-2 py-1"
            value={b.min_late_days}
            onChange={(e) => update(i, { min_late_days: Number(e.target.value) })}
            aria-label="From late days"
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <span className="text-muted-foreground">to</span>

          <select
            className="rounded-md border bg-background px-2 py-1"
            value={b.max_late_days ?? ""}
            onChange={(e) =>
              update(i, { max_late_days: e.target.value === "" ? null : Number(e.target.value) })
            }
            aria-label="To late days"
          >
            <option value="">and above</option>
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <span className="text-muted-foreground">days &rarr; deduct</span>

          <select
            className="rounded-md border bg-background px-2 py-1"
            value={b.deduction_days}
            onChange={(e) => update(i, { deduction_days: Number(e.target.value) })}
            aria-label="Deduction days"
          >
            {DEDUCT_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {deductLabel(d)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => remove(i)}
            className="ml-auto rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
            aria-label="Remove rule"
          >
            Remove
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          + Add rule
        </button>
        {!validation.ok && value.length > 0 && (
          <span className="text-xs text-destructive">{validation.error}</span>
        )}
      </div>
    </div>
  );
}
