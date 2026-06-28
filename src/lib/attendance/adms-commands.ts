/**
 * Pure ADMS ("push SDK") command builders + ack parser for ZKTeco/eSSL devices.
 * No DB, no I/O — safe to unit test. The route handler and provisioning helper
 * both import from here so the wire format lives in exactly one place.
 */
const NAME_MAX = 24;

export function sanitizeName(name: string): string {
  return (name ?? "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin ?? "");
}

export function buildUserCommand(input: { cmdSeq: number; pin: string; name: string }): string {
  const name = sanitizeName(input.name);
  return (
    `C:${input.cmdSeq}:DATA UPDATE USERINFO ` +
    `PIN=${input.pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=`
  );
}

export function buildDeleteCommand(cmdSeq: number, pin: string): string {
  return `C:${cmdSeq}:DATA DELETE USERINFO PIN=${pin}`;
}

export function parseDeviceCmdAck(body: string): { id: number | null; ret: number | null; raw: string } {
  const raw = body ?? "";
  const idMatch = raw.match(/\bID=(-?\d+)/i);
  const retMatch = raw.match(/\bReturn=(-?\d+)/i);
  return {
    id: idMatch ? parseInt(idMatch[1], 10) : null,
    ret: retMatch ? parseInt(retMatch[1], 10) : null,
    raw,
  };
}
