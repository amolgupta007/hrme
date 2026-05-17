// M5 — per-role stage-move permissions.
//
// Owner/admin: can move any card to any stage (subject to gates).
// Manager: can move cards on jobs where they are hiring_manager_id, but only
//          within the interview pipeline (screening ↔ shortlisted ↔ interview_1
//          ↔ interview_2 ↔ final_round). Cannot push to offer/hired or reject.
// Employee: no pipeline moves at all (no /hire/* access anyway).

import type { ApplicationStage } from "@/actions/hire";
import type { UserRole } from "@/types";

const MANAGER_ALLOWED_STAGES: ApplicationStage[] = [
  "screening",
  "shortlisted",
  "interview_1",
  "interview_2",
  "final_round",
];

export function isOwnerOrAdmin(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

export type PermissionContext = {
  role: UserRole;
  employeeId: string | null;
  jobHiringManagerId: string | null;
};

export function canMoveStage(
  fromStage: ApplicationStage,
  toStage: ApplicationStage,
  ctx: PermissionContext,
): boolean {
  // Admins / owners can move anything (gates still apply downstream).
  if (isOwnerOrAdmin(ctx.role)) return true;

  // Managers: only for own jobs, and only within the manager-allowed pipeline.
  if (ctx.role === "manager") {
    if (!ctx.jobHiringManagerId || !ctx.employeeId) return false;
    if (ctx.jobHiringManagerId !== ctx.employeeId) return false;
    return MANAGER_ALLOWED_STAGES.includes(fromStage) && MANAGER_ALLOWED_STAGES.includes(toStage);
  }

  return false;
}
