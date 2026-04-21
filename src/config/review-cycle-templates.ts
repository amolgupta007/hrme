function currentQuarter(): { start: string; end: string; label: string } {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  const q = Math.floor(month / 3) + 1;
  const startMonth = (q - 1) * 3;
  const endMonth = startMonth + 2;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, endMonth + 1, 0); // last day of endMonth
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { start: fmt(start), end: fmt(end), label: `Q${q} ${year}` };
}

export type CycleTemplate = {
  id: string;
  name: string;
  description: string;
  getName: () => string;
  getStartDate: () => string;
  getEndDate: () => string;
};

export const CYCLE_TEMPLATES: CycleTemplate[] = [
  {
    id: "annual",
    name: "Annual Review",
    description: "Full-year performance review",
    getName: () => `Annual Review ${new Date().getFullYear()}`,
    getStartDate: () => `${new Date().getFullYear()}-01-01`,
    getEndDate: () => `${new Date().getFullYear()}-12-31`,
  },
  {
    id: "mid-year",
    name: "Mid-Year Check-in",
    description: "First-half review",
    getName: () => `Mid-Year Check-in ${new Date().getFullYear()}`,
    getStartDate: () => `${new Date().getFullYear()}-01-01`,
    getEndDate: () => `${new Date().getFullYear()}-06-30`,
  },
  {
    id: "quarterly",
    name: "Quarterly Pulse",
    description: "Current quarter review",
    getName: () => `${currentQuarter().label} Pulse`,
    getStartDate: () => currentQuarter().start,
    getEndDate: () => currentQuarter().end,
  },
];
