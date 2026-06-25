import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { AnimateIn } from "@/components/ui/animate-in";
import { CookieSettingsButton } from "@/components/layout/cookie-settings-button";

export const metadata: Metadata = {
  title: "Contractor Management & Payouts for Agencies | JambaHR",
  description:
    "Onboard freelancers, auto-deduct the right TDS (194J / 194C), send signed NDAs & IP-assignment agreements, and pay contractors from your own RazorpayX wallet — all in one platform. Built for Indian firms hiring creative and contract talent.",
  alternates: { canonical: "https://jambahr.com/contractors" },
  openGraph: {
    title: "Contractor Management & Payouts for Agencies | JambaHR",
    description:
      "Stop running contractors on WhatsApp and spreadsheets. Engagements, auto-TDS, e-signed agreements, IP ownership, and bank-verified payouts — formalised.",
    url: "https://jambahr.com/contractors",
    type: "website",
  },
};

/** The mess a firm lives in before any formalisation. */
const problems = [
  {
    icon: "🤝",
    title: "Hired on a handshake",
    text: "Freelancers start work with no signed contract, no NDA, and no clarity on who owns the output.",
  },
  {
    icon: "🧮",
    title: "TDS by guesswork",
    text: "Is it 194J or 194C? 1%, 2%, or 10%? No PAN? Wrong deductions become your liability at assessment time.",
  },
  {
    icon: "🏦",
    title: "Manual bank transfers",
    text: "Payouts pushed one-by-one from a personal banking app, with no record of who approved what.",
  },
  {
    icon: "🧾",
    title: "No paper trail",
    text: "Rates live in chat threads, payments in bank SMS. Nothing to show an auditor, a client, or a contractor.",
  },
  {
    icon: "🥣",
    title: "Mixed into payroll",
    text: "Contractors stuffed into the salary sheet — accidentally taxed for PF/PT, or accruing leave they should never get.",
  },
  {
    icon: "©️",
    title: "IP ownership unclear",
    text: "Who owns the design, the edit, the script? Work-for-hire vs licensed is never written down — until a dispute.",
  },
];

/** How the firm operates once it is on JambaHR. */
const afters = [
  "Every contractor has a signed engagement with a stated rate and TDS section.",
  "TDS is computed and deducted automatically — what you preview is what's deducted.",
  "Payouts move from your own RazorpayX wallet with a two-person approval.",
  "NDAs and IP-assignment agreements are e-signed and timestamped before the first payment.",
  "Contractors are fully separated from salaried payroll — no PF, no PT, no leave.",
  "Every rate, payout, and signature is on record and exportable.",
];

/** The core capability cards (brief guide of each tool). */
const capabilities = [
  {
    icon: "👤",
    title: "Contractors as a real worker type",
    text: "Set Employment type = Contract and JambaHR routes that person out of salaried payroll automatically. They don't accrue leave, never hit a PF/PT slab, and get a deliberately narrowed self-service view — just profile, bank details, and payout statements.",
  },
  {
    icon: "📑",
    title: "Engagements & rates",
    text: "Each contractor gets one active engagement: rate type (hourly / daily / monthly / per-milestone), rate amount, TDS section, payee type, PAN status, and contract dates. It's the contractor's pay profile — the single source of truth for how they're paid.",
  },
  {
    icon: "🧮",
    title: "Automatic TDS (194J / 194C)",
    text: "You pick the section; JambaHR knows the rates, thresholds, and the no-PAN §206AA penalty rate. A live preview shows gross, rate, TDS, and net per contractor before you submit — no manual tax math, no surprises.",
  },
  {
    icon: "🔐",
    title: "Bank-verified, two-person payouts",
    text: "Every account is penny-drop verified (₹1 + name match) before it can be paid. Payouts dispatch from your own RazorpayX wallet via IMPS, and maker-checker means a second admin approves before money moves. JambaHR never holds your funds.",
  },
  {
    icon: "✍️",
    title: "Agreements, NDA & IP e-signing",
    text: "Send a Service agreement, NDA, or IP-assignment doc as a magic link — no login for the contractor. They type their legal name to sign; JambaHR records the signature, IP address, browser, and timestamp as proof. Choose work-for-hire or licensed IP per agreement.",
  },
  {
    icon: "🧱",
    title: "Cleanly separated from payroll",
    text: "Contractors are paid in their own ad-hoc runs, never the monthly salary cycle. No PF, no Professional Tax, no salary-slab TDS, no Form-16 salary math — but the same secure rails (verification, RazorpayX, approval) your salaried payroll uses.",
  },
];

