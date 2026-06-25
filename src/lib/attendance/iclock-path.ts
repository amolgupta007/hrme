/**
 * Parse the path segments after `/iclock/` for the ADMS endpoint, supporting an
 * optional per-org ingest token prefix (security hardening).
 *
 *   /iclock/cdata                  -> { token: null,  endpoint: "cdata" }   (legacy, serial-gated)
 *   /iclock/<token>/cdata          -> { token,        endpoint: "cdata" }   (token-gated)
 *
 * A device whose firmware lets you set a custom server path can be pointed at
 * `/iclock/<token>` so its punches carry a secret the serial alone doesn't.
 * Distinguishing a token from a verb: the first segment is a token unless it is
 * a known ADMS verb.
 */

export const KNOWN_ADMS_VERBS = new Set([
  "cdata",
  "getrequest",
  "devicecmd",
  "fdata",
  "edata",
  "querydata",
  "ping",
  "registry",
  "push",
]);

export type IclockPath = {
  token: string | null;
  endpoint: string; // "" when absent
  rest: string[];
};

export function parseIclockPath(seg: string[]): IclockPath {
  if (!seg || seg.length === 0) return { token: null, endpoint: "", rest: [] };

  const first = seg[0]?.toLowerCase() ?? "";
  if (KNOWN_ADMS_VERBS.has(first)) {
    return { token: null, endpoint: seg[0], rest: seg.slice(1) };
  }
  // First segment isn't a verb → treat it as the ingest token; verb is next.
  return { token: seg[0], endpoint: seg[1] ?? "", rest: seg.slice(2) };
}
