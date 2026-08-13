/**
 * Biometric device silence detection.
 *
 * Motivated by a real incident: Medialoop's eSSL unit stopped reaching the
 * server on 2026-08-07 and nobody noticed for six days. Eighteen of twenty
 * employees had no attendance recorded for that whole period, and it was found
 * only by an unrelated audit. The failure is completely silent by nature — a
 * device that stops pushing looks exactly like a device where nobody punched,
 * and neither the customer nor we get any signal.
 *
 * Pure decision logic, so the thresholds and the re-alert cadence are testable
 * without a database or a device.
 */

/** A registered device, as the health check needs to see it. */
export type DeviceHealthRow = {
  id: string;
  orgId: string;
  serial: string;
  label: string | null;
  isActive: boolean;
  /** Last contact of ANY kind (poll or punch). Null = never connected. */
  lastSeenAt: string | null;
  /** When we last emailed about this device being silent. */
  silenceAlertedAt: string | null;
  /** When the device was registered — grace period for never-connected units. */
  createdAt: string | null;
};

export type DeviceAlert = {
  device: DeviceHealthRow;
  /** Whole hours since last contact; null when it has never connected. */
  silentHours: number | null;
  /** A device registered but never once seen — a failed installation. */
  neverConnected: boolean;
};

/**
 * How long a device may stay quiet before we call it an outage.
 *
 * 12 hours, not 1: devices legitimately go quiet overnight, over a weekend, or
 * during a holiday, and an alert that cries wolf on a Sunday morning gets muted
 * — after which it protects nobody. Twelve hours still catches a Monday-morning
 * failure before the day's attendance is lost.
 */
export const DEVICE_SILENCE_THRESHOLD_HOURS = 12;

/**
 * Don't re-alert about the same device more often than this.
 *
 * An outage that runs for days should nag — the Medialoop one needed nagging —
 * but daily is the right cadence, not hourly-per-cron-run.
 */
export const DEVICE_REALERT_INTERVAL_HOURS = 24;

/**
 * Grace period for a device that has never connected at all.
 *
 * Registering the device in the portal comes BEFORE physically configuring it,
 * so a brand-new registration is legitimately silent for a while. Alerting
 * instantly would fire on every correct installation.
 */
export const NEVER_CONNECTED_GRACE_HOURS = 24;

function hoursBetween(fromIso: string, nowMs: number): number | null {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return null;
  return Math.floor((nowMs - t) / 3_600_000);
}

/**
 * Should this device be alerted on right now?
 *
 * Inactive devices are skipped entirely — deactivating one in the portal is the
 * supported way to retire hardware, and it must not keep generating alerts.
 */
export function evaluateDeviceHealth(
  device: DeviceHealthRow,
  nowMs: number,
  opts?: { thresholdHours?: number; realertHours?: number; graceHours?: number },
): DeviceAlert | null {
  if (!device.isActive) return null;

  const threshold = opts?.thresholdHours ?? DEVICE_SILENCE_THRESHOLD_HOURS;
  const realert = opts?.realertHours ?? DEVICE_REALERT_INTERVAL_HOURS;
  const grace = opts?.graceHours ?? NEVER_CONNECTED_GRACE_HOURS;

  let silentHours: number | null;
  let neverConnected = false;

  if (!device.lastSeenAt) {
    neverConnected = true;
    // Unparseable/absent createdAt: treat as out of grace rather than silently
    // never alerting — a device we can't date is one we should look at.
    const age = device.createdAt ? hoursBetween(device.createdAt, nowMs) : null;
    if (age !== null && age < grace) return null;
    silentHours = null;
  } else {
    const silent = hoursBetween(device.lastSeenAt, nowMs);
    // A future/garbage timestamp is not evidence of an outage.
    if (silent === null || silent < threshold) return null;
    silentHours = silent;
  }

  // Already told them recently — stay quiet until the re-alert window passes.
  if (device.silenceAlertedAt) {
    const sinceAlert = hoursBetween(device.silenceAlertedAt, nowMs);
    if (sinceAlert !== null && sinceAlert < realert) return null;
  }

  return { device, silentHours, neverConnected };
}

/** Evaluate a fleet, newest-outage last so the worst offenders read first. */
export function findSilentDevices(
  devices: readonly DeviceHealthRow[],
  nowMs: number,
  opts?: { thresholdHours?: number; realertHours?: number; graceHours?: number },
): DeviceAlert[] {
  return devices
    .map((d) => evaluateDeviceHealth(d, nowMs, opts))
    .filter((a): a is DeviceAlert => a !== null)
    .sort((a, b) => {
      // Never-connected first (a broken install), then longest silence.
      if (a.neverConnected !== b.neverConnected) return a.neverConnected ? -1 : 1;
      return (b.silentHours ?? 0) - (a.silentHours ?? 0);
    });
}

/** "6 days" / "14 hours" — for email copy. */
export function describeSilence(alert: DeviceAlert): string {
  if (alert.neverConnected || alert.silentHours === null) return "never connected";
  const days = Math.floor(alert.silentHours / 24);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  return `${alert.silentHours} hour${alert.silentHours === 1 ? "" : "s"}`;
}
