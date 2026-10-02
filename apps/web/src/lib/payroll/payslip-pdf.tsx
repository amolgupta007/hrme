// The pay slip PDF (payroll engine step 6). Renders a PayslipDocument
// (@jambahr/shared/payroll/payslip) — the same model the web view and email
// use. Layout follows the October reference slip: a framed page in a
// typewriter face; logo top-left with the company, address and title beside
// it; ruled sections; a two-column "LABEL : value" employee block;
// PARTICULARS / EARNINGS | PARTICULARS / DEDUCTIONS; totals; NET PAY; the
// amount in words; plain footer lines. Org details (legal name, address,
// contact, statutory ids) come from the org's settings.
//
// Built-in fonts only (Courier): the rupee sign is not in their WinAnsi
// table, so amounts are plain numbers with two decimals, as on the reference.
import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { PayslipAmount, PayslipDocument, PayslipField } from "@jambahr/shared/payroll/payslip";

export interface PayslipLogo {
  data: Buffer;
  format: "png" | "jpg";
}

const INK = "#111111";
const amt = (n: number) => n.toFixed(2);

const s = StyleSheet.create({
  page: { padding: 22, fontFamily: "Courier", fontSize: 8.5, color: INK },
  frame: { borderWidth: 1, borderColor: INK, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 20, flexGrow: 1 },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  logoBox: { width: 150, marginRight: 14, justifyContent: "center", minHeight: 44 },
  logo: { maxWidth: 150, maxHeight: 44, objectFit: "contain" },
  headText: { flex: 1 },
  orgName: { fontFamily: "Courier-Bold", fontSize: 9.5, marginBottom: 6 },
  headLine: { fontSize: 8.5, lineHeight: 1.25 },
  title: { marginTop: 8, fontSize: 8.5 },
  rule: { borderBottomWidth: 0.75, borderBottomColor: INK, marginVertical: 4 },
  info: { flexDirection: "row", marginVertical: 2 },
  infoCol: { flex: 1, paddingRight: 10 },
  infoRow: { flexDirection: "row", marginBottom: 1.5 },
  infoLabel: { width: 96 },
  infoValue: { flex: 1 },
  table: { flexDirection: "row" },
  half: { flex: 1, flexDirection: "row" },
  halfRight: { flex: 1, flexDirection: "row", borderLeftWidth: 0.75, borderLeftColor: INK, paddingLeft: 6 },
  particulars: { flex: 1 },
  amount: { width: 78, textAlign: "right", paddingRight: 4 },
  netRow: { flexDirection: "row", marginVertical: 1 },
  footer: { marginTop: 12, lineHeight: 1.5 },
});

