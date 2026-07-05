"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateTemplateDraft } from "@/actions/documents-templating";
import type { ClauseCategory, DocumentType } from "@/lib/documents/types";

type GenClause = { title: string; body_markdown: string; is_mandatory: boolean; category: ClauseCategory };

const EMPLOYMENT = ["full_time", "part_time", "contract", "intern"] as const;

export function AiDraftDialog({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  onGenerated: (clauses: GenClause[]) => void;
}) {
  const [roleTitle, setRoleTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [employmentType, setEmploymentType] = useState<(typeof EMPLOYMENT)[number]>("full_time");
  const [state, setState] = useState("");
  const [pasted, setPasted] = useState("");
  const [documentType] = useState<DocumentType>("offer_letter");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function generate() {
    if (!roleTitle.trim()) {
      toast.error("Enter the role/designation");
      return;
    }
    setLoading(true);
    const res = await generateTemplateDraft({
      roleTitle: roleTitle.trim(),
      industry: industry.trim() || undefined,
      employmentType,
      state: state.trim() || undefined,
      pastedClauses: pasted.trim() ? pasted.split("\n\n").map((s) => s.trim()).filter(Boolean) : undefined,
      documentType,
    });
    setLoading(false);
    if (res.success) {
      toast.success(`Generated ${res.data.clauses.length} clauses — review & edit before activating`);
      onGenerated(res.data.clauses as GenClause[]);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-xl border p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-primary" /> Generate first draft
          </h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="space-y-3">
          <Field label="Role / designation *">
            <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="e.g. Senior Software Engineer" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Industry">
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. SaaS" className={inputCls} />
            </Field>
            <Field label="Employment type">
              <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as any)} className={inputCls}>
                {EMPLOYMENT.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="State (India)">
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. Maharashtra" className={inputCls} />
          </Field>
          <Field label="Existing clauses to adapt (optional, blank line between each)">
            <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={3} className={inputCls} />
          </Field>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          AI output lands as an editable draft — nothing is activated automatically. Review every clause.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            {loading ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
