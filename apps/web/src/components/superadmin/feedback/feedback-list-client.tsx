"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bug, Sparkles, MessageCircle, FileText, ChevronRight } from "lucide-react";
import type { FeedbackReportWithContext } from "@/types";

const TYPE_ICON: Record<string, React.ReactNode> = {
  bug: <Bug className="h-4 w-4 text-red-500" />,
  feature_request: <Sparkles className="h-4 w-4 text-amber-500" />,
  feedback: <MessageCircle className="h-4 w-4 text-blue-500" />,
  other: <FileText className="h-4 w-4 text-muted-foreground" />,
};

const STATUS_OPTIONS = ["all", "new", "triaged", "in_progress", "resolved", "wontfix"];
const TYPE_OPTIONS = ["all", "bug", "feature_request", "feedback", "other"];
const SEVERITY_OPTIONS = ["all", "low", "medium", "high", "critical"];

export function FeedbackListClient({
  rows,
  error,
  filters,
}: {
  rows: FeedbackReportWithContext[];
  error: string | null;
  filters: { status: string; type: string; severity: string };
}) {
  const router = useRouter();

  function updateFilter(key: "status" | "type" | "severity", value: string) {
    const next = { ...filters, [key]: value };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v !== "all") params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `/superadmin/feedback?${qs}` : "/superadmin/feedback");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Feedback</h1>
            <p className="text-sm text-gray-500">{rows.length} report{rows.length === 1 ? "" : "s"}</p>
          </div>
          <Link href="/superadmin/dashboard" className="text-sm text-teal-700 hover:underline">
            ← Back to dashboard
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <FilterSelect label="Status" value={filters.status} options={STATUS_OPTIONS} onChange={(v) => updateFilter("status", v)} />
          <FilterSelect label="Type" value={filters.type} options={TYPE_OPTIONS} onChange={(v) => updateFilter("type", v)} />
          <FilterSelect label="Severity" value={filters.severity} options={SEVERITY_OPTIONS} onChange={(v) => updateFilter("severity", v)} />
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white py-12 text-center text-sm text-gray-500">No reports match these filters.</div>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/superadmin/feedback/${r.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                  <span>{TYPE_ICON[r.type]}</span>
                  {r.severity ? (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      r.severity === "critical" ? "bg-red-100 text-red-800" :
                      r.severity === "high" ? "bg-orange-100 text-orange-800" :
                      "bg-gray-100 text-gray-700"
                    }`}>{r.severity}</span>
                  ) : null}
                  <span className="text-xs text-gray-500 w-24 truncate">{r.org_slug ?? "—"}</span>
                  <span className="flex-1 truncate font-medium text-gray-900">{r.title}</span>
                  <span className="text-xs text-gray-500 w-20">{r.status.replace("_", " ")}</span>
                  <span className="text-xs text-gray-500 w-24">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-white px-2 py-1 text-sm"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt === "all" ? "All" : opt.replace("_", " ")}</option>
        ))}
      </select>
    </label>
  );
}
