// The pay slip as a document (plan §6, step 6): ONE model, built from a
// processed entry's frozen snapshot, rendered by every surface — web view,
// PDF (download, email attachment, mobile). Layout follows the October sample:
// header (logo, company, address, title), a two-column employee block,
// earnings | deductions side by side, totals, net pay and the amount in words.
// Pure — no I/O.

export interface PayslipField {
  label: string;
  value: string;
}

export interface PayslipAmount {
  label: string;
  amount: number;
  /** e.g. "2 days" next to Loss of pay. */
  detail?: string;
}

export interface PayslipDocument {
  org: {
    /** Legal name as it should appear on the slip. */
    name: string;
    addressLines: string[];
    /** "www.medialoop.in | finance@medialoop.in" */
    contactLine: string | null;
    /** GSTIN, PAN, TAN, PF and ESI codes — whichever are set. */
    ids: PayslipField[];
  };
  /** "PAYSLIP FOR THE MONTH OF OCTOBER 2026" */
  title: string;
  month: string;
  employeeLeft: PayslipField[];
  employeeRight: PayslipField[];
  earnings: PayslipAmount[];
  deductions: PayslipAmount[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  netPayInWords: string;
  /** Only when the org chooses to show them. */
  employerContributions: PayslipAmount[] | null;
  ctcMonthly: number | null;
  footer: string[];
}

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// ── Amount in words (Indian numbering: thousand, lakh, crore) ──────────────

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE",
  "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} HUNDRED` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

function integerWords(n: number): string {
  if (n === 0) return "ZERO";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerWords(crore)} CRORE`);
  if (lakh) parts.push(`${belowHundred(lakh)} LAKH`);
  if (thousand) parts.push(`${belowHundred(thousand)} THOUSAND`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** 127506 → "RUPEES ONE LAKH TWENTY SEVEN THOUSAND FIVE HUNDRED SIX ONLY"; paise included when present. */
export function amountInWordsINR(amount: number): string {
  const total = Math.round(Math.max(0, amount) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  return `RUPEES ${integerWords(rupees)}${paise ? ` AND ${belowHundred(paise)} PAISE` : ""} ONLY`;
}

/** Indian grouping with two decimals and no symbol (PDF fonts lack ₹): 1,27,506.00 */
export function formatPayslipAmount(n: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ── Inputs ─────────────────────────────────────────────────────────────────

/** What a processed entry's `snapshot` holds (written by the engine run). */
export interface EntrySnapshot {
  month: string;
  employee: {
    name: string; designation?: string | null; department?: string | null; gender?: string | null;
    dateOfJoining?: string | null; pan?: string | null; uan?: string | null; pfNumber?: string | null;
    esicNumber?: string | null; workLocation?: string | null; bankLast4?: string | null;
    // Added with the configurable employee block (missing on older snapshots → not shown).
    code?: string | null; dateOfBirth?: string | null; bankName?: string | null; pran?: string | null;
    nationality?: string | null;
    /** Only ever the last 4 digits; a full Aadhaar number is never stored on a slip. */
    aadhaarLast4?: string | null;
  };
  days: { basis: number; paid: number; lop: number; latePenalty: number };
  lines: { code: string; label: string; kind: "earning" | "deduction" | "employer_contribution"; amount: number;
    source: string; showOnPayslip: boolean; order: number; note?: string }[];
  totals: { gross: number; deductions: number; employer: number; net: number; ctcMonthly: number };
}

/** A pre-engine entry, from its columns (no snapshot). */
export interface LegacyEntry {
  employeeName: string;
  designation?: string | null;
  department?: string | null;
  basic: number; hra: number; special: number; bonus: number;
  employeePf: number; professionalTax: number; tds: number;
  lopDays: number; lopDeduction: number; latePenaltyDays: number; latePenaltyDeduction: number;
  lineItems: { label: string; amount: number }[];
  totalDeductions: number; netPay: number;
}

export interface PayslipOrg {
  name: string;
  /** Overrides `name` on the slip, e.g. "MEDIALOOP COMMUNICATION PVT. LTD." */
  legalName?: string | null;
  address?: { lines?: string[] } | string[] | string | null;
  website?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  tan?: string | null;
  pf_establishment_code?: string | null;
  esi_code?: string | null;
}

/** About the payment itself (from the run). */
export interface PayslipPayment {
  /** ISO timestamp the run was paid; omitted until paid. */
  paidAt?: string | null;
  /** e.g. "Bank transfer". */
  mode?: string | null;
}

export interface PayslipOptions {
  showEmployerContributions?: boolean;
  /** e.g. "For any queries, write to hr@company.com". */
  queryLine?: string | null;
  /** Per-org show/hide and label overrides for the employee block. */
  employeeFields?: PayslipEmployeeFieldSettings | null;
}

// ── Employee block: the configurable field catalogue ───────────────────────

export type PayslipEmployeeFieldKey =
  | "employee_code" | "employee_name" | "date_of_birth" | "date_of_joining" | "gender" | "pan" | "location"
  | "department" | "designation" | "pf_number"
  | "pay_period" | "payment_date" | "bank_account" | "bank_name" | "uan" | "esic_number" | "pran" | "aadhaar"
  | "days_paid" | "nationality" | "payment_mode";

export interface PayslipEmployeeFieldDef {
  key: PayslipEmployeeFieldKey;
  /** Default label, as on the October reference slip. */
  label: string;
  column: "left" | "right";
  /** Where the value comes from, for the settings screen. */
  source: string;
}

/**
 * Every field the employee block can show, in slip order (October reference:
 * left = who, right = pay and statutory ids). All are on by default; a field
 * with no value is never printed, so an org only switches off what it has but
 * doesn't want shown.
 */
export const PAYSLIP_EMPLOYEE_FIELDS: readonly PayslipEmployeeFieldDef[] = [
  { key: "employee_code", label: "EMP CODE", column: "left", source: "Employee code" },
  { key: "employee_name", label: "EMPLOYEE NAME", column: "left", source: "Name" },
  { key: "date_of_birth", label: "DATE OF BIRTH", column: "left", source: "Date of birth" },
  { key: "date_of_joining", label: "DATE OF JOINING", column: "left", source: "Date of joining" },
  { key: "gender", label: "GENDER", column: "left", source: "Gender" },
  { key: "pan", label: "PAN", column: "left", source: "PAN" },
  { key: "location", label: "LOCATION", column: "left", source: "Work location" },
  { key: "department", label: "DEPARTMENT", column: "left", source: "Department" },
  { key: "designation", label: "DESIGNATION", column: "left", source: "Designation" },
  { key: "pf_number", label: "PF NO", column: "left", source: "PF number" },
  { key: "pay_period", label: "PAY PERIOD", column: "right", source: "The run's month" },
  { key: "payment_date", label: "PAYMENT DATE", column: "right", source: "When the run is marked paid" },
  { key: "bank_account", label: "BANK A/C", column: "right", source: "Bank account (last 4 digits)" },
  { key: "bank_name", label: "BANK NAME", column: "right", source: "Bank account (from the IFSC)" },
  { key: "uan", label: "UAN", column: "right", source: "UAN" },
  { key: "esic_number", label: "ESIC NO", column: "right", source: "ESIC number" },
  { key: "pran", label: "PRAN", column: "right", source: "PRAN (NPS)" },
  { key: "aadhaar", label: "AADHAAR", column: "right", source: "Aadhaar (last 4 digits only)" },
  { key: "days_paid", label: "DAYS PAID", column: "right", source: "Days paid in the month" },
  { key: "nationality", label: "NATIONALITY", column: "right", source: "Nationality" },
  { key: "payment_mode", label: "PAYMENT MODE", column: "right", source: "Once paid" },
];

/** organizations.settings.payslip.employeeFields */
export type PayslipEmployeeFieldSettings = Partial<Record<PayslipEmployeeFieldKey, { show?: boolean; label?: string | null }>>;

const BANKS: Record<string, string> = {
  HDFC: "HDFC Bank", ICIC: "ICICI Bank", SBIN: "State Bank of India", UTIB: "Axis Bank", KKBK: "Kotak Mahindra Bank",
  YESB: "Yes Bank", IDFB: "IDFC First Bank", PUNB: "Punjab National Bank", BARB: "Bank of Baroda", CNRB: "Canara Bank",
  UBIN: "Union Bank of India", BKID: "Bank of India", MAHB: "Bank of Maharashtra", IOBA: "Indian Overseas Bank",
  IDIB: "Indian Bank", CBIN: "Central Bank of India", UCBA: "UCO Bank", PSIB: "Punjab & Sind Bank",
  FDRL: "Federal Bank", INDB: "IndusInd Bank", RATN: "RBL Bank", AUBL: "AU Small Finance Bank", SIBL: "South Indian Bank",
  KARB: "Karnataka Bank", KVBL: "Karur Vysya Bank", CIUB: "City Union Bank", TMBL: "Tamilnad Mercantile Bank",
  DBSS: "DBS Bank India", SCBL: "Standard Chartered Bank", CITI: "Citibank", HSBC: "HSBC", DLXB: "Dhanlaxmi Bank",
  JAKA: "Jammu & Kashmir Bank", ESFB: "Equitas Small Finance Bank", UJVN: "Ujjivan Small Finance Bank", SVCB: "SVC Co-operative Bank",
  COSB: "Cosmos Co-operative Bank", SRCB: "Saraswat Co-operative Bank", ABHY: "Abhyudaya Co-operative Bank",
};

/** "HDFC" (first 4 of an IFSC) → "HDFC Bank"; unknown codes come back as the code. */
export function bankNameFromIfsc(ifscFirst4?: string | null): string | null {
  const code = ifscFirst4?.trim().toUpperCase();
  if (!code) return null;
  return BANKS[code] ?? code;
}

const titleCase = (s?: string | null) =>
  s?.trim() ? s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : null;

/** Lays out the employee block: catalogue order, org overrides, empty values dropped. */
export function employeeBlock(
  values: Partial<Record<PayslipEmployeeFieldKey, string | number | null | undefined>>,
  settings?: PayslipEmployeeFieldSettings | null,
): { left: PayslipField[]; right: PayslipField[] } {
  const left: PayslipField[] = [];
  const right: PayslipField[] = [];
  for (const def of PAYSLIP_EMPLOYEE_FIELDS) {
    const s = settings?.[def.key];
    if (s?.show === false) continue;
    const f = field(s?.label?.trim() || def.label, values[def.key]);
    if (f) (def.column === "left" ? left : right).push(f);
  }
  return { left, right };
}

// ── Builders ───────────────────────────────────────────────────────────────

const fmtDate = (iso?: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

function addressLines(a: PayslipOrg["address"]): string[] {
  if (!a) return [];
  if (typeof a === "string") return a.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (Array.isArray(a)) return a.filter(Boolean);
  return (a.lines ?? []).filter(Boolean);
}

function title(month: string) {
  const [y, m] = month.split("-");
  return `PAYSLIP FOR THE MONTH OF ${MONTHS[Number(m) - 1]} ${y}`;
}

function orgBlock(org: PayslipOrg): PayslipDocument["org"] {
  const ids: PayslipField[] = [];
  if (org.gstin) ids.push({ label: "GSTIN", value: org.gstin });
  if (org.pan) ids.push({ label: "PAN", value: org.pan });
  if (org.pf_establishment_code) ids.push({ label: "PF CODE", value: org.pf_establishment_code });
  if (org.esi_code) ids.push({ label: "ESI CODE", value: org.esi_code });
  if (org.tan) ids.push({ label: "TAN", value: org.tan });
  const contact = [org.website, org.email].map((x) => x?.trim()).filter(Boolean).join(" | ");
  return { name: org.legalName?.trim() || org.name.trim(), addressLines: addressLines(org.address), contactLine: contact || null, ids };
}

function payPeriod(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return `01/${mm}/${y} - ${last}/${mm}/${y}`;
}

const field = (label: string, value: string | number | null | undefined): PayslipField | null =>
  value === null || value === undefined || value === "" ? null : { label, value: String(value) };

const days = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")} day${n === 1 ? "" : "s"}`;

function footer(options: PayslipOptions): string[] {
  return [
    "This is a computer-generated pay slip and does not require a signature.",
    ...(options.queryLine?.trim() ? [options.queryLine.trim()] : []),
  ];
}

/** A pay slip from a processed entry's frozen snapshot. */
export function buildPayslipFromSnapshot(
  snap: EntrySnapshot,
  org: PayslipOrg,
  options: PayslipOptions = {},
  payment: PayslipPayment = {},
): PayslipDocument {
  const e = snap.employee;
  const visible = (kind: EntrySnapshot["lines"][number]["kind"]) =>
    snap.lines
      .filter((l) => l.kind === kind && l.showOnPayslip && Math.round(l.amount * 100) !== 0)
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        label: l.label,
        amount: l.amount,
        ...(l.code === "LOP" && snap.days.lop ? { detail: days(snap.days.lop) } : {}),
        ...(l.code === "LATE_PENALTY" && snap.days.latePenalty ? { detail: days(snap.days.latePenalty) } : {}),
      }));

  const earnings = visible("earning");
  const deductions = visible("deduction");
  const block = employeeBlock(
    {
      employee_code: e.code,
      employee_name: e.name,
      date_of_birth: fmtDate(e.dateOfBirth),
      date_of_joining: fmtDate(e.dateOfJoining),
      gender: titleCase(e.gender),
      pan: e.pan,
      location: e.workLocation,
      department: e.department,
      designation: e.designation,
      pf_number: e.pfNumber,
      pay_period: payPeriod(snap.month),
      payment_date: fmtDate(payment.paidAt),
      bank_account: e.bankLast4 ? `XXXXXX${e.bankLast4}` : null,
      bank_name: e.bankName,
      uan: e.uan,
      esic_number: e.esicNumber,
      pran: e.pran,
      aadhaar: e.aadhaarLast4 ? `XXXX XXXX ${e.aadhaarLast4}` : null,
      days_paid: `${Number.isInteger(snap.days.paid) ? snap.days.paid : snap.days.paid.toFixed(2)} of ${snap.days.basis}`,
      nationality: e.nationality,
      payment_mode: payment.paidAt ? payment.mode ?? "Bank transfer" : null,
    },
    options.employeeFields,
  );
  return {
    org: orgBlock(org),
    title: title(snap.month),
    month: snap.month,
    employeeLeft: block.left,
    employeeRight: block.right,
    earnings,
    deductions,
    // Totals are the full figures, even if a line is hidden from the slip.
    totalEarnings: snap.totals.gross,
    totalDeductions: snap.totals.deductions,
    netPay: snap.totals.net,
    netPayInWords: amountInWordsINR(snap.totals.net),
    // Employer contributions aren't paid to the employee, so they're hidden from
    // the slip by default; when the org opts in, every non-zero one is listed.
    employerContributions: options.showEmployerContributions
      ? snap.lines
          .filter((l) => l.kind === "employer_contribution" && Math.round(l.amount * 100) !== 0)
          .sort((a, b) => a.order - b.order)
          .map((l) => ({ label: l.label, amount: l.amount }))
      : null,
    ctcMonthly: options.showEmployerContributions ? snap.totals.ctcMonthly : null,
    footer: footer(options),
  };
}

