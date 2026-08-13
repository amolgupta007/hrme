import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL, FOUNDER_EMAIL_FROM as FOUNDER_EMAIL } from "@/lib/resend";
import {
  findSilentDevices,
  describeSilence,
  type DeviceHealthRow,
} from "@jambahr/shared/attendance/device-health";
import {
  DeviceOfflineAlertEmail,
  type OfflineDeviceLine,
} from "@/components/emails/device-offline-alert";

export const dynamic = "force-dynamic";

/**
 * Daily watchdog for biometric devices that have stopped reporting.
 *
 * Exists because of a real, costly incident: Medialoop's eSSL unit went silent on
 * 2026-08-07 and nobody noticed for six days — 18 of 20 employees had no attendance
 * recorded, and it surfaced only through an unrelated audit. A device that stops
 * pushing looks exactly like a device where nobody punched, so without this nothing
 * in the product would ever say otherwise.
 *
 * **Internal alert — the founder only.** Customers are deliberately not emailed:
 * an automated "your attendance is broken" message is alarming, lands without
 * context, and pre-empts the conversation we would rather have with them
 * ourselves. Notifying org admins is a product decision to make explicitly, not
 * a default to drift into.
 *
 * Fires once per day per silent device until it reconnects. Decision logic is
 * pure and unit-tested in `@jambahr/shared/attendance/device-health`; this route
 * is I/O only.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminSupabase();
  const nowMs = Date.now();

  const { data: deviceRows, error } = await sb
    .from("devices")
    .select("id, org_id, device_serial, label, is_active, last_seen_at, silence_alerted_at, created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const devices: DeviceHealthRow[] = ((deviceRows ?? []) as unknown as Array<
    Record<string, unknown>
  >).map((r) => ({
    id: String(r.id),
    orgId: String(r.org_id),
    serial: String(r.device_serial ?? ""),
    label: (r.label as string | null) ?? null,
    isActive: r.is_active !== false,
    lastSeenAt: (r.last_seen_at as string | null) ?? null,
    silenceAlertedAt: (r.silence_alerted_at as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
  }));

  const alerts = findSilentDevices(devices, nowMs);

  // A device that has come back must be able to alert again on a LATER outage,
  // so clear the de-dup stamp once it is healthy again. Done for every healthy
  // device that still carries one, independent of whether anything alerted today.
  const alertingIds = new Set(alerts.map((a) => a.device.id));
  const recovered = devices.filter((d) => d.silenceAlertedAt && !alertingIds.has(d.id));
  for (const d of recovered) {
    try {
      await sb.from("devices").update({ silence_alerted_at: null } as never).eq("id", d.id);
    } catch {
      // Best-effort: a failed reset only risks a delayed alert next time.
    }
  }

  if (alerts.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: devices.length,
      alerted: 0,
      recovered: recovered.length,
    });
  }

  // Group by org: one email listing every silent device beats one per device.
  const byOrg = new Map<string, typeof alerts>();
  for (const a of alerts) {
    const list = byOrg.get(a.device.orgId) ?? [];
    list.push(a);
    byOrg.set(a.device.orgId, list);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";
  let emailed = 0;

  for (const [orgId, orgAlerts] of byOrg) {
    try {
      const { data: org } = await sb
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .maybeSingle();

      const orgName = (org as { name?: string } | null)?.name ?? "an organisation";

      // INTERNAL alert — founder only. Customers are deliberately NOT emailed:
      // an automated "your attendance is broken" message is alarming, arrives
      // without context, and pre-empts the conversation we would rather have
      // with them directly. Adding org admins here is a product decision, not a
      // config tweak.
      const to = [FOUNDER_EMAIL];

      const lines: OfflineDeviceLine[] = orgAlerts.map((a) => ({
        serial: a.device.serial,
        label: a.device.label,
        silenceFor: describeSilence(a),
        neverConnected: a.neverConnected,
      }));

      await resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject:
          orgAlerts.length > 1
            ? `[JambaHR ops] ${orgAlerts.length} devices offline at ${orgName}`
            : `[JambaHR ops] Device offline at ${orgName}`,
        react: DeviceOfflineAlertEmail({
          orgName,
          devices: lines,
          dashboardUrl: `${appUrl}/dashboard/settings`,
        }),
      });

      // Stamp only AFTER a successful send, so a failed email retries tomorrow
      // rather than being silently suppressed for a day.
      const stampedAt = new Date(nowMs).toISOString();
      for (const a of orgAlerts) {
        await sb
          .from("devices")
          .update({ silence_alerted_at: stampedAt } as never)
          .eq("id", a.device.id);
      }
      emailed += 1;
    } catch (err) {
      // One org's failure must not stop the sweep for the others.
      console.error(`[cron/device-health-check] org ${orgId} failed`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: devices.length,
    silent: alerts.length,
    orgsEmailed: emailed,
    recovered: recovered.length,
  });
}
