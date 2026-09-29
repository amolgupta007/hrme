// Plain module (gotcha #78) — imported by server pages and client components.

export const ANNOUNCEMENT_CATEGORIES = ["general", "policy", "event", "urgent"] as const;
export type AnnouncementCategoryKey = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const CATEGORY_META: Record<
  AnnouncementCategoryKey,
  { label: string; chip: string; banner: string }
> = {
  general: {
    label: "General",
    chip: "border-transparent bg-muted text-muted-foreground",
    banner: "border-border border-l-muted-foreground/40 bg-muted/40 text-foreground",
  },
  policy: {
    label: "Policy",
    chip: "border-transparent bg-primary/10 text-primary",
    banner: "border-primary/30 border-l-primary bg-primary/5 text-foreground",
  },
  event: {
    label: "Event",
    chip: "border-transparent bg-accent/10 text-accent",
    banner: "border-accent/30 border-l-accent bg-accent/5 text-foreground",
  },
  urgent: {
    label: "Urgent",
    chip: "border-transparent bg-destructive/10 text-destructive",
    banner: "border-destructive/30 border-l-destructive bg-destructive/5 text-foreground",
  },
};

export function categoryMeta(category: string | null | undefined) {
  return CATEGORY_META[(category as AnnouncementCategoryKey) ?? "general"] ?? CATEGORY_META.general;
}

/** Deep link to one announcement on the list page. */
export function announcementAnchor(id: string) {
  return `announcement-${id}`;
}
