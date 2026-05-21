import { redirect } from "next/navigation";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { getAssistantAdminData } from "@/lib/assistant/assistant-admin-data";
import type { AssistantAdminData } from "@/lib/assistant/assistant-admin-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "JambaHR Admin — AI Assistant" };

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-gray-500">{sub}</p>}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
      {label}
    </p>
  );
}

function OrgTable({ orgs }: { orgs: AssistantAdminData["orgs"] }) {
  if (orgs.length === 0) return <EmptyState label="No usage yet" />;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Convos</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Messages</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Users</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Input tok</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Output tok</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Est cost</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Month used / cap</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.orgId} className="border-b border-border last:border-0 hover:bg-muted/20">
              <td className="px-4 py-3 font-medium text-foreground">{org.orgName}</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">{org.conversations}</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">{org.messages}</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">{org.uniqueUsers}</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {org.inputTokens.toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {org.outputTokens.toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                ₹{org.estCostInr.toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                ₹{org.monthUsedInr.toLocaleString("en-IN")}
                {org.monthCapInr != null ? (
                  <span className="text-muted-foreground">
                    {" "}/ ₹{org.monthCapInr.toLocaleString("en-IN")}
                  </span>
                ) : (
                  <span className="text-muted-foreground"> / —</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ToolTable({ tools }: { tools: AssistantAdminData["tools"] }) {
  if (tools.length === 0) return <EmptyState label="No tool calls yet" />;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tool</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Calls</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">OK rate</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avg latency</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.toolName} className="border-b border-border last:border-0 hover:bg-muted/20">
              <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{t.toolName}</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">{t.calls}</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                <span
                  className={
                    t.okRate >= 90
                      ? "text-green-600"
                      : t.okRate >= 70
                        ? "text-yellow-600"
                        : "text-red-600"
                  }
                >
                  {t.okRate}%
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {t.avgLatencyMs.toLocaleString("en-IN")} ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeedbackSection({ feedback }: { feedback: AssistantAdminData["feedback"] }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Thumbs up</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">{feedback.up}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Thumbs down</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{feedback.down}</p>
        </div>
      </div>

      {feedback.recentDownComments.length > 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <p className="text-sm font-medium text-foreground">
              Recent negative comments ({feedback.recentDownComments.length})
            </p>
          </div>
          <ul className="divide-y divide-border">
            {feedback.recentDownComments.map((c, i) => (
              <li key={i} className="px-5 py-3">
                <p className="text-sm text-foreground">{c.comment}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState label="No negative comments yet" />
      )}
    </div>
  );
}

export default async function SuperadminAssistantPage() {
  if (!isSuperadminAuthenticated()) redirect("/superadmin/login");

  let data: AssistantAdminData = {
    orgs: [],
    tools: [],
    feedback: { up: 0, down: 0, recentDownComments: [] },
    totals: { messages: 0, estCostInr: 0, up: 0, down: 0 },
  };

  try {
    data = await getAssistantAdminData();
  } catch {
    // render with empty state rather than crash
  }

  const { orgs, tools, feedback, totals } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">AI Assistant Analytics</h1>
            <p className="text-sm text-gray-500">
              Founder-only · Last 30 days · Aggregates only — no conversation content
            </p>
          </div>
          <a href="/superadmin/dashboard" className="text-sm text-teal-700 hover:underline">
            ← Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-6 py-8">
        {/* Summary stats */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Last 30 days — all orgs
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total messages" value={totals.messages.toLocaleString("en-IN")} />
            <StatCard
              label="Est. cost (30d)"
              value={`₹${totals.estCostInr.toLocaleString("en-IN")}`}
            />
            <StatCard label="Thumbs up" value={totals.up.toLocaleString("en-IN")} />
            <StatCard label="Thumbs down" value={totals.down.toLocaleString("en-IN")} />
          </div>
        </section>

        {/* Org usage */}
        <section>
          <SectionHeading
            title="Usage by Org"
            sub="Messages, unique users, token usage, and cost per org in the last 30 days."
          />
          <OrgTable orgs={orgs} />
        </section>

        {/* Tool usage */}
        <section>
          <SectionHeading
            title="Tool Usage"
            sub="Calls, success rate, and average latency per tool in the last 30 days."
          />
          <ToolTable tools={tools} />
        </section>

        {/* Feedback */}
        <section>
          <SectionHeading
            title="Assistant Feedback"
            sub="Thumbs up/down ratings and recent negative comments left by users."
          />
          <FeedbackSection feedback={feedback} />
        </section>
      </main>
    </div>
  );
}
