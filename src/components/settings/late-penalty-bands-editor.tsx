"use client";

import { validateBands, type PenaltyBand } from "@/lib/attendance/late-penalty-bands";

/**
 * Repeatable band-row editor. Each band maps a monthly late-day range to a
 * number of days of salary to deduct. The top band may leave "max" blank for an
 * open-ended "N+" range. Shows an inline validation message for gaps/overlaps.
 */
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
    onChange([...value, { min_late_days: Math.min(nextMin, 31), max_late_days: null, deduction_days: 1 }]);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>From (late days)</span>
        <span>To (blank = and above)</span>
        <span>Deduct (days salary)</span>
        <span />
      </div>
      {value.map((b, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
          <input
            type="number"
            min={1}
            max={31}
            className="rounded-md border px-2 py-1.5 text-sm"
            value={b.min_late_days}
            onChange={(e) => update(i, { min_late_days: Number(e.target.value) })}
          />
          <input
            type="number"
            min={1}
            max={31}
            placeholder="∞"
            className="rounded-md border px-2 py-1.5 text-sm"
            value={b.max_late_days ?? ""}
            onChange={(e) =>
              update(i, { max_late_days: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <input
            type="number"
            min={0}
            max={31}
            step={0.5}
            className="rounded-md border px-2 py-1.5 text-sm"
            value={b.deduction_days}
            onChange={(e) => update(i, { deduction_days: Number(e.target.value) })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-md border px-2 py-1.5 text-sm text-muted-foreground hover:text-destructive"
            aria-label="Remove band"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          + Add band
        </button>
        {!validation.ok && value.length > 0 && (
          <span className="text-xs text-destructive">{validation.error}</span>
        )}
      </div>
    </div>
  );
}
