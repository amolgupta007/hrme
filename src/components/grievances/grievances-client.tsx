"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  MessageSquareWarning,
  Plus,
  Search,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Eye,
  Shield,
} from "lucide-react";
import {
  submitGrievance,
  updateGrievanceStatus,
  getGrievanceByToken,
} from "@/actions/grievances";
import type { GrievanceRecord, GrievanceStats } from "@/actions/grievances";

interface Props {
  grievances: GrievanceRecord[];
  stats: GrievanceStats | null;
  isManager: boolean;
  employeeId: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  facilities: "Facilities",
  environment: "Work Environment",
  interpersonal: "Interpersonal",
  safety: "Safety",
  policy: "Policy",
  suggestion: "Suggestion",
  other: "Other",
};

const SEVERITY_CONFIG: Record<string, { label: string; classes: string }> = {
  low: { label: "Low", classes: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", classes: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  high: { label: "High", classes: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  urgent: { label: "Urgent", classes: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
};

const STATUS_CONFIG: Record<string, { label: string; classes: string; icon: React.ReactNode }> = {
  open: { label: "Open", classes: "bg-primary/10 text-primary", icon: <Clock className="h-3 w-3" /> },
  in_review: { label: "In Review", classes: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", icon: <Eye className="h-3 w-3" /> },
  resolved: { label: "Resolved", classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", icon: <CheckCircle2 className="h-3 w-3" /> },
  closed: { label: "Closed", classes: "bg-muted text-muted-foreground", icon: <X className="h-3 w-3" /> },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ---- Submit Form ----
function SubmitForm({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: "complaint" as "complaint" | "suggestion",
    category: "facilities" as GrievanceRecord["category"],
    severity: "low" as GrievanceRecord["severity"],
    title: "",
    description: "",
    is_anonymous: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await submitGrievance(form);
      if (result.success) {
        onSuccess(result.data.tracking_token);
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type */}
      <div className="flex gap-2">
        {(["complaint", "suggestion"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setForm((f) => ({ ...f, type: t }))}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              form.type === t
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {t === "complaint" ? "Complaint / Issue" : "Suggestion / Idea"}
          </button>
        ))}
      </div>

      {/* Category + Severity */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
          <div className="relative">
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as GrievanceRecord["category"] }))}
              className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-8"
            >
              {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Urgency</label>
          <div className="relative">
            <select
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as GrievanceRecord["severity"] }))}
              className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-8"
            >
              <option value="low">Low — FYI</option>
              <option value="medium">Medium — Needs attention</option>
              <option value="high">High — Affecting work</option>
              <option value="urgent">Urgent — Immediate action</option>
            </select>
            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
        <input
          type="text"
          required
          minLength={5}
          maxLength={200}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Brief summary of the issue or suggestion"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Details</label>
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the issue in detail. Be as specific as possible — location, time, people involved (if comfortable), etc."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      </div>

      {/* Anonymity toggle */}
      <div className="flex items-center gap-3 rounded-lg bg-muted/40 border border-border px-4 py-3">
        <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Submit anonymously</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {form.is_anonymous
              ? "Your name will not be shared with anyone, including admins."
              : "Your name will be visible to admins."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_anonymous: !f.is_anonymous }))}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
            form.is_anonymous ? "bg-indigo-600" : "bg-muted"
          }`}
          role="switch"
          aria-checked={form.is_anonymous}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ${
              form.is_anonymous ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {loading ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}

// ---- Track Token Form ----
function TrackForm() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; title: string; admin_notes: string | null; updated_at: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setResult(null);
    setNotFound(false);
    try {
      const res = await getGrievanceByToken(token.trim());
      if (res.success) {
        setResult(res.data as any);
      } else {
        setNotFound(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleLookup} className="flex gap-2">
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value.toUpperCase())}
          placeholder="GRV-XXXXXX"
          maxLength={10}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={loading || !token.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? "…" : "Track"}
        </button>
      </form>

      {notFound && (
        <p className="text-sm text-destructive">Token not found. Double-check the code and try again.</p>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-sm font-semibold">{result.title}</p>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[result.status]?.classes}`}>
              {STATUS_CONFIG[result.status]?.icon}
              {STATUS_CONFIG[result.status]?.label}
            </span>
            <span className="text-xs text-muted-foreground">Last updated {formatDate(result.updated_at)}</span>
          </div>
          {result.admin_notes && (
            <div className="rounded-md bg-background border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Admin response</p>
              <p className="text-sm">{result.admin_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Detail Drawer ----
function GrievanceDetail({
  grievance,
  onClose,
  isManager,
}: {
  grievance: GrievanceRecord;
  onClose: () => void;
  isManager: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(grievance.status);
  const [notes, setNotes] = useState(grievance.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateGrievanceStatus(grievance.id, status, notes);
      if (result.success) {
        toast.success("Updated");
        router.refresh();
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CONFIG[grievance.severity]?.classes}`}>
                {SEVERITY_CONFIG[grievance.severity]?.label}
              </span>
              <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[grievance.category]}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground font-mono">{grievance.tracking_token}</span>
            </div>
            <h3 className="mt-2 font-semibold text-base">{grievance.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {grievance.is_anonymous ? "Anonymous" : grievance.employee_name ?? "Unknown"} · {formatDate(grievance.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-4">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-foreground whitespace-pre-wrap">{grievance.description}</p>

          {isManager && (
            <>
              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                  <div className="relative">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as GrievanceRecord["status"])}
                      className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-8"
                    >
                      <option value="open">Open</option>
                      <option value="in_review">In Review</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Admin Notes <span className="font-normal">(visible to submitter via tracking token)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional: leave a note for the submitter explaining what action was taken."
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Component ----
export function GrievancesClient({ grievances, stats, isManager, employeeId }: Props) {
  const [activeTab, setActiveTab] = useState<"submit" | "track" | "inbox">(isManager ? "inbox" : "submit");
  const [showForm, setShowForm] = useState(false);
  const [tokenSuccess, setTokenSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [selected, setSelected] = useState<GrievanceRecord | null>(null);

  const filtered = grievances.filter((g) => {
    if (filterStatus && g.status !== filterStatus) return false;
    if (filterSeverity && g.severity !== filterSeverity) return false;
    if (search && !g.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Grievances & Feedback</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isManager ? "Review and respond to team grievances and suggestions." : "Raise issues or suggestions anonymously. Your identity is protected."}
        </p>
      </div>

      {/* Stats (manager only) */}
      {isManager && stats && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Total", value: stats.total, color: "bg-muted/50", icon: <MessageSquareWarning className="h-4 w-4 text-muted-foreground" /> },
            { label: "Open", value: stats.open, color: "bg-primary/5", icon: <Clock className="h-4 w-4 text-primary" /> },
            { label: "In Review", value: stats.in_review, color: "bg-amber-50 dark:bg-amber-950/40", icon: <Eye className="h-4 w-4 text-amber-500" /> },
            { label: "Urgent", value: stats.urgent, color: "bg-red-50 dark:bg-red-950/40", icon: <AlertTriangle className="h-4 w-4 text-red-500" /> },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border border-border p-4 flex items-center gap-3 ${s.color}`}>
              {s.icon}
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {!isManager && (
          <>
            <button
              onClick={() => setActiveTab("submit")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "submit" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Submit
            </button>
            <button
              onClick={() => setActiveTab("track")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "track" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Track Status
            </button>
            <button
              onClick={() => setActiveTab("inbox")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "inbox" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              My Submissions
              {grievances.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                  {grievances.length}
                </span>
              )}
            </button>
          </>
        )}
        {isManager && (
          <>
            <button
              onClick={() => setActiveTab("inbox")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "inbox" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Inbox
            </button>
            <button
              onClick={() => setActiveTab("submit")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "submit" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Submit One
            </button>
            <button
              onClick={() => setActiveTab("track")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "track" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Track Token
            </button>
          </>
        )}
      </div>

      {/* Submit Tab */}
      {activeTab === "submit" && (
        <div className="rounded-xl border border-border bg-card p-6 max-w-xl">
          {tokenSuccess ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-lg">Submitted successfully</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your tracking token is below. Save it to check the status later.
                </p>
              </div>
              <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-4">
                <p className="text-xs text-muted-foreground mb-1">Your tracking token</p>
                <p className="text-2xl font-bold font-mono tracking-widest text-primary">{tokenSuccess}</p>
              </div>
              <button
                onClick={() => { setTokenSuccess(null); setActiveTab("track"); }}
                className="text-sm text-primary hover:underline"
              >
                Use this token to check status later
              </button>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="font-semibold">Raise an issue or suggestion</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  You&apos;ll receive a tracking token to follow up anonymously.
                </p>
              </div>
              <SubmitForm onSuccess={(token) => setTokenSuccess(token)} />
            </>
          )}
        </div>
      )}

      {/* Track Tab */}
      {activeTab === "track" && (
        <div className="rounded-xl border border-border bg-card p-6 max-w-md">
          <h2 className="font-semibold mb-1">Track your submission</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter the tracking token you received when you submitted.
          </p>
          <TrackForm />
        </div>
      )}

      {/* Inbox Tab */}
      {activeTab === "inbox" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-border">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_review">In Review</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All urgency</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            {!isManager && (
              <button
                onClick={() => setActiveTab("submit")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> New
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <MessageSquareWarning className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {grievances.length === 0 ? "No submissions yet." : "No results match your filters."}
              </p>
              {grievances.length === 0 && !isManager && (
                <p className="text-xs text-muted-foreground/80 mt-2 max-w-md mx-auto">
                  Submissions you raise without checking &ldquo;Submit anonymously&rdquo; will appear here.
                  Anonymous submissions can only be looked up via their tracking token in the{" "}
                  <button
                    type="button"
                    className="underline text-primary hover:no-underline"
                    onClick={() => setActiveTab("track")}
                  >
                    Track Status
                  </button>{" "}
                  tab.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelected(g)}
                  className="w-full text-left flex items-start justify-between px-5 py-4 hover:bg-muted/30 transition-colors gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[g.status]?.classes}`}>
                        {STATUS_CONFIG[g.status]?.icon}
                        {STATUS_CONFIG[g.status]?.label}
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CONFIG[g.severity]?.classes}`}>
                        {SEVERITY_CONFIG[g.severity]?.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[g.category]}</span>
                    </div>
                    <p className="text-sm font-medium truncate">{g.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {g.is_anonymous ? "Anonymous" : g.employee_name ?? "You"} · {formatDate(g.created_at)}
                    </p>
                  </div>
                  <Eye className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <GrievanceDetail
          grievance={selected}
          onClose={() => setSelected(null)}
          isManager={isManager}
        />
      )}
    </div>
  );
}
