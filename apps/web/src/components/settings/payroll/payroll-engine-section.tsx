"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getPayrollEngineView, type PayrollEngineView } from "@/actions/payroll-config";
import { PayrollSettingsCard } from "./payroll-settings-card";
import { PayrollComponentsCard } from "./payroll-components-card";
import { StatutoryRulesCard } from "./statutory-rules-card";
import { PayslipDetailsCard } from "./payslip-details-card";
import { small } from "./styles";

/**
 * Settings → Payroll → the payroll engine's configuration. Loads its own
 * state; everything is shown "as of" a pay month the admin can change, since
 * settings, components and rules are all versioned by pay month.
 */
export function PayrollEngineSection() {
  const [view, setView] = useState<PayrollEngineView | null>(null);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async (m?: string) => {
    const res = await getPayrollEngineView(m);
    if (!res.success) return void setError(res.error);
    setError(null);
    setView(res.data);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => { void load(month); }, [load, month]);

  if (error) return <p className="rounded-lg border p-4 text-sm text-destructive">{error}</p>;
  if (!view) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payroll settings…
      </div>
    );
  }

  const { config } = view;
  const earningCodes = config.components.filter((c) => c.kind === "earning").map((c) => c.code);
  const reload = () => void load(view.month);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>New payroll engine, being set up.</strong> These settings are saved now and take effect when payroll runs move to the
        new engine. Until then, runs keep using the current calculation and the ratios above.
        {config.source === "legacy" && " You haven't changed anything yet — what's shown is exactly how payroll works today."}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="pe-month" className="text-muted-foreground">Showing what applies to pay month</label>
        <input id="pe-month" type="month" className={`${small} w-40`} value={view.month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        {view.settingsHistory.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Changes saved from: {view.settingsHistory.map((h) => h.effectiveFromMonth).join(", ")}
          </span>
        )}
      </div>

      <PayrollSettingsCard key={`s-${version}`} settings={config.settings} month={view.month} onSaved={reload} />
      <PayrollComponentsCard
        key={`c-${version}`} components={config.components} inputMode={config.settings.inputMode} month={view.month} onSaved={reload}
      />
      <StatutoryRulesCard
        key={`r-${version}`} orgRules={view.orgRules} globalRules={view.globalRules} month={view.month} earningCodes={earningCodes} onSaved={reload}
      />
      <PayslipDetailsCard />
    </div>
  );
}
