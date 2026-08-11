// Server-side payslip PDF (renderToBuffer) — mirrors the attendance-report
// precedent (src/lib/reports/attendance-pdf.tsx): built-in Helvetica only, no
// exotic glyphs (use "-" not "→"). Layout = WF-Payslip (Phase D Slice 3, Stage
// A): org header, month + status, net-pay hero, EARNINGS / DEDUCTIONS sections,
// line items, total deductions, net.
//
// The rupee sign (₹, U+20B9) is NOT in Helvetica's built-in WinAnsi table — it
// renders as a zero-width .notdef box (verified via the render probe: tsx script
// → page-1 PNG). So money uses the "Rs " prefix, which is fully WinAnsi-safe.
// Registering a ₹-capable TTF font is the future upgrade if the glyph is wanted.
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { MobilePayslipDetail } from "@jambahr/shared";

export type PayslipPdfData = {
  orgName: string;
  employeeName: string;
  designation: string | null;
  detail: MobilePayslipDetail;
};

const TEAL = "#17806D";
const INK = "#0B1220";
const MUTE = "#5B6472";
const DANGER = "#B91C1C";
const HAIR = "#E4E7EB";
const HEAD_BG = "#F3F5F7";

// WinAnsi-safe currency prefix ("Rs " — ₹ is not in Helvetica; see header note).
const CURRENCY_PREFIX = "Rs ";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function inrDigits(n: number): string {
  // Indian digit grouping, no symbol (e.g. 2,51,200).
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));
}
function money(n: number): string {
  return `${CURRENCY_PREFIX}${inrDigits(n)}`;
}
function deduction(n: number): string {
  // Leading minus for a real deduction; a zero reads plainly.
  return n > 0 ? `-${money(n)}` : money(n);
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MONTH_NAMES[idx]} ${y}` : month;
}
function statusLabel(status: string): string {
  return status === "paid" ? "Paid" : "Processed";
}
function categoryLabel(category: string): string {
  switch (category) {
    case "overtime": return "Overtime";
    case "allowance": return "Allowance";
    case "reimbursement": return "Reimbursement";
    case "bonus": return "Bonus";
    default: return "Other";
  }
}

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    color: INK,
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },

  // Header.
  header: {
    borderBottomWidth: 1,
    borderBottomColor: HAIR,
    paddingBottom: 12,
    marginBottom: 16,
  },
  orgName: { fontSize: 18, fontFamily: "Helvetica-Bold", color: INK },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
  },
  empName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  empDesignation: { fontSize: 9, color: TEAL, marginTop: 2 },
  periodBlock: { alignItems: "flex-end" },
  periodLabel: { fontSize: 8, color: MUTE },
  periodMonth: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 },
  statusChip: {
    marginTop: 3,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
  },

  // Net-pay hero.
  hero: {
    backgroundColor: HEAD_BG,
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTE,
    letterSpacing: 1,
  },
  heroAmount: { fontSize: 30, fontFamily: "Helvetica-Bold", color: INK, marginTop: 4 },
  heroPaid: { fontSize: 8.5, color: MUTE, marginTop: 4 },

  // Sections.
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: MUTE,
    letterSpacing: 1,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    borderTopWidth: 0.5,
    borderTopColor: HAIR,
  },
  rowLabelWrap: { flex: 1, paddingRight: 12 },
  rowLabel: { fontSize: 10, color: "#374151" },
  rowSub: { fontSize: 7.5, color: MUTE, marginTop: 1 },
  amount: { fontSize: 10, fontFamily: "Courier", color: INK, textAlign: "right" },
  amountDanger: { fontSize: 10, fontFamily: "Courier", color: DANGER, textAlign: "right" },
  amountEmph: { fontSize: 10.5, fontFamily: "Courier-Bold", color: INK, textAlign: "right" },
  amountEmphDanger: { fontSize: 10.5, fontFamily: "Courier-Bold", color: DANGER, textAlign: "right" },
  rowLabelEmph: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK },
  rowEmph: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#C7CCD2",
  },

  // Net footer.
  netFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: INK,
  },
  netLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  netAmount: { fontSize: 14, fontFamily: "Courier-Bold", color: INK },

  footNote: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    fontSize: 7,
    color: MUTE,
    textAlign: "center",
  },
});

function AmountRow({
  label, sublabel, value, danger = false, emphasis = false,
}: {
  label: string;
  sublabel?: string | null;
  value: string;
  danger?: boolean;
  emphasis?: boolean;
}) {
  const amtStyle = emphasis
    ? danger ? s.amountEmphDanger : s.amountEmph
    : danger ? s.amountDanger : s.amount;
  return (
    <View style={emphasis ? s.rowEmph : s.row}>
      <View style={s.rowLabelWrap}>
        <Text style={emphasis ? s.rowLabelEmph : s.rowLabel}>{label}</Text>
        {sublabel ? <Text style={s.rowSub}>{sublabel}</Text> : null}
      </View>
      <Text style={amtStyle}>{value}</Text>
    </View>
  );
}

export function PayslipPdf({ data }: { data: PayslipPdfData }) {
  const d = data.detail;
  return (
    <Document title={`Payslip ${monthLabel(d.month)}`}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.orgName}>{data.orgName}</Text>
          <View style={s.headerRow}>
            <View>
              <Text style={s.empName}>{data.employeeName}</Text>
              {data.designation ? <Text style={s.empDesignation}>{data.designation}</Text> : null}
            </View>
            <View style={s.periodBlock}>
              <Text style={s.periodLabel}>Pay period</Text>
              <Text style={s.periodMonth}>{monthLabel(d.month)}</Text>
              <Text style={s.statusChip}>{statusLabel(d.status)}</Text>
            </View>
          </View>
        </View>

        {/* Net-pay hero */}
        <View style={s.hero}>
          <Text style={s.heroLabel}>NET PAY</Text>
          <Text style={s.heroAmount}>{money(d.netPay)}</Text>
          {d.paidAt ? <Text style={s.heroPaid}>Paid on {d.paidAt.slice(0, 10)}</Text> : null}
        </View>

        {/* Earnings */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>EARNINGS</Text>
          <AmountRow label="Basic" value={money(d.earnings.basic)} />
          <AmountRow label="HRA" value={money(d.earnings.hra)} />
          <AmountRow label="Special allowance" value={money(d.earnings.specialAllowance)} />
          {d.bonus > 0 ? <AmountRow label="Bonus" value={money(d.bonus)} /> : null}
          {d.lineItems.map((li, i) => (
            <AmountRow
              key={`li-${i}`}
              label={li.label ?? categoryLabel(li.category)}
              sublabel={li.taxable ? null : "Non-taxable"}
              value={money(li.amount)}
            />
          ))}
          <AmountRow label="Gross" value={money(d.earnings.gross)} emphasis />
        </View>

        {/* Deductions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>DEDUCTIONS</Text>
          <AmountRow label="Provident fund (PF)" value={deduction(d.deductions.employeePf)} danger />
          <AmountRow label="Professional tax" value={deduction(d.deductions.professionalTax)} danger />
          <AmountRow label="TDS" value={deduction(d.deductions.tds)} danger />
          {d.deductions.lopDays > 0 ? (
            <AmountRow
              label="Loss of pay"
              sublabel={`${d.deductions.lopDays} ${d.deductions.lopDays === 1 ? "day" : "days"}`}
              value={deduction(d.deductions.lopDeduction)}
              danger
            />
          ) : null}
          <AmountRow label="Total deductions" value={deduction(d.totalDeductions)} danger emphasis />
        </View>

        {/* Net footer */}
        <View style={s.netFooter}>
          <Text style={s.netLabel}>Net pay</Text>
          <Text style={s.netAmount}>{money(d.netPay)}</Text>
        </View>

        <Text style={s.footNote} fixed>
          This is a system-generated payslip and does not require a signature.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  return renderToBuffer(<PayslipPdf data={data} />);
}
