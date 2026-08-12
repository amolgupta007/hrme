import { NextResponse } from "next/server";
import { normalizeAppConfig, DEFAULT_APP_CONFIG } from "@jambahr/shared/mobile/app-config";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: client version gate + update nudge (PRD-05 §6).
 *
 * **Deliberately unauthenticated.** The app calls this before sign-in, and a
 * client too old to authenticate correctly is exactly the client that most
 * needs to be told to upgrade. The response carries no tenant data — only
 * public release metadata — so there is nothing here to protect.
 *
 * Driven by env vars so raising the floor is a config change, not a deploy:
 *   MOBILE_MIN_VERSION     e.g. "1.2.0"  (builds below this are blocked)
 *   MOBILE_LATEST_VERSION  e.g. "1.4.1"  (soft "update available" nudge)
 *   MOBILE_UPDATE_URL      the App Store / Play listing
 *   MOBILE_UPDATE_MESSAGE  optional override for the block-screen copy
 *
 * Every field degrades to permissive when unset or malformed: unset env must
 * never lock users out (see `isVersionBlocked`'s fail-open contract).
 */
export function GET() {
  const config = normalizeAppConfig({
    minVersion: process.env.MOBILE_MIN_VERSION ?? DEFAULT_APP_CONFIG.minVersion,
    latestVersion: process.env.MOBILE_LATEST_VERSION,
    updateUrl: process.env.MOBILE_UPDATE_URL,
    message: process.env.MOBILE_UPDATE_MESSAGE,
  });

  return NextResponse.json(config, {
    // Short public cache: this is identical for every caller and is polled on
    // every cold start, but a raised floor should take effect within minutes,
    // not hours.
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
