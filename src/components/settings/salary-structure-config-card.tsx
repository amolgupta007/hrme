"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  upsertSalaryStructureConfig,
  recomputeAllSalaryStructures,
  previewConfigImpact,
  type SalaryStructureConfig,
  type ConfigImpactRow,
} from "@/actions/payroll";
import type { RatioConfig } from "@/lib/ctc";
import { ConfigImpactPreview } from "./config-impact-preview";

interface Props {
  activeConfig: RatioConfig;
  history: SalaryStructureConfig[];
}

export function SalaryStructureConfigCard({ activeConfig, history }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [basic, setBasic] = React.useState(String(activeConfig.basic_pct));
  const [hraMetro, setHraMetro] = React.useState(String(activeConfig.hra_pct_metro));
  const [hraNonMetro, setHraNonMetro] = React.useState(String(activeConfig.hra_pct_non_metro));
  const [gratuity, setGratuity] = React.useState(String(activeConfig.gratuity_pct));
  const [effectiveFrom, setEffectiveFrom] = React.useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = React.useState<ConfigImpactRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  const proposed: RatioConfig = {
    basic_pct: Number(basic),
    hra_pct_metro: Number(hraMetro),
    hra_pct_non_metro: Number(hraNonMetro),
    gratuity_pct: Number(gratuity),
  };

  async function handlePreview() {
    setLoading(true);
    const r = await previewConfigImpact(proposed);
    setLoading(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    setPreview(r.data);
  }

  async function handleSave() {
    setLoading(true);
    const r = await upsertSalaryStructureConfig({ ...proposed, effective_from: effectiveFrom });
    setLoading(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success("Configuration saved. Click 'Recompute all' to propagate to existing structures.");
    setEditing(false);
    setPreview(null);
  }

  async function handleRecomputeAll() {
    setLoading(true);
    const r = await recomputeAllSalaryStructures();
    setLoading(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success(`Recomputed ${r.data.recomputed} salary structures`);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Salary Structure Ratios</p>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Basic</span>{" "}
            <span className="font-semibold tabular-nums">{activeConfig.basic_pct}%</span>{" "}
            <span className="text-xs text-muted-foreground">of CTC</span>
          </div>
          <div>
            <span className="text-muted-foreground">Gratuity</span>{" "}
            <span className="font-semibold tabular-nums">{activeConfig.gratuity_pct}%</span>{" "}
            <span className="text-xs text-muted-foreground">of Basic</span>
          </div>
          <div>
            <span className="text-muted-foreground">HRA Metro</span>{" "}
            <span className="font-semibold tabular-nums">{activeConfig.hra_pct_metro}%</span>{" "}
            <span className="text-xs text-muted-foreground">of Basic</span>
          </div>
          <div>
            <span className="text-muted-foreground">HRA Non-Metro</span>{" "}
            <span className="font-semibold tabular-nums">{activeConfig.hra_pct_non_metro}%</span>{" "}
            <span className="text-xs text-muted-foreground">of Basic</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Basic % of CTC</span>
              <input
                type="number"
                min={10}
                max={80}
                step={0.5}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5"
                value={basic}
                onChange={(e) => setBasic(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Gratuity % of Basic</span>
              <input
                type="number"
                min={0}
                max={20}
                step={0.01}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5"
                value={gratuity}
                onChange={(e) => setGratuity(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">HRA Metro % of Basic</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5"
                value={hraMetro}
                onChange={(e) => setHraMetro(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">HRA Non-Metro % of Basic</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5"
                value={hraNonMetro}
                onChange={(e) => setHraNonMetro(e.target.value)}
              />
            </label>
            <label className="block col-span-2">
              <span className="block text-xs text-muted-foreground mb-1">Effective from</span>
              <input
                type="date"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handlePreview} disabled={loading}>
              Preview impact
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading}>
              {loading ? "Saving…" : "Save config"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setPreview(null);
              }}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
          {preview && <ConfigImpactPreview rows={preview} />}
        </div>
      )}

      <div className="border-t border-border pt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {history.length} historical version{history.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" variant="ghost" onClick={handleRecomputeAll} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recompute all salary structures
        </Button>
      </div>
    </div>
  );
}