function InfoColumn({ rows }: { rows: PayslipField[] }) {
  return (
    <View style={s.infoCol}>
      {rows.map((r) => (
        <View key={r.label} style={s.infoRow}>
          <Text style={s.infoLabel}>{r.label}</Text>
          <Text style={s.infoValue}>:{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Lines({ rows, count }: { rows: PayslipAmount[]; count: number }) {
  const padded: (PayslipAmount | null)[] = [...rows, ...Array.from({ length: Math.max(0, count - rows.length) }, () => null)];
  return (
    <>
      <View style={s.particulars}>
        {padded.map((r, i) => (
          <Text key={i} style={{ marginBottom: 1.5 }}>{r ? `${r.label.toUpperCase()}${r.detail ? ` (${r.detail.toUpperCase()})` : ""}` : " "}</Text>
        ))}
      </View>
      <View style={s.amount}>
        {padded.map((r, i) => <Text key={i} style={{ marginBottom: 1.5 }}>{r ? amt(r.amount) : " "}</Text>)}
      </View>
    </>
  );
}

export function PayslipPdf({ doc, logo }: { doc: PayslipDocument; logo?: PayslipLogo | null }) {
  const count = Math.max(doc.earnings.length, doc.deductions.length);
  const ids = doc.org.ids.map((i) => `${i.label}: ${i.value}`).join("   ");
  return (
    <Document title={`${doc.title} - ${doc.employeeLeft[0]?.value ?? ""}`} author={doc.org.name}>
      <Page size="A4" style={s.page}>
        <View style={s.frame}>
          <View style={s.header}>
            {logo && (
              <View style={s.logoBox}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                <Image style={s.logo} src={{ data: logo.data, format: logo.format }} />
              </View>
            )}
            <View style={s.headText}>
              <Text style={s.orgName}>{doc.org.name.toUpperCase()}</Text>
              {doc.org.addressLines.map((l) => <Text key={l} style={s.headLine}>{l}</Text>)}
              {doc.org.contactLine && <Text style={s.headLine}>{doc.org.contactLine}</Text>}
              {ids ? <Text style={s.headLine}>{ids}</Text> : null}
              <Text style={s.title}>{doc.title}</Text>
            </View>
          </View>

          <View style={s.rule} />
          <View style={s.info}>
            <InfoColumn rows={doc.employeeLeft} />
            <InfoColumn rows={doc.employeeRight} />
          </View>

          <View style={s.rule} />
          <View style={s.table}>
            <View style={s.half}>
              <Text style={s.particulars}>PARTICULARS</Text>
              <Text style={s.amount}>EARNINGS</Text>
            </View>
            <View style={s.halfRight}>
              <Text style={s.particulars}>PARTICULARS</Text>
              <Text style={s.amount}>DEDUCTIONS</Text>
            </View>
          </View>
          <View style={s.rule} />
          <View style={s.table}>
            <View style={s.half}><Lines rows={doc.earnings} count={count} /></View>
            <View style={s.halfRight}><Lines rows={doc.deductions} count={count} /></View>
          </View>
          <View style={s.rule} />
          <View style={s.table}>
            <View style={s.half}>
              <Text style={s.particulars}>TOTAL EARNINGS</Text>
              <Text style={s.amount}>{amt(doc.totalEarnings)}</Text>
            </View>
            <View style={s.halfRight}>
              <Text style={s.particulars}>TOTAL DEDUCTIONS</Text>
              <Text style={s.amount}>{amt(doc.totalDeductions)}</Text>
            </View>
          </View>
          <View style={s.rule} />
          <View style={s.netRow}>
            <Text style={[s.particulars, { fontFamily: "Courier-Bold" }]}>NET PAY</Text>
            <Text style={[s.amount, { fontFamily: "Courier-Bold" }]}>{amt(doc.netPay)}</Text>
          </View>
          <View style={s.rule} />
          <Text>({doc.netPayInWords})</Text>
          <View style={s.rule} />

          {doc.employerContributions && doc.employerContributions.length > 0 && (
            <>
              <View style={s.table}>
                <View style={s.half}>
                  <Text style={s.particulars}>EMPLOYER CONTRIBUTIONS (PART OF CTC)</Text>
                  <Text style={s.amount}>AMOUNT</Text>
                </View>
                <View style={s.halfRight} />
              </View>
              <View style={s.rule} />
              <View style={s.table}>
                <View style={s.half}><Lines rows={doc.employerContributions} count={doc.employerContributions.length} /></View>
                <View style={s.halfRight} />
              </View>
              {doc.ctcMonthly !== null && (
                <View style={s.netRow}>
                  <Text style={s.particulars}>COST TO COMPANY THIS MONTH</Text>
                  <Text style={s.amount}>{amt(doc.ctcMonthly)}</Text>
                </View>
              )}
              <View style={s.rule} />
            </>
          )}

          <View style={s.footer}>
            {doc.footer.map((f) => <Text key={f}>{f.toUpperCase()}</Text>)}
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPayslipDocumentPdf(doc: PayslipDocument, logo?: PayslipLogo | null): Promise<Buffer> {
  return renderToBuffer(<PayslipPdf doc={doc} logo={logo} />);
}
