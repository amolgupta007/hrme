"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, Database, Shield, ExternalLink } from "lucide-react";
import { toggleAssistant, toggleAssistantTenantDocs } from "@/actions/settings";

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled ? "bg-primary" : "bg-muted"
      }`}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

type ScopeStatus = "always-on" | "coming-soon" | "available";

function ScopeRow({
  icon,
  title,
  description,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: ScopeStatus;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          {status === "always-on" && (
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-400">
              Always on
            </span>
          )}
          {status === "coming-soon" && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              Coming soon
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function AssistantSettingsSection({
  assistantEnabled,
  tenantDocsEnabled,
  isAdmin,
}: {
  assistantEnabled: boolean;
  tenantDocsEnabled: boolean;
  isAdmin: boolean;
}) {
  const [enabled, setEnabled] = useState(assistantEnabled);
  const [docsEnabled, setDocsEnabled] = useState(tenantDocsEnabled);
  const [loading, setLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    if (!isAdmin) return;
    setLoading(true);
    const next = !enabled;
    try {
      const result = await toggleAssistant(next);
      if (result.success) {
        setEnabled(next);
        toast.success(next ? "AI Assistant enabled" : "AI Assistant disabled");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDocsToggle() {
    if (!isAdmin) return;
    setDocsLoading(true);
    const next = !docsEnabled;
    try {
      const result = await toggleAssistantTenantDocs(next);
      if (result.success) {
        setDocsEnabled(next);
        toast.success(
          next
            ? "Document Q&A enabled — company-wide docs are now searchable"
            : "Document Q&A disabled"
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setDocsLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-1">AI Assistant</h2>
      <p className="text-sm text-muted-foreground mb-5">
        A floating chat button on the dashboard. Employees ask how to use JambaHR and get
        step-by-step answers with deep links to the right page.
      </p>

      <div className="space-y-4">
        {/* Master toggle */}
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950">
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Chat assistant</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Show the floating chat button on the dashboard. Admin-only setting.
              </p>
            </div>
          </div>
          <Toggle enabled={enabled} onChange={handleToggle} disabled={loading || !isAdmin} />
        </div>

        {/* Scope rows */}
        {enabled && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What can the assistant access?
            </p>
            <ScopeRow
              icon={<Sparkles className="h-4 w-4" />}
              title="JambaHR help articles"
              description="How-to guides for using the app. Contains no tenant data — same content for every customer."
              status="always-on"
            />
            {/* Tenant documents — real toggle (Phase 2) */}
            <div className="flex items-start gap-3 rounded-md border border-border p-3">
              <div className="mt-0.5 text-muted-foreground">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Your uploaded documents</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Company-wide policies, handbooks, and circulars you&apos;ve uploaded. When on,
                  the assistant can answer questions from their contents and cite the source.
                  Personal documents (contracts, ID proofs, payslips) are never searched.
                </p>
              </div>
              <Toggle
                enabled={docsEnabled}
                onChange={handleDocsToggle}
                disabled={docsLoading || !isAdmin}
              />
            </div>
            <ScopeRow
              icon={<Database className="h-4 w-4" />}
              title="Your HR data"
              description="Employees, leave balances, attendance, payroll. You'll choose whether to enable this and who can ask."
              status="coming-soon"
            />
          </div>
        )}

        {/* Privacy blurb */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Privacy & data handling</p>
          </div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Where your data lives:</strong> conversations
              are stored in your private Supabase database (same as the rest of JambaHR), with
              90-day retention (14 days raw, then PII-redacted, then hard-deleted).
            </p>
            <p>
              <strong className="text-foreground">What leaves your DB today:</strong> only the
              text you type into the chat. It goes to Voyage AI (for semantic search over
              JambaHR&apos;s help library) and Anthropic Claude via Vercel AI Gateway (for the
              reply). Both providers operate under Zero Data Retention — your inputs are never
              used for model training and are not retained beyond the request.
            </p>
            <p>
              <strong className="text-foreground">What does NOT leave your DB today:</strong>{" "}
              employee records, leave, payroll, attendance, your uploaded documents — none of it.
              The current assistant only knows how to use the app; it has no tools to read your
              tenant data.
            </p>
            <p>
              <strong className="text-foreground">Future scopes:</strong> when we add tenant
              document Q&amp;A and structured HR data tools, you&apos;ll get a toggle here for
              each — opt in only what you want.
            </p>
          </div>
          <a
            href="/privacy"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Full privacy policy <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
