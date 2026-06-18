import type { IndeedClient } from "./client";
import { realIndeedClient } from "./client";
import { sandboxIndeedClient } from "./sandbox";

export function indeedIsLive(): boolean {
  return (
    process.env.INDEED_LIVE === "true" &&
    !!process.env.INDEED_CLIENT_ID &&
    !!process.env.INDEED_CLIENT_SECRET
  );
}

export function getIndeedClient(): IndeedClient {
  return indeedIsLive() ? realIndeedClient : sandboxIndeedClient;
}

export type { IndeedClient };
