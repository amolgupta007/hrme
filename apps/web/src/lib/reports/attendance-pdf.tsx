// Server-side PDF render (renderToBuffer) — follows the document-templating
// precedent in src/lib/documents/pdf.tsx. Built-in Helvetica only.
//
// Petpooja-style employee cards (plan 2026-08-04 §2): one card per employee,
// <=4 cards per landscape-A4 page, all days of the range as columns in a single
// strip (one strip per calendar month for >31-day ranges). Each card has a
// header (name + department + summary chips) and a 5-row grid: Date / In / Out /
// Total / Status. Fixed page chrome (org title + From/To) and footer (legend +
// Page X of Y) repeat on every page.
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import {
  formatHours,
  type AttendanceReportData, type ReportEmployee, type ReportDay,
} from "./attendance-report";

// Landscape A4 usable width after horizontal padding (841.89 - 2*22 ≈ 797).
// One shared column geometry keeps the 5 grid rows aligned (react-pdf has no
// colspan — every row is label cell [fixed] + N day cells [flex:1], so identical
// structure => identical alignment). See plan §6.
const LABEL_W = 32;

const TEAL = "#17806D";
const INK = "#0B1220";
const MUTE = "#5B6472";
const HAIR = "#E4E7EB";
const HEAD_BG = "#F3F5F7";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    color: INK,
    paddingTop: 48,
    paddingBottom: 30,
    paddingHorizontal: 22,
  },

  // Fixed page chrome (repeats every page).
  topBar: { position: "absolute", top: 16, left: 22, right: 22 },
  orgTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "center" },
  reportSub: { fontSize: 9, color: MUTE, textAlign: "center", marginTop: 1 },
  fromTo: { position: "absolute", right: 0, top: 6, fontSize: 8, color: MUTE },

  footer: {
    position: "absolute", bottom: 12, left: 22, right: 22,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
  },
  legend: { fontSize: 5.6, color: MUTE, flex: 1, paddingRight: 12 },
  pageNo: { fontSize: 7, color: MUTE },

  // Card.
  card: { borderWidth: 0.5, borderColor: "#D7DBDF", borderRadius: 2, marginBottom: 9 },
  cardHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: HEAD_BG, paddingVertical: 4, paddingHorizontal: 6,
    borderBottomWidth: 0.5, borderBottomColor: "#D7DBDF",
  },
  headLeft: { flexDirection: "row", alignItems: "baseline", flexShrink: 1 },
  empName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  empDept: { fontSize: 7, color: TEAL, marginLeft: 6 },
  chips: { fontSize: 6.4, color: "#374151", textAlign: "right", marginLeft: 8 },
  monthLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: MUTE, paddingLeft: 6, paddingTop: 3 },

  // Grid rows — all share this structure.
  gridRow: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: HAIR, alignItems: "stretch" },
  labelCell: {
    width: LABEL_W, justifyContent: "center",
    paddingVertical: 2, paddingLeft: 4,
    borderRightWidth: 0.5, borderRightColor: HAIR,
  },
  labelText: { fontSize: 5.8, color: MUTE, fontFamily: "Helvetica-Bold" },
  dayCell: {
    flex: 1, justifyContent: "center", alignItems: "center",
    paddingVertical: 2, borderRightWidth: 0.5, borderRightColor: HAIR,
  },

  dateNum: { fontSize: 6.6, color: INK },
  dateDow: { fontSize: 5.2, color: MUTE },
  timeText: { fontSize: 6, color: "#111827" },
  totalText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: INK },
  dash: { fontSize: 6, color: "#9AA1AC" },

  statusText: { fontSize: 6.6, fontFamily: "Helvetica-Bold" },
  statusSuffix: { fontSize: 4.6, fontFamily: "Helvetica", color: MUTE },

  empty: { marginTop: 40, textAlign: "center", fontSize: 11, color: MUTE },
});

const LEGEND =
  "Status: FD full · HD half · A absent · WO week-off · H holiday · L leave · – future" +
  "     |     Source: d device · m mobile · w web · * auto-closed · ! single punch";

const DASH = "–"; // en-dash, WinAnsi-safe

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dowOf(isoDate: string): string {
  // Parse as UTC midnight; day-of-week is calendar-stable regardless of tz.
  return DOW_ABBR[new Date(`${isoDate}T00:00:00.000Z`).getUTCDay()];
}

function fmtDmy(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

function chipText(emp: ReportEmployee): string {
  const c = emp.summary;
  return (
    `Full Day : ${c.fullDays} · Half Day : ${c.halfDays} · Absent : ${c.absents} ` +
    `· Week Off : ${c.weekOffs} · Leave : ${c.leaves} · Holiday : ${c.holidays} ` +
    `· Total : ${formatHours(emp.totalMinutes)} h`
  );
}

// Group the range's dates by calendar month, preserving order. A <=31-day
// single-month range yields one group (one strip); >31-day ranges yield one
// strip per month (plan §2 — never chunk mid-month).
function monthGroups(dates: string[]): { key: string; label: string; dates: string[] }[] {
  const groups: { key: string; label: string; dates: string[] }[] = [];
  for (const date of dates) {
    const key = date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const [y, m] = key.split("-");
      g = { key, label: `${MONTH_ABBR[Number(m) - 1]} ${y}`, dates: [] };
      groups.push(g);
    }
    g.dates.push(date);
  }
  return groups;
}

