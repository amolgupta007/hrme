import type { ObjectiveItem } from "@/actions/objectives";

type TemplateItem = Omit<ObjectiveItem, "id" | "self_progress" | "self_status" | "self_comment" | "manager_rating" | "manager_comment">;

export type ObjectiveTemplate = {
  id: string;
  name: string;
  description: string;
  items: TemplateItem[];
};

function evenWeights(count: number): number[] {
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

function makeItems(titles: string[]): TemplateItem[] {
  const weights = evenWeights(titles.length);
  return titles.map((title, i) => ({
    title,
    description: "",
    success_criteria: "",
    weight: weights[i],
  }));
}

export const OBJECTIVE_TEMPLATES: ObjectiveTemplate[] = [
  {
    id: "revenue-growth",
    name: "Revenue & Growth",
    description: "Drive revenue targets and business growth",
    items: makeItems([
      "Achieve revenue target",
      "Grow customer base",
      "Improve win rate",
    ]),
  },
  {
    id: "learning-development",
    name: "Learning & Development",
    description: "Build skills and share knowledge",
    items: makeItems([
      "Complete key certification",
      "Build new skill",
      "Share knowledge with team",
    ]),
  },
  {
    id: "process-improvement",
    name: "Process Improvement",
    description: "Optimise workflows and reduce waste",
    items: makeItems([
      "Reduce process cycle time",
      "Automate manual task",
      "Improve documentation quality",
    ]),
  },
  {
    id: "customer-success",
    name: "Customer Success",
    description: "Improve customer outcomes and satisfaction",
    items: makeItems([
      "Improve customer satisfaction score",
      "Reduce churn",
      "Improve response SLA",
    ]),
  },
];
