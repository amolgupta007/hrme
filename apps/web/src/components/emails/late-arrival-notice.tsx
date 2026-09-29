import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

// One template, five variants, modelled on docs/demo/Attendance_Warning_Email_Templates.pdf.
// Every number (which late arrival, days deducted, dispute window) comes from
// the org's policy at send time — nothing is hard-coded.

export type LateArrivalNoticeVariant = "warning" | "deduction" | "lop" | "partial" | "correction";

export type LateArrivalRow = {
  date: string; // e.g. "Tue, 2 Sep 2026"
  expectedBy: string; // shift start + grace, e.g. "09:10"
  punchIn: string; // e.g. "09:24"
  lateBy: string; // e.g. "14 min"
};

export type LateArrivalNoticeProps = {
  variant: LateArrivalNoticeVariant;
  employeeName: string;
  orgName: string;
  monthLabel: string; // "September 2026"
  lateCount: number;
  lates: LateArrivalRow[];
  /** Policy: which late arrival triggers a deduction, and how much. */
  deductAt: number;
  deductDays: number;
  leaveTypeLabel: string; // "casual leave"
  lopFallback: boolean;
  disputeDays: number;
  // Deduction details (deduction / lop / partial)
  clDeducted?: number;
  lopDays?: number;
  clBalanceBefore?: number;
  clBalanceAfter?: number;
  effectiveDate?: string;
  warningDate?: string | null;
  // Correction
  correctionSummary?: string;
};

const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const dayWord = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export function lateArrivalSubject(variant: LateArrivalNoticeVariant, employeeName: string): string {
  const label: Record<LateArrivalNoticeVariant, string> = {
    warning: "Formal Warning",
    deduction: "Leave Deduction",
    lop: "Loss of Pay",
    partial: "Leave Deduction and Loss of Pay",
    correction: "Correction",
  };
  return `Attendance Notice – ${label[variant]} | ${employeeName}`;
}

const ACCENT: Record<LateArrivalNoticeVariant, string> = {
  warning: "#c2410c",
  deduction: "#b91c1c",
  lop: "#7f1d1d",
  partial: "#991b1b",
  correction: "#0f766e",
};

