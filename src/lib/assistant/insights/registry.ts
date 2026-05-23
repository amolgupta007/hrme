import type { InsightRule } from "./types";
import { grievancesUrgent } from "./rules/grievances-urgent";
import { leavePendingApprovals } from "./rules/leave-pending-approvals";
import { trainingOverdue } from "./rules/training-overdue";
import { docsUnacknowledged } from "./rules/docs-unacknowledged";
import { hiringStalled } from "./rules/hiring-stalled";
import { reviewCycleIncomplete } from "./rules/review-cycle-incomplete";
import { leaveConcentration } from "./rules/leave-concentration";
import { newJoiners } from "./rules/new-joiners";
import { probationWindow } from "./rules/probation-window";
import { attendanceAnomalies } from "./rules/attendance-anomalies";
import { leaveBalanceExpiry } from "./rules/leave-balance-expiry";

// Ordered by basePriority (descending) for readability; engine re-sorts results anyway.
export const INSIGHT_RULES: InsightRule[] = [
  grievancesUrgent,
  leavePendingApprovals,
  trainingOverdue,
  docsUnacknowledged,
  hiringStalled,
  reviewCycleIncomplete,
  leaveConcentration,
  newJoiners,
  probationWindow,
  attendanceAnomalies,
  leaveBalanceExpiry,
];
