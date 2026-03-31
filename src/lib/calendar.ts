// Calendar link generators — no OAuth required, URL-based

function formatGoogleDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function formatOutlookDate(date: Date): string {
  return date.toISOString().split(".")[0];
}

export interface CalendarEvent {
  title: string;
  description: string;
  location?: string;
  startAt: Date;
  durationMinutes: number;
}

export function getGoogleCalendarUrl(event: CalendarEvent): string {
  const end = new Date(event.startAt.getTime() + event.durationMinutes * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatGoogleDate(event.startAt)}/${formatGoogleDate(end)}`,
    details: event.description,
    ...(event.location ? { location: event.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function getOutlookCalendarUrl(event: CalendarEvent): string {
  const end = new Date(event.startAt.getTime() + event.durationMinutes * 60 * 1000);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: formatOutlookDate(event.startAt),
    enddt: formatOutlookDate(end),
    body: event.description,
    ...(event.location ? { location: event.location } : {}),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function generateICS(event: CalendarEvent): string {
  const end = new Date(event.startAt.getTime() + event.durationMinutes * 60 * 1000);
  const now = new Date();
  const uid = `${now.getTime()}@jambahr.com`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JambaHR//JambaHire//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatGoogleDate(now)}`,
    `DTSTART:${formatGoogleDate(event.startAt)}`,
    `DTEND:${formatGoogleDate(end)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}`,
    ...(event.location ? [`LOCATION:${event.location}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

export function downloadICS(event: CalendarEvent, filename = "interview.ics"): void {
  const ics = generateICS(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
