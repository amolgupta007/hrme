"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, ChevronRight, Send, Loader2, ArrowLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownView } from "@/components/documents/markdown-view";
import {
  previewIssuance,
  issueAndSend,
  type IssuanceContext,
  type IssuancePreviewRow,
} from "@/actions/documents-templating";

export function IssuanceWizard({ ctx }: { ctx: IssuanceContext }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templateId, setTemplateId] = useState(ctx.templates[0]?.id ?? "");
  const [entityId, setEntityId] = useState(ctx.issuingEntities[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<IssuancePreviewRow[]>([]);
  const [loading, setLoading] = useState(false);

  if (ctx.templates.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <h3 className="font-semibold">No active templates</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Create and activate a template first, then come back to issue it.
        </p>
      </div>
    );
  }

  const filtered = ctx.employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.designation ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function goPreview() {
    if (!selected.size) { toast.error("Select at least one employee"); return; }
    setLoading(true);
    const res = await previewIssuance({
      templateId,
      employeeIds: [...selected],
      issuingEntityId: entityId,
    });
    setLoading(false);
    if (!res.success) { toast.error(res.error); return; }
    setRows(res.data);
    setStep(3);
  }

  function editValue(employeeId: string, key: string, value: string) {
    setRows((rs) => rs.map((r) => (r.employee_id === employeeId ? { ...r, values: { ...r.values, [key]: value } } : r)));
  }

  async function send() {
    setLoading(true);
    const overrides: Record<string, Record<string, string>> = {};
    for (const r of rows) overrides[r.employee_id] = r.values;
    const res = await issueAndSend({
      templateId,
      employeeIds: rows.map((r) => r.employee_id),
      issuingEntityId: entityId,
      overrides,
    });
    setLoading(false);
    if (res.success) {
      toast.success(`Sent ${res.data.sent} document${res.data.sent === 1 ? "" : "s"}`);
      router.push("/dashboard/documents/signed");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-5">
      <Stepper step={step} />

      {step === 1 && (
        <div className="space-y-4 max-w-lg">
          <Labeled label="Template">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={selectCls}>
              {ctx.templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Labeled>
          <Labeled label="Issuing entity">
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className={selectCls}>
              {ctx.issuingEntities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            {ctx.issuingEntities.length > 1 && (
              <p className="text-xs text-muted-foreground mt-1">
                Your organisation is part of a company group — choose which entity issues this document.
              </p>
            )}
          </Labeled>
          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!templateId || !entityId}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="rounded-xl border border-border divide-y divide-border max-h-[50vh] overflow-y-auto">
            {filtered.map((e) => (
              <label key={e.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer">
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{e.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.designation ?? "—"}{e.email ? ` · ${e.email}` : ""}</p>
                </div>
              </label>
            ))}
            {filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground text-center">No employees found.</p>}
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{selected.size} selected</span>
              <Button onClick={goPreview} disabled={loading || selected.size === 0}>
                {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Preview
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Review each document. Missing values show as <code className="text-xs bg-muted px-1 rounded">[variable]</code> — fill them in before sending.
          </p>
          {rows.map((r) => (
            <PreviewCard key={r.employee_id} row={r} onEdit={editValue} />
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            <Button onClick={send} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Send {rows.length} document{rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewCard({
  row,
  onEdit,
}: {
  row: IssuancePreviewRow;
  onEdit: (employeeId: string, key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between p-4">
        <p className="font-medium">{row.employee_name || "(unnamed)"}</p>
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          {open ? "Hide" : "Review"} <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-border p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(row.values).map(([k, v]) => (
              <div key={k}>
                <label className="text-[11px] text-muted-foreground">{k}</label>
                <input
                  value={v}
                  onChange={(e) => onEdit(row.employee_id, k, e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4 max-h-72 overflow-y-auto">
            {row.clauses.map((c, i) => (
              <section key={i} className="mb-3">
                <h4 className="text-sm font-bold mb-0.5">{c.title}</h4>
                <MarkdownView markdown={applyValues(c.body_markdown, row.values)} />
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Re-apply edited values live in the preview (server re-renders authoritatively on send).
function applyValues(md: string, values: Record<string, string>): string {
  return md.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_f, k: string) => values[k] || `[${k}]`);
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Template", "Recipients", "Review & send"];
  return (
    <div className="flex items-center gap-2 text-sm">
      {labels.map((l, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = step === n;
        const done = step > n;
        return (
          <div key={l} className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
            }`}>{n}</div>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{l}</span>
            {i < labels.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

const selectCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
