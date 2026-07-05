"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { FileSignature, Plus, Pencil, Trash2, CheckCircle2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  setTemplateStatus,
  deleteTemplate,
  type TemplateSummary,
} from "@/actions/documents-templating";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  archived: "bg-gray-100 text-gray-500",
};

const TYPE_LABEL: Record<string, string> = {
  offer_letter: "Offer letter",
  nda: "NDA",
  policy: "Policy",
};

export function TemplatesClient({ initial }: { initial: TemplateSummary[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function activate(t: TemplateSummary) {
    setBusy(t.id);
    const res = await setTemplateStatus(t.id, "active");
    setBusy(null);
    if (res.success) {
      setRows((r) => r.map((x) => (x.id === t.id ? { ...x, status: "active" } : x)));
      toast.success("Template activated");
    } else toast.error(res.error);
  }

  async function archive(t: TemplateSummary) {
    setBusy(t.id);
    const res = await setTemplateStatus(t.id, "archived");
    setBusy(null);
    if (res.success) {
      setRows((r) => r.map((x) => (x.id === t.id ? { ...x, status: "archived" } : x)));
      toast.success("Template archived");
    } else toast.error(res.error);
  }

  async function remove(t: TemplateSummary) {
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    setBusy(t.id);
    const res = await deleteTemplate(t.id);
    setBusy(null);
    if (res.success) {
      setRows((r) => r.filter((x) => x.id !== t.id));
      toast.success("Template deleted");
    } else toast.error(res.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => router.push("/dashboard/documents/templates/new")}>
          <Plus className="h-4 w-4 mr-1.5" />
          New template
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <FileSignature className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold">No templates yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first offer letter template — start from scratch or let AI draft it.
          </p>
          <Button className="mt-4" onClick={() => router.push("/dashboard/documents/templates/new")}>
            <Plus className="h-4 w-4 mr-1.5" />
            New template
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/documents/templates/${t.id}`}
                  className="font-medium text-foreground hover:text-primary truncate block"
                >
                  {t.name}
                </Link>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span>{TYPE_LABEL[t.type] ?? t.type}</span>
                  <span>·</span>
                  <span>{t.clause_count} clause{t.clause_count === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>Updated {formatDate(t.updated_at)}</span>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[t.status]}`}>
                {t.status}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/dashboard/documents/templates/${t.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                {t.status === "draft" || t.status === "archived" ? (
                  <Button variant="ghost" size="sm" disabled={busy === t.id} onClick={() => activate(t)} title="Activate">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled={busy === t.id} onClick={() => archive(t)} title="Archive">
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={busy === t.id} onClick={() => remove(t)} title="Delete">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
