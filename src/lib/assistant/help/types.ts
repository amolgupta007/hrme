import type { OrgPlan } from "@/config/plans";
import type { UserRole } from "@/types";

export type HelpFrontmatter = {
  id: string;
  title: string;
  summary: string;
  route_key: string;
  allowed_roles: UserRole[];
  plan_tier: OrgPlan;
  keywords?: string[];
};

export type HelpArticle = HelpFrontmatter & {
  body: string;
  steps: Array<{ n: number; instruction: string }>;
};
