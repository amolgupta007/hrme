"use client";

import { SalaryStructureConfigCard } from "./salary-structure-config-card";
import { RazorpayXCard } from "./razorpayx-card";
import type { SalaryStructureConfig } from "@/actions/payroll";
import type { RatioConfig } from "@/lib/ctc";
import type { MaskedRazorpayXCredentials } from "@/actions/razorpayx-credentials";

interface Props {
  activeConfig: RatioConfig;
  history: SalaryStructureConfig[];
  razorpayxCredentials: MaskedRazorpayXCredentials | null;
}

export function PayrollSection({ activeConfig, history, razorpayxCredentials }: Props) {
  return (
    <div className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Payroll</h2>
      <p className="text-sm text-muted-foreground">
        Configure the salary-structure ratios applied to new salary upserts. Changes do not
        automatically rewrite existing salaries — use &quot;Recompute all&quot; to propagate.
      </p>
      <SalaryStructureConfigCard activeConfig={activeConfig} history={history} />
      <RazorpayXCard credentials={razorpayxCredentials} />
    </div>
  );
}
