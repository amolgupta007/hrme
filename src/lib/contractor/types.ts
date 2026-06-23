export type RateType = "hourly" | "daily" | "monthly" | "milestone";
export type TdsSection = "194J" | "194C";
export type PayeeType = "individual_huf" | "other";
export type EngagementStatus = "active" | "ended";

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  hourly: "Hourly",
  daily: "Daily",
  monthly: "Monthly",
  milestone: "Per milestone",
};

export const TDS_SECTION_LABELS: Record<TdsSection, string> = {
  "194J": "194J — Professional / technical fees",
  "194C": "194C — Contract work",
};
