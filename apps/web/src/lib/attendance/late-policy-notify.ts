export type NotifyKind = "late" | "threshold" | "warn";

export function planNotificationKinds(params: {
  policy: { threshold_days: number; warn_at: number | null; notify_on_late: boolean; notify_on_threshold: boolean };
  isLate: boolean;
  prevCount: number;
  newCount: number;
}): NotifyKind[] {
  const { policy, isLate, prevCount, newCount } = params;
  if (!isLate) return [];
  const kinds: NotifyKind[] = [];
  if (policy.notify_on_late) kinds.push("late");
  if (policy.warn_at != null && prevCount < policy.warn_at && newCount >= policy.warn_at && newCount < policy.threshold_days) {
    kinds.push("warn");
  }
  if (policy.notify_on_threshold && prevCount < policy.threshold_days && newCount >= policy.threshold_days) {
    kinds.push("threshold");
  }
  return kinds;
}
