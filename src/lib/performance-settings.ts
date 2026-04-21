export type PerformanceSettings = {
  rating_labels: [string, string, string, string, string];
  competencies: string[];
  self_review_required: boolean;
};

const DEFAULTS: PerformanceSettings = {
  rating_labels: ["Poor", "Fair", "Good", "Great", "Excellent"],
  competencies: [],
  self_review_required: true,
};

export function getPerformanceSettings(orgSettings: Record<string, any> | null): PerformanceSettings {
  const perf = orgSettings?.performance ?? {};
  return {
    rating_labels:
      Array.isArray(perf.rating_labels) && perf.rating_labels.length === 5
        ? (perf.rating_labels as [string, string, string, string, string])
        : DEFAULTS.rating_labels,
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
  // Legacy: array of {title, status}
  if (Array.isArray(raw)) {
    return { items: raw as GoalsData["items"], self_competency_ratings: {}, manager_competency_ratings: {} };
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
