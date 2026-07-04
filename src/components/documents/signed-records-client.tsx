"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, ShieldCheck, FileText, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  getSignedRecordDownloadUrl,
  getDraftPreviewUrl,
  type SignedRecordRow,
  type IssuedRow,
} from "@/actions/documents-templating";

const ISSUED_STATUS_STYLE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-indigo-100 text-indigo-700",
  acknowledged: "bg-emerald-100 text-emerald-700",
  declined: "bg-rose-100 text-rose-700",
};

const METHOD_LABEL: Record<string, string> = {
  typed_ack: "Typed acknowledgement",
  aadhaar_esign: "Aadhaar eSign",
  dsc: "DSC",
};

export function SignedRecordsClient({ signed, issued }: { signed: SignedRecordRow[]; issued: IssuedRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<string>("");

  const entities = Array.from(new Set(signed.map((s) => s.entity_name).filter(Boolean)));
  const filteredSigned = entityFilter ? signed.filter((s) => s.entity_name === entityFilter) : signed;

  async function download(id: string) {
    setBusy(id);
    const res = await getSignedRecordDownloadUrl(id);
    setBusy(null);
    if (res.success) window.open(res.data.url, "_blank");
    else toast.error(res.error);
  }

  async function previewDraft(id: string) {
    setBusy(id);
    const res = await getDraftPreviewUrl(id);
    setBusy(null);
    if (res.success) window.open(res.data.url, "_blank");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-8">
      {/* Issued tracking */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
          <FileText className="h-4 w-4 text-muted-foreground" /> Issued documents
        </h2>
        {issued.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border py-8 text-center">
            No documents issued yet.
          </p>
        ) : (
          <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {issued.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.employee_name || "(unnamed)"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.template_name} · {r.entity_name} · {r.sent_at ? `Sent ${formatDate(r.sent_at)}` : `Created ${formatDate(r.created_at)}`}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ISSUED_STATUS_STYLE[r.status] ?? "bg-muted"}`}>
                  {r.status}
                </span>
                <Button variant="ghost" size="sm" disabled={busy === r.id} onClick={() => previewDraft(r.id)} title="Preview draft PDF">
                  <FileText className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Signed records */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Signed records
            <span className="text-xs font-normal text-muted-foreground">(append-only audit)</span>
          </h2>
          {entities.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                <option value="">All entities</option>
                {entities.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {filteredSigned.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border py-8 text-center">
            No signed records yet. They appear here once employees acknowledge issued documents.
          </p>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Employee</th>
                  <th className="text-left font-medium px-4 py-2.5">Entity</th>
                  <th className="text-left font-medium px-4 py-2.5">Template</th>
                  <th className="text-left font-medium px-4 py-2.5">Acknowledged</th>
                  <th className="text-left font-medium px-4 py-2.5">Method</th>
                  <th className="text-right font-medium px-4 py-2.5">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSigned.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{r.employee_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.entity_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.template_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground" title={r.signer_ip ? `IP: ${r.signer_ip}` : undefined}>
                      {formatDateTime(r.acknowledged_at)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{METHOD_LABEL[r.signature_method] ?? r.signature_method}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" disabled={busy === r.id} onClick={() => download(r.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
