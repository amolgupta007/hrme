import { NextResponse } from "next/server";
import {
  ingestAttlog,
  touchDeviceSeen,
  resolveOrgByIngestToken,
} from "@/lib/attendance/adms-ingest";
import { parseIclockPath } from "@/lib/attendance/iclock-path";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildUserCommand,
  buildDeleteCommand,
  parseDeviceCmdAcks,
} from "@/lib/attendance/adms-commands";

/**
 * ZKTeco / eSSL ADMS ("push SDK") attendance endpoint — multi-location attendance Phase 0.C.
 *
 * Handles the device's HTTP push conversation:
 *   1. Logs every raw device hit (kept from the capture phase — handy for new firmware).
 *   2. Replies with the minimal valid ADMS handshake so the device proceeds past
 *      registration and uploads its ATTLOG stream — a bare 200 stalls it.
 *   3. Ingests ATTLOG punches into attendance_punch_events + recomputes the daily rollup.
 *
 * No auth (devices can't send Clerk sessions; /iclock(.*) is public in middleware);
 * org/employee are resolved from the device serial (SN) + PIN inside ingestAttlog.
 *
 * ZKTeco ADMS request shapes this catches:
 *   GET  /iclock/cdata?SN=<serial>&options=all&pushver=...   → registration handshake
 *   POST /iclock/cdata?SN=<serial>&table=ATTLOG&Stamp=<n>    → punch logs (tab-separated text)
 *   GET  /iclock/getrequest?SN=<serial>                      → poll for server commands
 *   POST /iclock/devicecmd?SN=<serial>                       → command execution ack
 */

export const dynamic = "force-dynamic";

