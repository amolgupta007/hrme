// Which punches keep TIME (clock-in/out, hours, lateness) versus which only
// show PRESENCE. Default "all" pools every source — today's behaviour. An org
// that timekeeps on the web (e.g. Medialoop) sets "web_app": web, mobile-app
// and admin manual punches keep time; biometric-device punches only record
// that the person was seen at the office.

export type TimekeepingMode = "all" | "web_app";

export type TimekeepingSettings = {
  source: TimekeepingMode;
  /** IST date the mode took effect; earlier days keep the old behaviour. */
  from: string | null;
};

const TIMEKEEPING_IN_WEB_APP = new Set(["web", "mobile", "manual"]);
const DEVICE_SOURCES = new Set(["adms", "device"]);

/** Read organizations.settings → the timekeeping mode (defaults to "all"). */
export function normalizeTimekeepingSettings(orgSettings: unknown): TimekeepingSettings {
  const att = (orgSettings as any)?.attendance ?? {};
  const source: TimekeepingMode = att.timekeeping_source === "web_app" ? "web_app" : "all";
  const from = typeof att.timekeeping_source_from === "string" ? att.timekeeping_source_from : null;
  return { source, from };
}

/** The mode that governs one IST day. */
export function resolveTimekeepingMode(orgSettings: unknown, istDate: string): TimekeepingMode {
  const s = normalizeTimekeepingSettings(orgSettings);
  if (s.source === "web_app" && (!s.from || istDate >= s.from)) return "web_app";
  return "all";
}

/** A punch with no source is a legacy device punch (historical default). */
const sourceOf = (e: { source?: string | null }) => e.source ?? "device";

export function splitPunchesForTimekeeping<T extends { source?: string | null }>(
  events: T[],
  mode: TimekeepingMode
): { timekeeping: T[]; presence: T[] } {
  const presence = events.filter((e) => DEVICE_SOURCES.has(sourceOf(e)));
  const timekeeping = mode === "all" ? events : events.filter((e) => TIMEKEEPING_IN_WEB_APP.has(sourceOf(e)));
  return { timekeeping, presence };
}

/** Seen at the office (device) but never clocked in — present, flagged for follow-up. */
export function isDeviceOnlyDay(rec: { clock_in_at: string | null; device_first_seen_at?: string | null }): boolean {
  return !rec.clock_in_at && !!rec.device_first_seen_at;
}
