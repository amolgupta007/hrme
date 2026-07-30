// Server-side PDF render (renderToBuffer) — follows the document-templating
// precedent in src/lib/documents/pdf.tsx. Built-in Helvetica only.
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import {
  chunkDateColumns, formatHours, stateLetter,
  type AttendanceReportData, type ReportEmployee,
} from "./attendance-report";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#0B1220" },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 8, color: "#5B6472", marginBottom: 8 },
  legend: { fontSize: 7, color: "#5B6472", marginBottom: 8 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E7E9EC", alignItems: "center" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0B1220", paddingBottom: 2, marginBottom: 1 },
  nameCell: { width: 96, paddingRight: 4 },
  dayCell: { flex: 1, textAlign: "center", paddingVertical: 2 },
  totalCell: { width: 40, textAlign: "right", fontFamily: "Helvetica-Bold" },
  marker: { fontSize: 5.5, color: "#5B6472" },
  deptHead: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2, color: "#17806D" },
  detailHead: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 2 },
  detailSub: { fontSize: 7, color: "#5B6472", marginBottom: 3 },
  detailRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#F0F1F3", paddingVertical: 1.5 },
  dDate: { width: 52 },
  dPairs: { flex: 1 },
  dHours: { width: 34, textAlign: "right" },
  dFlags: { width: 90, textAlign: "right", color: "#5B6472" },
});

const LEGEND =
  "Sources: d device · m mobile · w web · * auto-closed   |   Days: W week-off · H holiday · L leave · A absent · – future   |   ! single punch";

function MatrixCell({ day }: { day: ReportEmployee["days"][number] }) {
  if (day.state !== "worked") return <Text style={s.dayCell}>{stateLetter(day.state)}</Text>;
  return (
    <Text style={s.dayCell}>
      {formatHours(day.minutes)}
      <Text style={s.marker}>{day.marker}{day.singlePunch ? "!" : ""}</Text>
    </Text>
  );
}

function flags(day: ReportEmployee["days"][number]): string {
  const f: string[] = [];
  if (day.autoClosed) f.push("auto-closed");
  if (day.outOfZoneCount > 0) f.push(`${day.outOfZoneCount} out-of-zone`);
  if (day.isLate) f.push("late");
  if (day.singlePunch) f.push("single punch !");
  if (day.state !== "worked" && day.pairs.length > 0) f.push(`on ${day.state.replace("_", "-")}`);
  return f.join(", ");
}

export function AttendanceReportPdf({ data }: { data: AttendanceReportData }) {
  const chunks = chunkDateColumns(data.dates);
  // Group by department for the matrix when >1 department present.
  const byDept = new Map<string, ReportEmployee[]>();
  for (const emp of data.employees) {
    const key = emp.department ?? "No department";
    byDept.set(key, [...(byDept.get(key) ?? []), emp]);
  }
  const grouped = byDept.size > 1;
  const groups: [string, ReportEmployee[]][] = grouped
    ? [...byDept.entries()]
    : [["", data.employees]];

  return (
    <Document title={`Attendance ${data.from} to ${data.to}`}>
      {chunks.map((dates, ci) => (
        <Page key={`m${ci}`} size="A4" orientation="landscape" style={s.page}>
          <Text style={s.h1}>{data.orgName} — Attendance Report</Text>
          <Text style={s.sub}>
            {data.from} to {data.to} · generated {data.generatedAt.slice(0, 10)}
            {chunks.length > 1 ? ` · days ${dates[0]} – ${dates[dates.length - 1]}` : ""}
          </Text>
          {ci === 0 && <Text style={s.legend}>{LEGEND}</Text>}
          <View style={s.headRow}>
            <Text style={s.nameCell}>Employee</Text>
            {dates.map((d) => (
              <Text key={d} style={s.dayCell}>{d.slice(8)}</Text>
            ))}
            <Text style={s.totalCell}>Total h</Text>
          </View>
          {groups.map(([dept, emps]) => (
            <View key={dept || "all"}>
              {grouped && <Text style={s.deptHead}>{dept}</Text>}
              {emps.map((emp) => (
                <View key={emp.id} style={s.row} wrap={false}>
                  <Text style={s.nameCell}>{emp.name}</Text>
                  {emp.days
                    .filter((d) => dates.includes(d.date))
                    .map((d) => <MatrixCell key={d.date} day={d} />)}
                  <Text style={s.totalCell}>{formatHours(emp.totalMinutes)}</Text>
                </View>
              ))}
            </View>
          ))}
          {data.employees.length === 0 && (
            <Text style={{ marginTop: 20, color: "#5B6472" }}>No attendance in this period.</Text>
          )}
        </Page>
      ))}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.h1}>Per-employee detail</Text>
        <Text style={s.sub}>{data.orgName} · {data.from} to {data.to} · times in IST</Text>
        {data.employees.map((emp) => (
          <View key={emp.id}>
            <Text style={s.detailHead}>
              {emp.name}{emp.department ? ` — ${emp.department}` : ""}
            </Text>
            <Text style={s.detailSub}>
              {formatHours(emp.totalMinutes)} hrs · {emp.daysPresent} days present
            </Text>
            {emp.days
              .filter((d) => d.pairs.length > 0 || d.state === "absent")
              .map((d) => (
                <View key={d.date} style={s.detailRow} wrap={false}>
                  <Text style={s.dDate}>{d.date.slice(5)}</Text>
                  <Text style={s.dPairs}>
                    {d.pairs.length > 0
                      ? d.pairs.map((p) => `${p.in}-${p.out ?? "?"}`).join(", ")
                      : "— absent —"}
                  </Text>
                  <Text style={s.dHours}>
                    {d.state === "worked" ? `${formatHours(d.minutes)}${d.marker}` : stateLetter(d.state)}
                  </Text>
                  <Text style={s.dFlags}>{flags(d)}</Text>
                </View>
              ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderAttendanceReportPdf(data: AttendanceReportData): Promise<Buffer> {
  return renderToBuffer(<AttendanceReportPdf data={data} />);
}