function DateCell({ date }: { date: string }) {
  return (
    <View style={s.dayCell}>
      <Text style={s.dateNum}>{date.slice(8)}</Text>
      <Text style={s.dateDow}>{dowOf(date)}</Text>
    </View>
  );
}

function TimeCell({ value }: { value: string | null }) {
  return (
    <View style={s.dayCell}>
      {value ? <Text style={s.timeText}>{value}</Text> : <Text style={s.dash}>{DASH}</Text>}
    </View>
  );
}

function TotalCell({ day }: { day: ReportDay }) {
  return (
    <View style={s.dayCell}>
      {day.minutes > 0
        ? <Text style={s.totalText}>{formatHours(day.minutes)}</Text>
        : <Text style={s.dash}>{DASH}</Text>}
    </View>
  );
}

// Status code + small source-marker suffix (our differentiator vs Petpooja) +
// `!` when the day is a single/odd punch. Worked-on-off-day keeps the off-code
// (WO/H/L) here while TotalCell shows the hours — plan §2.
function StatusCell({ day }: { day: ReportDay }) {
  const suffix = `${day.marker}${day.singlePunch ? "!" : ""}`;
  return (
    <View style={s.dayCell}>
      <Text style={s.statusText}>
        {day.statusCode}
        {suffix ? <Text style={s.statusSuffix}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

// One month strip: five aligned rows over `days` (already filtered to the
// month). wrap={false} so a strip never splits mid-month across pages.
function MonthStrip({ days }: { days: ReportDay[] }) {
  return (
    <View wrap={false}>
      <View style={s.gridRow}>
        <View style={s.labelCell}><Text style={s.labelText}>Date</Text></View>
        {days.map((d) => <DateCell key={d.date} date={d.date} />)}
      </View>
      <View style={s.gridRow}>
        <View style={s.labelCell}><Text style={s.labelText}>In</Text></View>
        {days.map((d) => <TimeCell key={d.date} value={d.firstIn} />)}
      </View>
      <View style={s.gridRow}>
        <View style={s.labelCell}><Text style={s.labelText}>Out</Text></View>
        {days.map((d) => <TimeCell key={d.date} value={d.lastOut} />)}
      </View>
      <View style={s.gridRow}>
        <View style={s.labelCell}><Text style={s.labelText}>Total</Text></View>
        {days.map((d) => <TotalCell key={d.date} day={d} />)}
      </View>
      <View style={s.gridRow}>
        <View style={s.labelCell}><Text style={s.labelText}>Status</Text></View>
        {days.map((d) => <StatusCell key={d.date} day={d} />)}
      </View>
    </View>
  );
}

function EmployeeCard({ emp, groups }: {
  emp: ReportEmployee;
  groups: { key: string; label: string; dates: string[] }[];
}) {
  const byDate = new Map(emp.days.map((d) => [d.date, d]));
  const multiMonth = groups.length > 1;
  return (
    // Single-month card never splits; multi-month card may split BETWEEN
    // strips (each strip is wrap={false}), never mid-month — plan §2.
    <View style={s.card} wrap={multiMonth}>
      <View style={s.cardHead}>
        <View style={s.headLeft}>
          <Text style={s.empName}>{emp.name}</Text>
          {emp.department ? <Text style={s.empDept}>{emp.department}</Text> : null}
        </View>
        <Text style={s.chips}>{chipText(emp)}</Text>
      </View>
      {groups.map((g) => (
        <View key={g.key}>
          {multiMonth ? <Text style={s.monthLabel}>{g.label}</Text> : null}
          <MonthStrip days={g.dates.map((date) => byDate.get(date)!).filter(Boolean)} />
        </View>
      ))}
    </View>
  );
}

function PageChrome({ data }: { data: AttendanceReportData }) {
  return (
    <>
      <View style={s.topBar} fixed>
        <Text style={s.orgTitle}>{data.orgName}</Text>
        <Text style={s.reportSub}>Attendance Report</Text>
        <Text style={s.fromTo}>From: {fmtDmy(data.from)} To: {fmtDmy(data.to)}</Text>
      </View>
      <View style={s.footer} fixed>
        <Text style={s.legend}>{LEGEND}</Text>
        <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  );
}

const CARDS_PER_PAGE = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function AttendanceReportPdf({ data }: { data: AttendanceReportData }) {
  const groups = monthGroups(data.dates);
  // <=4 cards per page (plan §2). Explicit chunking gives the reference's
  // breathing room; each single-month card is wrap={false} so it never splits.
  const pages = data.employees.length === 0 ? [[]] : chunk(data.employees, CARDS_PER_PAGE);
  return (
    <Document title={`Attendance ${data.from} to ${data.to}`}>
      {pages.map((emps, pi) => (
        <Page key={pi} size="A4" orientation="landscape" style={s.page}>
          <PageChrome data={data} />
          {emps.length === 0 ? (
            <Text style={s.empty}>No attendance in this period.</Text>
          ) : (
            emps.map((emp) => <EmployeeCard key={emp.id} emp={emp} groups={groups} />)
          )}
        </Page>
      ))}
    </Document>
  );
}

export async function renderAttendanceReportPdf(data: AttendanceReportData): Promise<Buffer> {
  return renderToBuffer(<AttendanceReportPdf data={data} />);
}