function ok(text: string) {
  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

const COMMAND_BATCH = 20;

/**
 * Drain up to COMMAND_BATCH pending user-provisioning commands for this serial.
 * Builds + persists each command line, flips the row to `sent`, and returns the
 * joined lines (or null when there's nothing pending / device not eligible).
 */
async function dispatchCommands(sn: string): Promise<string | null> {
  const supabase = createAdminSupabase();

  // Only dispatch to a registered, active device.
  const { data: device } = await supabase
    .from("devices")
    .select("id, is_active")
    .eq("device_serial", sn)
    .maybeSingle();
  if (!device || (device as any).is_active !== true) return null;

  const { data: pending } = await supabase
    .from("device_commands")
    .select("id, cmd_seq, cmd_type, pin, name")
    .eq("device_serial", sn)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(COMMAND_BATCH);
  if (!pending || pending.length === 0) return null;

  const lines: string[] = [];
  for (const c of pending as any[]) {
    const line =
      c.cmd_type === "delete_user"
        ? buildDeleteCommand(c.cmd_seq, c.pin)
        : buildUserCommand({ cmdSeq: c.cmd_seq, pin: c.pin, name: c.name ?? "" });
    lines.push(line);
    await (supabase.from("device_commands") as any)
      .update({ status: "sent", sent_at: new Date().toISOString(), command_text: line })
      .eq("id", c.id);
  }
  return lines.join("\n") + "\n";
}

/**
 * Record a device's command ack(s). eSSL firmware batches every outstanding
 * ack into one POST (one `ID=<cmd_seq>&Return=<code>` per line); ZKTeco units
 * usually send one per POST. Handle both.
 */
async function recordAck(body: string): Promise<void> {
  const acks = parseDeviceCmdAcks(body);
  if (acks.length === 0) return;
  const supabase = createAdminSupabase();
  const now = new Date().toISOString();
  const confirmedIds = acks.filter((a) => a.ret !== null && a.ret >= 0).map((a) => a.id);
  const failures = acks.filter((a) => a.ret === null || a.ret < 0);
  if (confirmedIds.length > 0) {
    await (supabase.from("device_commands") as any)
      .update({ status: "confirmed", confirmed_at: now })
      .in("cmd_seq", confirmedIds);
  }
  for (const a of failures) {
    await (supabase.from("device_commands") as any)
      .update({ status: "failed", last_error: `Return=${a.ret}` })
      .eq("cmd_seq", a.id);
  }
}

async function capture(req: Request, seg: string[]): Promise<NextResponse> {
  const url = new URL(req.url);
  const path = "/iclock/" + seg.join("/");
  const query = Object.fromEntries(url.searchParams.entries());
  const headers = Object.fromEntries(req.headers.entries());
  const sn = query.SN ?? query.sn ?? "(none)";
  // Optional per-org ingest token in the path: /iclock/<token>/<verb>.
  const { token, endpoint } = parseIclockPath(seg);

  let body = "";
  try {
    body = await req.text();
  } catch {
    body = "(unreadable)";
  }

  // Loud, greppable block so it's obvious in the `npm run dev` terminal.
  console.log("\n══════════════ [iclock capture] ══════════════");
  console.log("time   :", new Date().toISOString());
  console.log("method :", req.method);
  console.log("path   :", path);
  console.log("serial :", sn);
  console.log("query  :", JSON.stringify(query));
  console.log("headers:", JSON.stringify(headers));
  console.log("body   :\n" + (body.length ? body : "(empty)"));
  console.log("═══════════════════════════════════════════════\n");

  // GET /iclock/cdata = registration handshake. Send a config block that asks the
  // device to push all attendance logs in realtime, unencrypted.
  if (req.method === "GET" && endpoint === "cdata") {
    const handshake = [
      `GET OPTION FROM: ${sn}`,
      "ATTLOGStamp=None", // None = resend all stored logs (so we see data even if old)
      "OPERLOGStamp=9999",
      "ATTPHOTOStamp=None",
      "ErrorDelay=30",
      "Delay=10",
      "TransTimes=00:00;14:05",
      "TransInterval=1",
      "TransFlag=1111000000",
      "TimeZone=330", // +05:30 IST in minutes; device may override
      "Realtime=1",
      "Encrypt=0",
    ].join("\n");
    return ok(handshake + "\n");
  }

  // POST /iclock/cdata?table=ATTLOG = attendance punches. Ingest, then ack.
  if (req.method === "POST" && endpoint === "cdata" && query.table === "ATTLOG") {
    try {
      const orgIdFromToken = token ? await resolveOrgByIngestToken(token) : null;
      const result = await ingestAttlog(sn, body, {
        tokenProvided: !!token,
        orgIdFromToken,
      });
      console.log("[adms] ingest:", JSON.stringify(result));
    } catch (e) {
      // Never fail the device's POST on our error — it would just resend (deduped).
      console.error("[adms] ingest threw:", (e as Error)?.message);
    }
    return ok("OK\n");
  }

  // GET /iclock/getrequest = device polling for server commands. Hand it any
  // pending user-provisioning commands; otherwise fall through to OK. Best-effort:
  // any failure must not stall the device.
  if (req.method === "GET" && endpoint === "getrequest" && sn !== "(none)") {
    touchDeviceSeen(sn).catch(() => {});
    try {
      const commands = await dispatchCommands(sn);
      if (commands) return ok(commands);
    } catch (e) {
      console.error("[adms] dispatchCommands threw:", (e as Error)?.message);
    }
    return ok("OK\n");
  }

  // POST /iclock/devicecmd = device ack of a command we sent. Record the result.
  if (req.method === "POST" && endpoint === "devicecmd") {
    if (sn !== "(none)") touchDeviceSeen(sn).catch(() => {});
    try {
      await recordAck(body);
    } catch (e) {
      console.error("[adms] recordAck threw:", (e as Error)?.message);
    }
    return ok("OK\n");
  }

  // Everything else (OPERLOG POSTs, other polls/acks):
  // acknowledge so the device marks records delivered and keeps talking.
  // Bump device liveness (throttled) so Settings shows a live "connected" status.
  if (sn !== "(none)") {
    touchDeviceSeen(sn).catch(() => {});
  }
  return ok("OK\n");
}

export async function GET(
  req: Request,
  { params }: { params: { seg: string[] } },
) {
  return capture(req, params.seg ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: { seg: string[] } },
) {
  return capture(req, params.seg ?? []);
}
