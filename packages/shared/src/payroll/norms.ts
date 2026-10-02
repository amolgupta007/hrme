// Industry-norm side notes shown under payroll settings (plan D5).
//
// ADVISORY ONLY. Nothing here is enforced, and none of it is used in any
// calculation — the engine takes every number from the org's own settings and
// rules. Each note says what is usual, when it was last reviewed, and that the
// org's CA / payroll consultant has the final word. `deviates` lets the UI show
// a soft "differs from the usual" hint; it never blocks a save.
//
// STATUS: draft text, written 2026-10-02 — must be reviewed before it ships.
// Statements were not taken as authoritative from memory: anything that is a
// statutory figure says "confirm" and carries `asOf`.

export interface Norm {
  /** One or two plain sentences: what most Indian SMBs do / what the law has said. */
  text: string;
  /** Short "usual value" label for compact display. */
  typical?: string;
  /** When this note was last reviewed. */
  asOf: string;
  /** True when the note states a statutory figure the org should confirm. */
  statutory?: boolean;
  /** Returns a short hint when the org's value differs from the usual one. `month` is the pay month being viewed. */
  deviates?: (value: unknown, ctx?: { month?: string }) => string | null;
}

const AS_OF = "2026-10";
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

export const PAYROLL_NORMS: Record<string, Norm> = {
  // ── Settings ──────────────────────────────────────────────────────────────
  "settings.input_mode": {
    text:
      "Offer letters in India usually quote annual CTC, so most payroll tools start from CTC. Teams that agree a fixed monthly salary (gross) with each person often find gross-first simpler: the take-home is predictable and CTC is worked out from it.",
    typical: "CTC-first",
    asOf: AS_OF,
  },
  "settings.day_basis": {
    text:
      "Common choices are the calendar days of the month (28–31) or a fixed 26 or 30 days. Calendar days pays the same salary every month and makes a day's pay vary slightly by month; a fixed number does the opposite. Pick one and apply it consistently — it also sets the per-day rate for unpaid days.",
    typical: "Calendar days, or a fixed 26 / 30",
    asOf: AS_OF,
    deviates: (v) => {
      const d = num(v);
      return Number.isFinite(d) && ![26, 30].includes(d) ? "Most fixed-day setups use 26 or 30" : null;
    },
  },
  "settings.lop_source": {
    text:
      "Most organisations deduct pay only for leave that was approved as unpaid. Deducting automatically when a leave balance goes negative is also common, but only works if leave balances are kept accurate. Turning it off means unpaid days are adjusted by hand.",
    typical: "Approved unpaid leave",
    asOf: AS_OF,
  },
  "settings.lop_treatment": {
    text:
      "Reducing each salary component for the days paid keeps statutory deductions (PF, ESI) in step with what was actually earned, and is the more common approach. A single 'Loss of pay' line is easier to read but leaves PF and ESI on the full salary.",
    typical: "Reduce each component",
    asOf: AS_OF,
  },
  "settings.prorate_joiners_leavers": {
    text: "It is standard to pay a joiner from the joining date and a leaver up to the last working day.",
    typical: "On",
    asOf: AS_OF,
    deviates: (v) => (v === false ? "Most payrolls pay joiners and leavers only for days employed" : null),
  },
  "settings.rounding": {
    text:
      "Pay slips normally show whole rupees: each deduction is rounded, and net pay is gross minus those rounded deductions. Statutory returns (PF/ESI challans) have their own rounding rules, set by those systems.",
    typical: "Round to the rupee",
    asOf: AS_OF,
  },

  // ── Components ────────────────────────────────────────────────────────────
  "component.basic_pct": {
    text:
      "Under the new labour codes, 'wages' (Basic + DA) are generally expected to be at least 50% of total pay, because PF, gratuity and other benefits are calculated on them. Many employers have moved Basic to 50% for this reason. Confirm the exact treatment with your CA.",
    typical: "50%",
    asOf: AS_OF,
    statutory: true,
    deviates: (v) => (num(v) < 50 ? "Below 50% — check against the labour-code wage rule" : null),
  },
  "component.hra_pct": {
    text: "HRA is commonly set at 40% of Basic (50% in the four metro cities). It is only tax-exempt under the old tax regime, and only up to actual rent.",
    typical: "40% of Basic (50% in metros)",
    asOf: AS_OF,
  },
  "component.balancing": {
    text: "One 'special allowance' line usually absorbs whatever is left of gross after the named components, so the total always adds up.",
    asOf: AS_OF,
  },
  "component.gratuity": {
    text:
      "Gratuity is paid on leaving after (usually) five years of service. Employers that include it in CTC commonly set aside 4.81% of Basic each month. It is not paid monthly.",
    typical: "4.81% of Basic, if included in CTC",
    asOf: AS_OF,
    statutory: true,
  },

  // ── Statutory rules ───────────────────────────────────────────────────────
  "rule.epf": {
    text:
      "EPF is 12% from the employee and 12% from the employer on Basic + DA, up to the EPFO wage ceiling. On 16 Sep 2026 the Cabinet approved raising that ceiling from ₹15,000 to ₹25,000 a month: pay months up to August 2026 use ₹15,000 (₹1,800 each), September 2026 onwards ₹25,000 (₹3,000 each). Contributing on wages above the ceiling is voluntary. Part of the employer's 12% goes to the pension scheme (EPS) — confirm with your PF consultant how the pension share is capped after this change.",
    typical: "12% + 12%; ceiling ₹25,000 from Sep 2026 (₹15,000 before)",
    asOf: AS_OF,
    statutory: true,
    deviates: (v, ctx) => {
      const ceiling = (v as { wageCeiling?: number | null })?.wageCeiling;
      if (ceiling === undefined) return null;
      const expected = ctx?.month && ctx.month < "2026-09" ? 15000 : 25000;
      return ceiling !== expected
        ? `Statutory ceiling for this month is ₹${expected.toLocaleString("en-IN")} — confirm whether yours is a deliberate company choice`
        : null;
    },
  },
  "rule.esi": {
    text:
      "ESI covers employees whose wages are up to ₹21,000 a month: 0.75% from the employee, 3.25% from the employer. Under the labour codes 'wages' may mean Basic + DA rather than full gross — whichever you use, apply it the same way for eligibility and for the contribution. Confirm with your consultant.",
    typical: "0.75% + 3.25%, wages ≤ ₹21,000",
    asOf: AS_OF,
    statutory: true,
    deviates: (v) => {
      const p = v as { eeRate?: number; erRate?: number; eligibility?: { max?: number } };
      if (!p?.eligibility) return null;
      if (p.eeRate !== 0.75 || p.erRate !== 3.25) return "Rates differ from 0.75% / 3.25%";
      return null;
    },
  },
  "rule.pt": {
    text:
      "Professional tax is set by each state, with its own slabs. Some states exempt women up to a salary limit, and some charge a higher amount in February to reach the annual maximum (Maharashtra: ₹200 a month, ₹300 in February; check current slabs). States like Delhi have none.",
    asOf: AS_OF,
    statutory: true,
  },
  "rule.lwf": {
    text:
      "Labour welfare fund is a small state contribution, usually collected once or twice a year (in Maharashtra, in June and December), with the employer paying more than the employee. Amounts and months vary by state.",
    asOf: AS_OF,
    statutory: true,
    deviates: (v) => ((v as { months?: string[] })?.months?.length === 0 ? "No months set — nothing will be collected" : null),
  },
  "rule.tds": {
    text:
      "Employers deducting salary TDS estimate each person's tax for the financial year under their chosen regime and spread it over the remaining months. Whether to deduct at all is the employer's obligation under the Income-tax Act — if you switch it off, make sure that is a decision your CA agrees with.",
    asOf: AS_OF,
    statutory: true,
  },
};

/** Look up a note; unknown keys render nothing. */
export function normFor(key: string): Norm | null {
  return PAYROLL_NORMS[key] ?? null;
}