/** Brief step-by-step guides. */
const guides = [
  {
    label: "Onboard a contractor",
    steps: [
      "Employees → Add (or edit) and set Employment type = Contract.",
      "Add their bank account and run penny-drop verification.",
      "They appear on the Contractors page with a Bank verified chip.",
    ],
  },
  {
    label: "Set up an engagement",
    steps: [
      "Contractors → Add engagement, pick the contractor.",
      "Choose rate type & amount, TDS section (194J / 194C), payee type, and PAN status.",
      "Add contract start / end / renewal dates if you have them.",
    ],
  },
  {
    label: "Pay with auto-TDS",
    steps: [
      "Contractors → Pay contractors, select who to pay.",
      "Type each gross amount — a live TDS preview shows net pay per row.",
      "Submit, then a second admin approves the batch to dispatch via RazorpayX.",
    ],
  },
  {
    label: "Send & sign an agreement",
    steps: [
      "On an engagement, click Send agreement; pick type and IP ownership.",
      "Edit the auto-generated body if needed, set an expiry, and Send.",
      "Contractor opens the link, types their name to sign — status chips update live.",
    ],
  },
];

const tdsRows = [
  { section: "194J", use: "Professional / technical / creative fees", rate: "10%", threshold: "≤ ₹30,000 per payment" },
  { section: "194C", use: "Contract work — Individual / HUF payee", rate: "1%", threshold: "< ₹30k single & < ₹1L/year" },
  { section: "194C", use: "Contract work — company / firm payee", rate: "2%", threshold: "< ₹30k single & < ₹1L/year" },
  { section: "206AA", use: "Any contractor without a PAN", rate: "20%", threshold: "threshold still applies" },
];

