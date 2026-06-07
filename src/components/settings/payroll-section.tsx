"use client";

import { SalaryStructureConfigCard } from "./salary-structure-config-card";
import type { SalaryStructureConfig } from "@/actions/payroll";
import type { RatioConfig } from "@/lib/ctc";

interface Props {
  activeConfig: RatioConfig;
  history: SalaryStructureConfig[];
}

export function PayrollSection({ activeConfig, history }: Props) {
  return (
    <div className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Payroll</h2>
      <p className="text-sm text-muted-foreground">
        Configure the salary-structure ratios applied to new salary upserts. Changes do not
        automatically rewrite existing salaries — use &quot;Recompute all&quot; to propagate.
      </p>
      <SalaryStructureConfigCard activeConfig={activeConfig} history={history} />
    </div>
  );
}
