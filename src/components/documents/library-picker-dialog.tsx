"use client";

import { useMemo, useState } from "react";
import { BookOpen, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LibraryClause } from "@/actions/documents-templating";

const CATEGORY_LABEL: Record<string, string> = {
  behavior: "Behavior",
  compliance: "Compliance",
  confidentiality: "Confidentiality",
  comp: "Compensation",
  custom: "Custom",
};

export function LibraryPickerDialog({
  open,
  library,
  onClose,
  onPick,
}: {
  open: boolean;
  library: LibraryClause[];
  onClose: () => void;
  onPick: (items: LibraryClause[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const g: Record<string, LibraryClause[]> = {};
    for (const c of library) {
      (g[c.category] ??= []).push(c);
    }
    return g;
  }, [library]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function add() {
    const items = library.filter((c) => selected.has(c.id));
    onPick(items);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-card shadow-xl border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="h-5 w-5 text-primary" /> Clause library
          </h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {library.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No clauses in the library yet.</p>
          )}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {CATEGORY_LABEL[cat] ?? cat}
              </h3>
              <div className="space-y-2">
                {items.map((c) => {
                  const isSel = selected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      className={`w-full text-left rounded-xl border p-3 transition ${
                        isSel ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSel ? "bg-primary border-primary" : "border-input"}`}>
                          {isSel && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{c.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.body_markdown}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={add} disabled={selected.size === 0}>Add {selected.size || ""} clause{selected.size === 1 ? "" : "s"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