export default function ContractorsPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0a0a0f]">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Image src="/Jamba.png" alt="JambaHR" width={30} height={30} className="rounded-md" />
            <span><span className="text-primary">Jamba</span>HR</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</Link>
            <Link href="/contractors" className="text-sm font-medium text-foreground transition-colors">For Contractors</Link>
            <Link href="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/blog" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Blog</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/sign-in"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 sm:px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-muted transition-all"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 sm:px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-6xl px-6 pt-24 pb-20 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

        <AnimateIn animation="fade-up" delay={0}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            🧑‍🎨 For agencies & firms hiring freelancers
          </div>
        </AnimateIn>

        <AnimateIn animation="fade-up" delay={80}>
          <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight leading-[1.1] sm:text-6xl">
            Run your contractors like a{" "}
            <span className="text-primary">real business.</span>
          </h1>
        </AnimateIn>

        <AnimateIn animation="fade-up" delay={160}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
            Most firms hire freelancers on a handshake — no contract, TDS by guesswork, payouts from a personal bank app, IP ownership never written down. JambaHR formalises all of it: signed agreements, automatic TDS, and bank-verified payouts from your own wallet.
          </p>
        </AnimateIn>

        <AnimateIn animation="fade-up" delay={240}>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30"
            >
              Start Free — No Card Needed
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center rounded-lg border border-border px-8 text-base font-medium hover:bg-muted transition-all hover:-translate-y-0.5"
            >
              See Pricing →
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Contractor tools are on the Business plan.</p>
        </AnimateIn>

        {/* Stats strip */}
        <AnimateIn animation="fade-in" delay={400}>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 border-t border-border/50 pt-10">
            {[
              { value: "194J · 194C", label: "Auto-computed TDS" },
              { value: "e-sign", label: "NDA & IP assignment" },
              { value: "RazorpayX", label: "Payouts from your wallet" },
              { value: "Maker-checker", label: "Two-person approval" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ── Problems ── */}
      <section className="bg-muted/30 border-y border-border/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <AnimateIn animation="fade-up">
            <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">No formalisation?</p>
            <h2 className="text-center text-3xl font-bold tracking-tight mb-12">
              This is how most firms manage contractors today.
            </h2>
          </AnimateIn>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {problems.map((p, i) => (
              <AnimateIn key={p.title} animation="scale-in" delay={i * 70}>
                <div className="rounded-xl border border-border bg-white dark:bg-[#111118] p-6 h-full">
                  <div className="text-3xl mb-3">{p.icon}</div>
                  <h3 className="text-base font-semibold mb-1.5">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
          <AnimateIn animation="fade-up" delay={200}>
            <p className="mt-10 text-center text-muted-foreground">
              Every one of these becomes your liability. There&apos;s a cleaner way. &darr;
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── After (what changes) ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <AnimateIn animation="fade-up">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-primary mb-4">With JambaHR</p>
          <h2 className="text-center text-3xl font-bold tracking-tight mb-4">From informal to audit-ready.</h2>
          <p className="mx-auto max-w-xl text-center text-muted-foreground mb-12">
            The same contractor relationships — now with a contract, the right tax, a two-person approval, and a record of every rupee.
          </p>
        </AnimateIn>
        <div className="mx-auto max-w-3xl grid gap-3 sm:grid-cols-2">
          {afters.map((a, i) => (
            <AnimateIn key={a} animation="fade-up" delay={i * 60}>
              <div className="flex items-start gap-3 rounded-xl border border-border bg-white dark:bg-[#111118] p-4 h-full">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">✓</span>
                <p className="text-sm text-foreground/80 leading-relaxed">{a}</p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section className="bg-muted/30 border-y border-border/50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimateIn animation="fade-up">
            <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Everything you need</p>
            <h2 className="text-center text-3xl font-bold tracking-tight mb-4">
              The full contractor toolkit.
            </h2>
            <p className="mx-auto max-w-xl text-center text-muted-foreground mb-16">
              Onboarding, agreements, tax, and payouts — six tools that turn a freelancer relationship into a compliant, recorded one.
            </p>
          </AnimateIn>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((c, i) => (
              <AnimateIn key={c.title} animation="fade-up" delay={i * 70}>
                <div className="rounded-2xl border border-border bg-white dark:bg-[#111118] p-7 h-full">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl">{c.icon}</div>
                  <h3 className="text-lg font-semibold mb-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── TDS table ── */}
      <section className="mx-auto max-w-4xl px-6 py-24">
        <AnimateIn animation="fade-up">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-primary mb-4">Tax, handled</p>
          <h2 className="text-center text-3xl font-bold tracking-tight mb-4">You pick the section. We do the math.</h2>
          <p className="mx-auto max-w-xl text-center text-muted-foreground mb-12">
            TDS rates and thresholds for FY 2025-26 are built in — including the higher no-PAN rate under Section 206AA.
          </p>
        </AnimateIn>
        <AnimateIn animation="fade-up" delay={100}>
          <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-[#111118]">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Section</th>
                  <th className="px-5 py-3 font-semibold">Use it for</th>
                  <th className="px-5 py-3 font-semibold">Rate</th>
                  <th className="px-5 py-3 font-semibold">No TDS below</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tdsRows.map((r, i) => (
                  <tr key={`${r.section}-${i}`}>
                    <td className="px-5 py-4 font-semibold text-primary whitespace-nowrap">{r.section}</td>
                    <td className="px-5 py-4 text-foreground/80">{r.use}</td>
                    <td className="px-5 py-4 font-semibold whitespace-nowrap">{r.rate}</td>
                    <td className="px-5 py-4 text-muted-foreground">{r.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnimateIn>
        <AnimateIn animation="fade-in" delay={200}>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Example: a ₹50,000 creative fee under 194J → <span className="font-semibold text-foreground">₹5,000 TDS</span>, net <span className="font-semibold text-foreground">₹45,000</span>. The same number shows in the payout preview before you submit.
          </p>
        </AnimateIn>
      </section>

      {/* ── Brief guides ── */}
      <section className="bg-muted/30 border-y border-border/50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimateIn animation="fade-up">
            <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Quick guides</p>
            <h2 className="text-center text-3xl font-bold tracking-tight mb-16">Four things you&apos;ll actually do.</h2>
          </AnimateIn>
          <div className="grid gap-6 md:grid-cols-2">
            {guides.map((g, i) => (
              <AnimateIn key={g.label} animation="fade-up" delay={i * 80}>
                <div className="rounded-2xl border border-border bg-white dark:bg-[#111118] p-7 h-full">
                  <h3 className="text-lg font-semibold mb-4">{g.label}</h3>
                  <ol className="space-y-3">
                    {g.steps.map((s, n) => (
                      <li key={s} className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{n + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-foreground dark:bg-white py-24">
        <AnimateIn animation="fade-up">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-background dark:text-foreground mb-4">
              Pay your next freelancer the right way.
            </h2>
            <p className="text-background/70 dark:text-muted-foreground mb-8">
              Signed agreement, correct TDS, two-person approval, full record — in one platform. Free to start; contractor tools unlock on Business.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center rounded-lg bg-primary px-10 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:-translate-y-0.5"
            >
              Get Started Free
            </Link>
          </div>
        </AnimateIn>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-white dark:bg-[#0a0a0f] py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div>
              <Link href="/" className="flex items-center gap-2 text-lg font-bold mb-2">
                <Image src="/Jamba.png" alt="JambaHR" width={26} height={26} className="rounded-md" />
                <span><span className="text-primary">Jamba</span>HR</span>
              </Link>
              <p className="text-sm text-muted-foreground max-w-xs">
                All-in-one HR for Indian SMBs. Leaves, payroll, hiring, contractors — one login.
              </p>
            </div>
            <div className="flex flex-wrap gap-8 text-sm">
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Product</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <Link href="/#features" className="block hover:text-foreground transition-colors">Features</Link>
                  <Link href="/contractors" className="block hover:text-foreground transition-colors">For Contractors</Link>
                  <Link href="/pricing" className="block hover:text-foreground transition-colors">Pricing</Link>
                  <Link href="/sign-up" className="block hover:text-foreground transition-colors">Get Started</Link>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Resources</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <Link href="/blog" className="block hover:text-foreground transition-colors">Blog</Link>
                  <Link href="/blog/how-to-calculate-pf-pt-tds-india" className="block hover:text-foreground transition-colors">PF/PT/TDS Guide</Link>
                  <Link href="/blog/leave-policy-template-india-2025" className="block hover:text-foreground transition-colors">Leave Policy Template</Link>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Company</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <a href="mailto:support@jambahr.com" className="block hover:text-foreground transition-colors">Contact</a>
                  <a href="https://www.linkedin.com/company/jambahr" target="_blank" rel="noopener noreferrer" className="block hover:text-foreground transition-colors">LinkedIn</a>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Legal</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <Link href="/privacy" className="block hover:text-foreground transition-colors">Privacy Policy</Link>
                  <Link href="/terms" className="block hover:text-foreground transition-colors">Terms of Service</Link>
                  <CookieSettingsButton />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} JambaHR. All rights reserved.</p>
            <p>Built for India. Priced for India.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
