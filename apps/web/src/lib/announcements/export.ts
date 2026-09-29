// Plain module — pure CSV assembly for the acknowledgement status export.

export type AckCsvRow = {
  name: string;
  email: string | null;
  department: string | null;
  state: string;
  acknowledged_at: string | null;
  last_reminded_at: string | null;
  reminder_count: number;
};

const STATE_LABEL: Record<string, string> = {
  acknowledged: "Acknowledged",
  pending: "Pending",
  overdue: "Overdue",
  left: "Left organisation",
};

/** Quote when needed, and neutralise spreadsheet formulas (=, +, -, @). */
export function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function istDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function buildAckCsv(rows: AckCsvRow[]): string {
  const header = ["Name", "Email", "Department", "Status", "Acknowledged at (IST)", "Last reminded (IST)", "Reminders sent"];
  const lines = rows.map((r) =>
    [
      r.name,
      r.email ?? "",
      r.department ?? "",
      STATE_LABEL[r.state] ?? r.state,
      istDateTime(r.acknowledged_at),
      istDateTime(r.last_reminded_at),
      r.reminder_count,
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.map(csvCell).join(","), ...lines].join("\n");
}