export function LateArrivalNotice(p: LateArrivalNoticeProps) {
  const accent = ACCENT[p.variant];
  const isPenalty = p.variant === "deduction" || p.variant === "lop" || p.variant === "partial";
  const leave = p.leaveTypeLabel;

  const headline = (() => {
    switch (p.variant) {
      case "warning":
        return "Please treat this as a formal warning.";
      case "deduction":
        return `As per company policy, ${dayWord(p.clDeducted ?? 0)} of ${leave} is being deducted from your leave balance.`;
      case "lop":
        return `As per company policy, ${dayWord(p.deductDays)} of ${leave} was to be deducted. As you have no ${leave} balance available, this is being treated as ${dayWord(p.lopDays ?? p.deductDays)} of loss of pay.`;
      case "partial":
        return `As per company policy, ${dayWord(p.deductDays)} of ${leave} was to be deducted. Your remaining ${leave} balance covers ${p.clDeducted}; the other ${dayWord(p.lopDays ?? 0)} is treated as loss of pay.`;
      case "correction":
        return p.correctionSummary ?? "An earlier attendance penalty has been reversed.";
    }
  })();

  const penaltyRows: Array<[string, string]> = [];
  if (p.variant === "deduction" || p.variant === "partial") {
    penaltyRows.push([`${cap(leave)} deducted`, String(p.clDeducted ?? 0)]);
    penaltyRows.push([`${cap(leave)} balance before deduction`, String(p.clBalanceBefore ?? 0)]);
    penaltyRows.push([`${cap(leave)} balance after deduction`, String(p.clBalanceAfter ?? 0)]);
  }
  if (p.variant === "lop") penaltyRows.push([`${cap(leave)} balance`, "0"]);
  if (p.variant === "lop" || p.variant === "partial") {
    penaltyRows.push(["Loss of pay", dayWord(p.lopDays ?? 0)]);
    penaltyRows.push(["Payroll month affected", p.monthLabel]);
  }
  if (isPenalty && p.effectiveDate) penaltyRows.push(["Effective date", p.effectiveDate]);

  return (
    <Html>
      <Head />
      <Preview>{lateArrivalSubject(p.variant, p.employeeName)}</Preview>
      <Body style={{ backgroundColor: "#f6f7f9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ backgroundColor: accent, borderRadius: "8px 8px 0 0", padding: "14px 20px" }}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: 0.4, margin: 0 }}>
              {p.orgName.toUpperCase()} · ATTENDANCE NOTICE
            </Text>
          </Section>
          <Section style={{ backgroundColor: "#fff", borderRadius: "0 0 8px 8px", padding: "20px" }}>
            <Text style={text}>Dear {p.employeeName},</Text>

            {p.variant === "correction" ? (
              <Text style={text}>
                Your late arrivals for {p.monthLabel} were re-checked after a correction, and the count is now{" "}
                <strong>{p.lateCount}</strong>.
              </Text>
            ) : (
              <Text style={text}>
                {isPenalty && p.warningDate ? `Further to our formal warning dated ${p.warningDate}, our` : "Our"}{" "}
                attendance records {isPenalty ? "now show" : "show"}{" "}
                <strong style={{ color: accent }}>{p.lateCount} late arrivals</strong> in {p.monthLabel}:
              </Text>
            )}

            {p.variant !== "correction" && p.lates.length > 0 && (
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                width="100%"
                style={{ borderCollapse: "collapse", border: `1px solid ${accent}`, margin: "12px 0 16px", fontSize: 13 }}
              >
                <thead>
                  <tr style={{ backgroundColor: accent, color: "#fff" }}>
                    {["#", "Date", "Expected by", "Punch-in", "Late by"].map((h) => (
                      <th key={h} align="left" style={{ padding: "8px 10px", fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.lates.map((l, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 ? "#fafafa" : "#fff" }}>
                      <td style={cell}>
                        <strong>{i + 1}</strong>
                      </td>
                      <td style={cell}>{l.date}</td>
                      <td style={cell}>{l.expectedBy}</td>
                      <td style={cell}>{l.punchIn}</td>
                      <td style={cell}>{l.lateBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Section
              style={{ borderLeft: `4px solid ${accent}`, backgroundColor: "#fdf6f3", padding: "10px 14px", margin: "8px 0 16px" }}
            >
              <Text style={{ ...text, margin: 0, fontWeight: 700, color: accent }}>{headline}</Text>
            </Section>

            {p.variant === "warning" && (
              <>
                <Text style={text}>As per company policy:</Text>
                <Text style={{ ...text, margin: "0 0 4px" }}>
                  • At the <strong>{ord(p.deductAt)} late arrival</strong> in a calendar month,{" "}
                  <strong>{dayWord(p.deductDays)} of {leave}</strong> will be deducted from your leave balance.
                </Text>
                {p.lopFallback && (
                  <Text style={text}>
                    • If no {leave} balance is available, the deduction will be treated as{" "}
                    <strong>{dayWord(p.deductDays)} of loss of pay</strong>.
                  </Text>
                )}
                <Text style={text}>We request you to ensure timely arrival going forward.</Text>
              </>
            )}

            {penaltyRows.length > 0 && (
              <table
                role="presentation"
                cellPadding={0}
                cellSpacing={0}
                width="100%"
                style={{ borderCollapse: "collapse", border: `1px solid ${accent}`, margin: "4px 0 16px", fontSize: 13 }}
              >
                <tbody>
                  <tr>
                    <td colSpan={2} style={{ padding: "8px 12px", fontWeight: 700, color: accent, backgroundColor: "#fdf2f2" }}>
                      PENALTY DETAILS
                    </td>
                  </tr>
                  {penaltyRows.map(([k, v]) => (
                    <tr key={k}>
                      <td style={cell}>{k}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {isPenalty && (
              <Text style={{ ...text, color: accent }}>
                Further late arrivals may lead to stricter action as per the company&apos;s rules and regulations.
              </Text>
            )}

            {p.variant !== "correction" && (
              <Text style={text}>
                If any of the above entries are incorrect or there was a valid reason, please email your reporting manager
                {p.disputeDays > 0 ? ` within ${p.disputeDays} working ${p.disputeDays === 1 ? "day" : "days"}` : ""}.
              </Text>
            )}

            <Text style={{ ...text, marginTop: 20 }}>
              Regards,
              <br />
              <strong>{p.orgName} HR</strong>
            </Text>
            <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0 12px" }} />
            <Text style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
              This is an automated email sent via JambaHR. Please do not reply to this message.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const text = { fontSize: 14, lineHeight: "1.6", color: "#1f2937", margin: "0 0 12px" };
const cell = { padding: "8px 10px", borderTop: "1px solid #eee", color: "#1f2937" };

export default LateArrivalNotice;