/** A pay slip for an entry processed before the engine (no snapshot), from its columns. */
export function buildPayslipFromLegacy(
  entry: LegacyEntry,
  month: string,
  org: PayslipOrg,
  options: PayslipOptions = {},
  payment: PayslipPayment = {},
): PayslipDocument {
  const nz = (a: PayslipAmount) => Math.round(a.amount * 100) !== 0;
  const earnings: PayslipAmount[] = [
    { label: "Basic", amount: entry.basic },
    { label: "HRA", amount: entry.hra },
    { label: "Special allowance", amount: entry.special },
    { label: "Bonus", amount: entry.bonus },
    ...entry.lineItems,
  ].filter(nz);
  const deductions: PayslipAmount[] = [
    { label: "Income tax", amount: entry.tds },
    { label: "Provident fund", amount: entry.employeePf },
    { label: "Professional tax", amount: entry.professionalTax },
    { label: "Loss of pay", amount: entry.lopDeduction, ...(entry.lopDays ? { detail: days(entry.lopDays) } : {}) },
    { label: "Late-arrival penalty", amount: entry.latePenaltyDeduction, ...(entry.latePenaltyDays ? { detail: days(entry.latePenaltyDays) } : {}) },
  ].filter(nz);
  const totalEarnings = earnings.reduce((s, a) => s + a.amount, 0);
  const block = employeeBlock(
    {
      employee_name: entry.employeeName,
      designation: entry.designation,
      department: entry.department,
      pay_period: payPeriod(month),
      payment_date: fmtDate(payment.paidAt),
    },
    options.employeeFields,
  );
  return {
    org: orgBlock(org),
    title: title(month),
    month,
    employeeLeft: block.left,
    employeeRight: block.right,
    earnings,
    deductions,
    totalEarnings,
    totalDeductions: entry.totalDeductions,
    netPay: entry.netPay,
    netPayInWords: amountInWordsINR(entry.netPay),
    employerContributions: null,
    ctcMonthly: null,
    footer: footer(options),
  };
}
