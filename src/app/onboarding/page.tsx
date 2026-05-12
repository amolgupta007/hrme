"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useOrganizationList } from "@clerk/nextjs";
import { Building2, Users, ArrowRight, ArrowLeft, Mail, LogOut } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { syncOrgToSupabase } from "@/actions/organizations";
import { LATEST_POLICY_VERSION } from "@/config/legal";

type Mode = "choose" | "create" | "joining";

const companySizes = [
  { label: "1–10", value: "1-10" },
  { label: "11–50", value: "11-50" },
  { label: "51–200", value: "51-200" },
  { label: "201–500", value: "201-500" },
];

const industries = [
  "Technology",
  "Healthcare",
  "Finance",
  "Education",
  "Manufacturing",
  "Retail",
  "Services",
  "Other",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { createOrganization, setActive } = useOrganizationList();
  const { signOut } = useClerk();
  const [mode, setMode] = useState<Mode>("choose");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    companySize: "",
    industry: "",
  });

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: "/sign-in" });
    } catch (error: any) {
      toast.error(error?.message ?? "Could not sign out. Please try again.");
      setSigningOut(false);
    }
  };

  const handleSubmit = async () => {
    if (!createOrganization || !setActive) {
      toast.error("Organization features not available. Please refresh.");
      return;
    }

    if (!accepted) {
      toast.error("Please accept the Privacy Policy and Terms of Service.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create org in Clerk
      const org = await createOrganization({ name: form.companyName });

      // 2. Set as active org so auth().orgId is available in server actions
      await setActive({ organization: org.id });

      // 3. Sync to Supabase
      const now = new Date().toISOString();
      const result = await syncOrgToSupabase({
        clerkOrgId: org.id,
        name: form.companyName,
        privacyAcceptedAt: now,
        termsAcceptedAt: now,
        policyVersionAccepted: LATEST_POLICY_VERSION,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      window.location.href = "/dashboard";
    } catch (error: any) {
      toast.error(error?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-lg">
        {/* Progress (only in create mode) */}
        {mode === "create" && (
          <div className="mb-8 flex items-center justify-center gap-2">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-2 w-16 rounded-full transition-colors ${
                  s <= step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          {mode === "choose" && (
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight">
                  Welcome to JambaHR
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Are you setting up HR for your company, or joining one?
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setMode("create")}
                  className="group flex w-full items-start gap-4 rounded-xl border-2 border-border p-5 text-left transition-all hover:border-primary hover:bg-primary/5"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">I&apos;m setting up HR for my company</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Create a new workspace and invite your team.
                    </div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>

                <button
                  onClick={() => setMode("joining")}
                  className="group flex w-full items-start gap-4 rounded-xl border-2 border-border p-5 text-left transition-all hover:border-primary hover:bg-primary/5"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">I&apos;m joining an existing company</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Your admin will send you an invite link by email.
                    </div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              </div>
            </div>
          )}

          {mode === "joining" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Ask your admin for an invite
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Employees can&apos;t self-join an existing JambaHR workspace.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p>
                  Ask your HR admin to invite you from{" "}
                  <span className="font-medium text-foreground">
                    Settings → Employees → Invite Employee
                  </span>{" "}
                  inside JambaHR. They&apos;ll send an invite link to your
                  work email.
                </p>
                <p>
                  Click that link from your email and sign in with the same
                  address — you&apos;ll be added to their workspace
                  automatically.
                </p>
                <p className="text-xs">
                  Already signed up with the wrong email? Sign out below and
                  come back via the invite link.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setMode("choose")}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogOut className="h-4 w-4" />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          )}

          {mode === "create" && step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Set up your company
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Tell us about your organization to get started.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) =>
                      setForm({ ...form, companyName: e.target.value })
                    }
                    placeholder="Acme Inc."
                    className="h-11 w-full rounded-lg border border-input bg-background px-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Industry
                  </label>
                  <select
                    value={form.industry}
                    onChange={(e) =>
                      setForm({ ...form, industry: e.target.value })
                    }
                    className="h-11 w-full rounded-lg border border-input bg-background px-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select industry</option>
                    {industries.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setMode("choose")}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!form.companyName || !form.industry}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {mode === "create" && step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                  How big is your team?
                </h1>
                <p className="mt-2 text-muted-foreground">
                  This helps us tailor the experience for you.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {companySizes.map((size) => (
                  <button
                    key={size.value}
                    onClick={() =>
                      setForm({ ...form, companySize: size.value })
                    }
                    className={`rounded-lg border-2 p-4 text-center text-sm font-medium transition-all ${
                      form.companySize === size.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    {size.label} employees
                  </button>
                ))}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                />
                <span className="text-muted-foreground">
                  I agree to the{" "}
                  <Link href="/privacy" target="_blank" className="text-primary underline-offset-4 hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/terms" target="_blank" className="text-primary underline-offset-4 hover:underline">
                    Terms of Service
                  </Link>
                  .
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex h-11 flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!form.companySize || !accepted || loading}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Setting up..." : "Launch JambaHR"}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
