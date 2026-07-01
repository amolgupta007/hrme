/**
 * Pure guards for who may act on a punch event. No DB, no I/O.
 * - Admins/owners: approve/reject anyone, void anyone, and their own manual
 *   adds auto-approve.
 * - Managers: approve/reject only employees in their department scope
 *   (resolved via departments.head_id upstream); cannot void.
 * - Employees: cannot approve/reject/void; their manual adds land pending.
 */
export type PunchActor = {
  role: "owner" | "admin" | "manager" | "employee";
  employeeId: string | null;
  /** Employee ids in this actor's manager scope (empty for non-managers). */
  scopedEmployeeIds: string[];
};

const isAdminRole = (r: PunchActor["role"]) => r === "owner" || r === "admin";

export function canApprovePunch(actor: PunchActor, targetEmployeeId: string): boolean {
  if (isAdminRole(actor.role)) return true;
  if (actor.role === "manager") return actor.scopedEmployeeIds.includes(targetEmployeeId);
  return false;
}

export function canVoidPunch(actor: PunchActor): boolean {
  return isAdminRole(actor.role);
}

export function autoApproveOnAdd(actor: PunchActor): boolean {
  return isAdminRole(actor.role);
}
