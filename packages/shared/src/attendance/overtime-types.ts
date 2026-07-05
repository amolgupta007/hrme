// Shared types and defaults for the overtime module.
// Kept in a plain (non-"use server") file so client components can import without
// triggering Next.js's "use server files may only export async functions" error.

export type OvertimeSettings = {
  enabled: boolean;
  multiplier: number;
  threshold_mode: "per_day" | "weekly";
  weekly_threshold_hours: number;
  approval_required: boolean;
};

export const DEFAULT_OT_SETTINGS: OvertimeSettings = {
  enabled: false,
  multiplier: 1.5,
  threshold_mode: "per_day",
  weekly_threshold_hours: 48,
  approval_required: true,
};
