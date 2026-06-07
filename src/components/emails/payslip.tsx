import * as React from "react";
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Hr,
  Row,
  Column,
} from "@react-email/components";

interface PayslipEmailProps {
  orgName: string;
  employeeName: string;
  month: string; // YYYY-MM
  basicMonthly: number;
  hraMonthly: number;
  specialAllowanceMonthly: number;
  grossSalary: number;
  employeePf: number;
  professionalTax: number;
  tds: number;
  lopDays: number;
  lopDeduction: number;
  lineItems: Array<{ category: string; amount: number; note: string | null; taxable: boolean }>;
  totalDeductions: number;
  netPay: number;
  viewInAppUrl: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

export function PayslipEmail({
  orgName,
  employeeName,
  month,
  basicMonthly,
  hraMonthly,
  specialAllowanceMonthly,
  grossSalary,
  employeePf,
  professionalTax,
  tds,
  lopDays,
  lopDeduction,
  lineItems,
  totalDeductions,
  netPay,
  viewInAppUrl,
}: PayslipEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Payslip for ${monthLabel(month)} — ${employeeName}`}</Preview>
      <Body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f6f7f9", padding: "24px 0" }}>
        <Container style={{ background: "#fff", maxWidth: 560, margin: "0 auto", borderRadius: 12, padding: 24 }}>
          <Heading style={{ fontSize: 18, margin: "0 0 4px" }}>
            Payslip — {monthLabel(month)}
          </Heading>
          <Text style={{ color: "#666", margin: 0, fontSize: 13 }}>{orgName}</Text>

          <Hr style={{ margin: "16px 0" }} />

          <Text style={{ fontSize: 14, marginBottom: 4 }}>Hi {employeeName},</Text>
          <Text style={{ fontSize: 13, color: "#444", marginTop: 0 }}>
            Your payslip for <strong>{monthLabel(month)}</strong> is now available. Net pay:{" "}
            <strong>{fmt(netPay)}</strong>.
          </Text>

          {/* Earnings */}
          <Section style={{ marginTop: 16 }}>
            <Heading
              as="h3"
              style={{ fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Earnings
            </Heading>
            <Row>
              <Column>Basic Salary</Column>
              <Column align="right">{fmt(basicMonthly)}</Column>
            </Row>
            <Row>
              <Column>House Rent Allowance</Column>
              <Column align="right">{fmt(hraMonthly)}</Column>
            </Row>
            <Row>
              <Column>Special Allowance</Column>
              <Column align="right">{fmt(specialAllowanceMonthly)}</Column>
            </Row>
            <Row>
              <Column>
                <strong>Gross Salary</strong>
              </Column>
              <Column align="right">
                <strong>{fmt(grossSalary)}</strong>
              </Column>
            </Row>
          </Section>

          {/* Additional line items */}
          {lineItems.length > 0 && (
            <Section style={{ marginTop: 12 }}>
              <Heading
                as="h3"
                style={{ fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                Additional Items
              </Heading>
              {lineItems.map((li, i) => (
                <Row key={i}>
                  <Column>
                    <span style={{ textTransform: "capitalize" }}>{li.category}</span>
                    {li.note && (
                      <span style={{ color: "#888" }}> — {li.note}</span>
                    )}
                    {!li.taxable && (
                      <span style={{ color: "#888" }}> (non-taxable)</span>
                    )}
                  </Column>
                  <Column align="right">{fmt(li.amount)}</Column>
                </Row>
              ))}
              {/* Total Earnings = Gross Salary + sum(line items). Only shown
                  when line items exist; makes Total Earnings − Total Deductions
                  = Net Pay so the email arithmetic ties out. */}
              <Row>
                <Column>
                  <strong>Total Earnings</strong>
                </Column>
                <Column align="right">
                  <strong>
                    {fmt(grossSalary + lineItems.reduce((s, i) => s + i.amount, 0))}
                  </strong>
                </Column>
              </Row>
            </Section>
          )}

          {/* Deductions */}
          <Section style={{ marginTop: 12 }}>
            <Heading
              as="h3"
              style={{ fontSize: 13, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Deductions
            </Heading>
            <Row>
              <Column>Provident Fund (12%)</Column>
              <Column align="right">{fmt(employeePf)}</Column>
            </Row>
            <Row>
              <Column>Professional Tax</Column>
              <Column align="right">{fmt(professionalTax)}</Column>
            </Row>
            <Row>
              <Column>TDS (Income Tax)</Column>
              <Column align="right">{fmt(tds)}</Column>
            </Row>
            {lopDays > 0 && (
              <Row>
                <Column>
                  LOP ({lopDays} day{lopDays === 1 ? "" : "s"})
                </Column>
                <Column align="right">{fmt(lopDeduction)}</Column>
              </Row>
            )}
            <Row>
              <Column>
                <strong>Total Deductions</strong>
              </Column>
              <Column align="right">
                <strong>{fmt(totalDeductions)}</strong>
              </Column>
            </Row>
          </Section>

          <Hr style={{ margin: "16px 0" }} />

          {/* Net pay */}
          <Row>
            <Column>
              <strong>Net Pay</strong>
            </Column>
            <Column align="right">
              <strong style={{ fontSize: 16 }}>{fmt(netPay)}</strong>
            </Column>
          </Row>

          <Hr style={{ margin: "16px 0" }} />

          <Text style={{ fontSize: 12, color: "#666" }}>
            View this payslip in app and download as PDF at{" "}
            <a href={viewInAppUrl}>{viewInAppUrl}</a>.
          </Text>
          <Text style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
            This is a system-generated payslip from JambaHR. No signature required.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PayslipEmail;
