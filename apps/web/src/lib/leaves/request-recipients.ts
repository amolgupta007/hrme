// Pure recipient resolution for leave-request emails (spec 2026-07-15):
// managers-of-record + owner/admins when the employee has managers; otherwise
// the historical all-manager blast. Plain module (gotcha #85).
export type LeaveNotifiable = { id: string; role: string; email: string | null };

export function resolveLeaveRecipients(
  managerIdsOfEmployee: string[],
  activeManagerPlus: LeaveNotifiable[]
): string[] {
  const withEmail = activeManagerPlus.filter((p) => !!p.email?.trim());
  const admins = withEmail.filter((p) => p.role === "owner" || p.role === "admin");
  const managersOfRecord = withEmail.filter((p) => managerIdsOfEmployee.includes(p.id));
  const chosen = managerIdsOfEmployee.length > 0 ? [...managersOfRecord, ...admins] : withEmail;
  return [...new Set(chosen.map((p) => p.email!.trim()))];
}
