export type DesiredCommand = {
  device_id: string;
  pin: string;
  cmd_type: "upsert_user" | "delete_user";
};

export function commandKey(c: DesiredCommand): string {
  return `${c.device_id}|${c.pin}|${c.cmd_type}`;
}

export function missingCommands(
  desired: DesiredCommand[],
  existingPendingKeys: Set<string>
): DesiredCommand[] {
  const seen = new Set<string>();
  const out: DesiredCommand[] = [];
  for (const c of desired) {
    const k = commandKey(c);
    if (existingPendingKeys.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
