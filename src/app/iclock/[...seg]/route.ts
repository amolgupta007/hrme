import { NextResponse } from "next/server";
import {
  ingestAttlog,
  touchDeviceSeen,
  resolveOrgByIngestToken,
} from "@/lib/attendance/adms-ingest";
import { parseIclockPath } from "@/lib/attendance/iclock-path";

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

  // Everything else (OPERLOG POSTs, getrequest polls, devicecmd acks):
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
