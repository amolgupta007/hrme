import * as React from "react";
import { Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, Link } from "@react-email/components";

/**
 * "Your pay slip is ready" — a short summary; the pay slip itself is the
 * attached PDF (the org's pay slip format, same as the in-app download).
 */
export interface PayslipReadyEmailProps {
  orgName: string;
  employeeName: string;
  monthLabel: string; // "October 2026"
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  viewInAppUrl: string;
}

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

export function PayslipReadyEmail(p: PayslipReadyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Your pay slip for ${p.monthLabel} — net pay ${inr(p.netPay)}`}</Preview>
      <Body style={{ backgroundColor: "#f6f7f9", fontFamily: "Arial, sans-serif", color: "#111827" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "28px", maxWidth: "520px", borderRadius: "8px" }}>
          <Heading as="h2" style={{ fontSize: "18px", margin: "0 0 12px" }}>Your pay slip for {p.monthLabel}</Heading>
          <Text style={{ margin: "0 0 16px" }}>Hi {p.employeeName}, your pay slip from {p.orgName} is attached as a PDF.</Text>
          <Section style={{ backgroundColor: "#f3f4f6", padding: "12px 16px", borderRadius: "6px" }}>
            <Text style={{ margin: "2px 0" }}>Total earnings: <strong>{inr(p.grossEarnings)}</strong></Text>
            <Text style={{ margin: "2px 0" }}>Total deductions: <strong>{inr(p.totalDeductions)}</strong></Text>
            <Text style={{ margin: "6px 0 2px", fontSize: "16px" }}>Net pay: <strong>{inr(p.netPay)}</strong></Text>
          </Section>
          <Text style={{ margin: "16px 0 0" }}>
            You can also see all your pay slips in JambaHR: <Link href={p.viewInAppUrl}>Payroll → My Payslips</Link>.
          </Text>
          <Hr style={{ margin: "20px 0", borderColor: "#e5e7eb" }} />
          <Text style={{ fontSize: "12px", color: "#6b7280", margin: 0 }}>
            Questions about your pay? Reply to your HR or payroll team.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
