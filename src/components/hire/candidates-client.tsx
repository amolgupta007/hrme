"use client";

import { useState } from "react";
import { Search, Users, Linkedin, Phone } from "lucide-react";
import type { Candidate, ApplicationStage } from "@/actions/hire";
import Link from "next/link";

const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview_1: "Interview 1",
  interview_2: "Interview 2",
  final_round: "Final Round",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

const STAGE_COLORS: Record<ApplicationStage, string> = {
  applied: "bg-gray-100 text-gray-600",
  screening: "bg-blue-100 text-blue-700",
  interview_1: "bg-violet-100 text-violet-700",
  interview_2: "bg-indigo-100 text-indigo-700",
  final_round: "bg-amber-100 text-amber-700",
  offer: "bg-emerald-100 text-emerald-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  referral: "Referral",
  linkedin: "LinkedIn",
  naukri: "Naukri",
  indeed: "Indeed",
  other: "Other",
};

type CandidateWithApps = Candidate & { applications: { job_title: string; stage: ApplicationStage }[] };

interface Props {
  candidates: CandidateWithApps[];
}

export function CandidatesClient({ candidates }: Props) {
  const [search, setSearch] = useState("");

  const filtered = candidates.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Candidates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{candidates.length} total</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/40 p-12 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No candidates yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Candidates appear here when they apply via the careers page or are added manually.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-indigo-100 bg-white overflow-hidden dark:border-indigo-900/40 dark:bg-[#150e2b]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Applications</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-50 dark:divide-indigo-900/30">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {c.phone && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </span>
                      )}
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
                          <Linkedin className="h-3 w-3" /> LinkedIn
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {SOURCE_LABELS[c.source] ?? c.source}
                  </td>
                  <td className="px-4 py-3">
                    {c.applications.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-1">
                        {c.applications.map((app, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs truncate max-w-[120px]">{app.job_title}</span>
                            <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${STAGE_COLORS[app.stage]}`}>
                              {STAGE_LABELS[app.stage]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
