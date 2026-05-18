"use client";
import type { UserRole } from "@/types";

const POOL: Record<UserRole, string[]> = {
  employee: [
    "How much leave do I have left?",
    "How do I download my payslip?",
    "How do I clock in?",
    "How do I acknowledge a policy?",
    "Where do I find my training assignments?",
    "How do I apply for leave?",
    "How do I submit my self-review?",
  ],
  manager: [
    "How do I approve a leave request?",
    "How do I review a direct report?",
    "Where do I see who's on leave this week?",
    "How do I approve an objective?",
    "How do I check team attendance today?",
    "How do I assign training to my team?",
  ],
  admin: [
    "How do I add a new employee?",
    "How do I run payroll for this month?",
    "How do I start a performance review cycle?",
    "How do I upload a company policy?",
    "How do I configure leave policies?",
    "How do I post an announcement?",
    "How do I bulk-import employees?",
  ],
  owner: [
    "How do I upgrade our plan?",
    "How do I add a new employee?",
    "How do I bulk-import employees?",
    "How do I run payroll for this month?",
    "How do I post a company announcement?",
    "How do I start a performance review cycle?",
  ],
};

function pick3<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, 3);
}

export function SuggestedPrompts({
  role,
  onPick,
}: {
  role: UserRole;
  onPick: (q: string) => void;
}) {
  const prompts = pick3(POOL[role]);
  return (
    <div className="flex w-full flex-col gap-1.5 px-2">
      <p className="text-xs text-muted-foreground">Try:</p>
      {prompts.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-left text-xs text-foreground hover:bg-muted"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
