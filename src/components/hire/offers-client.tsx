"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, FileText, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createOffer, sendOffer } from "@/actions/hire";
import type { Offer, Application } from "@/actions/hire";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  accepted: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  declined: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  expired: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
};

const STATUS_ICON: Record<string, any> = {
  draft: FileText,
  sent: Send,
  accepted: CheckCircle2,
  declined: XCircle,
  expired: Clock,
};

interface Department { id: string; name: string; }
interface Employee { id: string; first_name: string; last_name: string; }

interface Props {
  offers: Offer[];
  applications: Application[];
  departments: Department[];
  employees: Employee[];
  isAdmin: boolean;
}

type Tab = "all" | "draft" | "sent" | "accepted" | "declined";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

interface CreateOfferForm {
  application_id: string;
  role_title: string;
  ctc: string;
  joining_date: string;
  department_id: string;
  reporting_manager_id: string;
  additional_terms: string;
}

export function OffersClient({ offers, applications, departments, employees, isAdmin }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateOfferForm>({
    application_id: "",
    role_title: "",
    ctc: "",
    joining_date: "",
    department_id: "",
    reporting_manager_id: "",
    additional_terms: "",
  });

  const displayed = tab === "all" ? offers : offers.filter((o) => o.status === tab);

  function setField(key: keyof CreateOfferForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreate() {
    if (!form.application_id) return toast.error("Select a candidate");
    if (!form.role_title.trim()) return toast.error("Enter role title");
    if (!form.ctc || isNaN(Number(form.ctc))) return toast.error("Enter valid CTC");
    if (!form.joining_date) return toast.error("Select joining date");

    setSaving(true);
    const result = await createOffer({
      application_id: form.application_id,
      role_title: form.role_title.trim(),
      ctc: Number(form.ctc),
      joining_date: form.joining_date,
      department_id: form.department_id || undefined,
      reporting_manager_id: form.reporting_manager_id || undefined,
      additional_terms: form.additional_terms || undefined,
    });
    setSaving(false);

    if (result.success) {
      toast.success("Offer created");
      setCreateOpen(false);
      setForm({ application_id: "", role_title: "", ctc: "", joining_date: "", department_id: "", reporting_manager_id: "", additional_terms: "" });
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleSend(offerId: string) {
    setSending(offerId);
    const result = await sendOffer(offerId);
    setSending(null);
    if (result.success) {
      toast.success("Offer sent to candidate");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Offers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{offers.length} total · {offers.filter((o) => o.status === "sent").length} pending response</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Create Offer
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-indigo-100 dark:border-indigo-900/40">
        {TABS.map((t) => {
          const count = t.key === "all" ? offers.length : offers.filter((o) => o.status === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label} <span className="ml-1 text-xs text-muted-foreground">({count})</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/40 p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No {tab === "all" ? "" : tab} offers</p>
          {isAdmin && tab === "all" && (
            <p className="text-xs text-muted-foreground mt-1">Click &quot;Create Offer&quot; to make one.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((offer) => {
            const StatusIcon = STATUS_ICON[offer.status] ?? FileText;
            return (
              <div key={offer.id} className="rounded-xl border border-indigo-100 bg-white p-5 dark:border-indigo-900/40 dark:bg-[#150e2b] space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{offer.candidate_name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium flex items-center gap-1 ${STATUS_COLORS[offer.status]}`}>
                        <StatusIcon className="h-3 w-3" />
                        {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{offer.role_title} · {offer.job_title}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <p className="font-semibold text-foreground text-sm">₹{(offer.ctc / 100000).toFixed(1)} LPA</p>
                    <p>Joining: {new Date(offer.joining_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  {offer.department_name && <span>Dept: {offer.department_name}</span>}
                  {offer.reporting_manager_name && <span>Reports to: {offer.reporting_manager_name}</span>}
                  {offer.sent_at && <span>Sent: {new Date(offer.sent_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                  {offer.responded_at && <span>Responded: {new Date(offer.responded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                  <span className="text-muted-foreground/60">· {offer.candidate_email}</span>
                </div>

                {offer.response_note && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium">Candidate note:</span> {offer.response_note}
                  </div>
                )}

                {offer.additional_terms && (
                  <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium">Terms:</span> {offer.additional_terms}
                  </div>
                )}

                {isAdmin && offer.status === "draft" && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleSend(offer.id)}
                      disabled={sending === offer.id}
                      className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      <Send className="h-3 w-3" />
                      {sending === offer.id ? "Sending…" : "Send Offer"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Offer Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#150e2b] p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold">Create Offer Letter</h2>

            <div>
              <label className="text-sm font-medium">Candidate *</label>
              <select className={inputCls} value={form.application_id} onChange={(e) => setField("application_id", e.target.value)}>
                <option value="">Select candidate…</option>
                {applications.filter((a) => a.stage !== "hired" && a.stage !== "rejected").map((a) => (
                  <option key={a.id} value={a.id}>{a.candidate_name} — {a.job_title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Role Title *</label>
              <input className={inputCls} placeholder="e.g. Senior Software Engineer" value={form.role_title} onChange={(e) => setField("role_title", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">CTC (₹/year) *</label>
                <input type="number" className={inputCls} placeholder="e.g. 1200000" value={form.ctc} onChange={(e) => setField("ctc", e.target.value)} />
                {form.ctc && !isNaN(Number(form.ctc)) && Number(form.ctc) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">= ₹{(Number(form.ctc) / 100000).toFixed(2)} LPA</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Joining Date *</label>
                <input type="date" className={inputCls} value={form.joining_date} onChange={(e) => setField("joining_date", e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Department</label>
              <select className={inputCls} value={form.department_id} onChange={(e) => setField("department_id", e.target.value)}>
                <option value="">Select department…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Reporting Manager</label>
              <select className={inputCls} value={form.reporting_manager_id} onChange={(e) => setField("reporting_manager_id", e.target.value)}>
                <option value="">Select manager…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Additional Terms / Notes</label>
              <textarea
                className={`${inputCls} min-h-[80px] resize-none`}
                placeholder="Equity, signing bonus, work-from-home policy, other conditions…"
                value={form.additional_terms}
                onChange={(e) => setField("additional_terms", e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {saving ? "Creating…" : "Create Offer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
