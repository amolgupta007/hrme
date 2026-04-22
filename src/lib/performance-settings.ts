export type PerformanceSettings = {
  rating_labels: [string, string, string, string, string];
  rating_labels_3: [string, string, string];
  rating_labels_10_anchors: [string, string, string];
  competencies: string[];
  self_review_required: boolean;
};

const DEFAULTS: PerformanceSettings = {
  rating_labels: ["Poor", "Fair", "Good", "Great", "Excellent"],
  rating_labels_3: ["Needs Improvement", "Meets Expectations", "Exceeds Expectations"],
  rating_labels_10_anchors: ["Poor", "Average", "Excellent"],
  competencies: [],
  self_review_required: true,
};

export function getPerformanceSettings(orgSettings: Record<string, any> | null): PerformanceSettings {
  const perf = orgSettings?.performance ?? {};
  return {
    rating_labels:
      Array.isArray(perf.rating_labels) &&
      perf.rating_labels.length === 5 &&
      (perf.rating_labels as unknown[]).every((l) => typeof l === "string" && l.length > 0)
        ? (perf.rating_labels as [string, string, string, string, string])
        : DEFAULTS.rating_labels,
    rating_labels_3:
      Array.isArray(perf.rating_labels_3) &&
      perf.rating_labels_3.length === 3 &&
      (perf.rating_labels_3 as unknown[]).every((l) => typeof l === "string" && l.length > 0)
        ? (perf.rating_labels_3 as [string, string, string])
        : DEFAULTS.rating_labels_3,
    rating_labels_10_anchors:
      Array.isArray(perf.rating_labels_10_anchors) &&
      perf.rating_labels_10_anchors.length === 3 &&
      (perf.rating_labels_10_anchors as unknown[]).every((l) => typeof l === "string" && l.length > 0)
        ? (perf.rating_labels_10_anchors as [string, string, string])
        : DEFAULTS.rating_labels_10_anchors,
    competencies: Array.isArray(perf.competencies) ? perf.competencies : DEFAULTS.competencies,
    self_review_required:
      typeof perf.self_review_required === "boolean"
        ? perf.self_review_required
        : DEFAULTS.self_review_required,
  };
}

// Goals JSONB structure — supports both old array format and new object format
export type GoalsData = {
  items: { title: string; status: "pending" | "achieved" | "missed" }[];
  self_competency_ratings: Record<string, number>;
  manager_competency_ratings: Record<string, number>;
};

export function normalizeGoalsData(raw: unknown): GoalsData {
  if (Array.isArray(raw)) {
    const VALID_STATUSES = new Set(["pending", "achieved", "missed"]);
    const items = (raw as any[]).filter(
      (i): i is GoalsData["items"][number] =>
        i !== null &&
        typeof i === "object" &&
        typeof i.title === "string" &&
        VALID_STATUSES.has(i.status)
    );
    return { items, self_competency_ratings: {}, manager_competency_ratings: {} };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as any;
    return {
      items: Array.isArray(obj.items) ? obj.items : [],
      self_competency_ratings: obj.self_competency_ratings ?? {},
      manager_competency_ratings: obj.manager_competency_ratings ?? {},
    };
  }
  return { items: [], self_competency_ratings: {}, manager_competency_ratings: {} };
}
