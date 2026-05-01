export const LATEST_POLICY_VERSION = "2026-05-01";

export const LEGAL_SLUGS = ["privacy", "terms"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
