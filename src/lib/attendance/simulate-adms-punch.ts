/**
 * Dev-only helper: fire a synthetic ADMS punch through the REAL ingest path
 * (no physical device needed). Mirrors the `simulateIndeedApplication` dev
 * helper. Use to exercise cross-org attribution — e.g. a Wagholi PIN at the
 * Boat Club serial should land in Wagholi's attendance + a Boat Club guest log.
 *
 * NOT wired to any route. Call from a scratch script / server action in dev.
 */
import { ingestAttlog } from "./adms-ingest";

export async function simulateAdmsPunch(args: {
  serial: string;
  pin: string;
  /** Device-local IST wall-clock: "YYYY-MM-DD HH:MM:SS". */
  localDateTime: string;
}) {
  // Real ATTLOG line format: <pin>\t<YYYY-MM-DD HH:MM:SS>\t<status>\t<verify>\t...
  const body = `${args.pin}\t${args.localDateTime}\t0\t1\t0\t0\t0\t0\t0\t0\t`;
  return ingestAttlog(args.serial, body, { tokenProvided: false, orgIdFromToken: null });
}
