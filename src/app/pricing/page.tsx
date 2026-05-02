"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimateIn } from "@/components/ui/animate-in";
import {
  PLATFORM_FEES,
  PER_EMPLOYEE_MONTHLY_RATE,
  ANNUAL_MULTIPLIER,
  formatPaise,
} from "@/config/billing";

type Cycle = "monthly" | "annual";

interface Tier {
  key: "starter" | "growth" | "business" | "custom";
  name: string;
  sub: string;
  limit: string;
  highlight: boolean;
  cta: string;
  href: string;
  platformFee: number;
  monthlyPerEmp: number;
  annualPerEmp: number;
  features: Record<string, { text: string; included: boolean }[]>;
}

const tiers: Tier[] = [
  {
    key: "starter",
    name: "Starter",
    sub: "For teams just getting started",
    limit: "Up to 10 employees",
    highlight: false,
    cta: "Get Started Free",
    href: "/sign-up",
    platformFee: 0,
    monthlyPerEmp: 0,
    annualPerEmp: 0,
    features: {
      "Core HR": [
        { text: "Employee directory & profiles", included: true },
        { text: "Org chart", included: true },
        { text: "Leave management (CL, SL, EL, custom)", included: true },
        { text: "Indian holiday calendar", included: true },
        { text: "Company announcements", included: true },
        { text: "Employee self-service portal", included: true },
        { text: "Role-based access (admin / manager / employee)", included: true },
      ],
      "Advanced HR": [
        { text: "Document hub + e-acknowledgment", included: false },
        { text: "Performance reviews + OKR tracking", included: false },
        { text: "Training & compliance courses", included: false },
        { text: "Payroll with Indian tax compliance", included: false },
      ],
      "Hiring": [
        { text: "AI job description generator", included: false },
        { text: "Public careers page", included: false },
        { text: "JambaHire ATS pipeline", included: false },
        { text: "Interview scheduling + offer letters", included: false },
      ],
    },
  },
  {
    key: "growth",
    name: "Growth",
    sub: "For growing teams that need more",
    limit: "Up to 200 employees",
    highlight: true,
    cta: "Start Growth Plan",
    href: "/sign-up",
    platformFee: PLATFORM_FEES.growth,
    monthlyPerEmp: PER_EMPLOYEE_MONTHLY_RATE.growth,
    annualPerEmp: PER_EMPLOYEE_MONTHLY_RATE.growth * ANNUAL_MULTIPLIER,
    features: {
      "Core HR": [
        { text: "Everything in Starter", included: true },
      ],
      "Advanced HR": [
        { text: "Document hub + e-acknowledgment", included: true },
        { text: "Performance reviews + OKR tracking", included: true },
        { text: "Training & compliance courses", included: true },
        { text: "Payroll with Indian tax compliance", included: false },
      ],
      "Hiring": [
        { text: "AI job description generator", included: true },
        { text: "Public careers page", included: true },
        { text: "JambaHire ATS pipeline", included: false },
        { text: "Interview scheduling + offer letters", included: false },
      ],
    },
  },
  {
    key: "business",
    name: "Business",
    sub: "For teams that want everything",
    limit: "Up to 500 employees",
    highlight: false,
    cta: "Start Business Plan",
    href: "/sign-up",
    platformFee: PLATFORM_FEES.business,
    monthlyPerEmp: PER_EMPLOYEE_MONTHLY_RATE.business,
    annualPerEmp: PER_EMPLOYEE_MONTHLY_RATE.business * ANNUAL_MULTIPLIER,
    features: {
      "Core HR": [
        { text: "Everything in Growth", included: true },
      ],
      "Advanced HR": [
        { text: "Document hub + e-acknowledgment", included: true },
        { text: "Performance reviews + OKR tracking", included: true },
        { text: "Training & compliance courses", included: true },
        { text: "Payroll — PF, PT (10 states), TDS new regime", included: true },
      ],
      "Hiring": [
        { text: "AI job description generator", included: true },
        { text: "Public careers page", included: true },
        { text: "JambaHire ATS — 7-stage Kanban pipeline", included: true },
        { text: "Interview scheduling + offer letters", included: true },
      ],
    },
  },
  {
    key: "custom",
    name: "Custom",
    sub: "Pick only what you need",
    limit: "Up to 200 employees",
    highlight: false,
    cta: "Build your plan",
    href: "/dashboard/settings/custom-plan",
    platformFee: PLATFORM_FEES.custom,
    monthlyPerEmp: 0,
    annualPerEmp: 0,
    features: {
      "How it works": [
        { text: "Pick the features you need", included: true },
        { text: "₹120 / feature / employee / month", included: true },
        { text: "Founder review within 1 business day", included: true },
        { text: "Cancel anytime", included: true },
      ],
    },
  },
];

const faqs = [
  {
    q: "Is the Starter plan really free forever?",
    a: "Yes. The Starter plan is permanently free for up to 10 employees. No trial period, no credit card required. You only pay when you choose to upgrade.",
  },
  {
    q: "How does per-employee pricing work?",
    a: "You pay for the number of active employees in your account. Add an employee, the count goes up. Terminate an employee, the count goes down the following month.",
  },
  {
    q: "What's the difference between Monthly and Annual billing?",
    a: "Annual billing is 10× the monthly rate (you save 2 months — about 17%). Both cycles get the same features. Switch any time from Settings → Billing; the change takes effect on your next billing date.",
  },
  {
    q: "What is the platform fee?",
    a: "A one-time setup fee that covers onboarding, configuration, and account provisioning. Paid once per account — never again, even on upgrade. Upgrading from Growth to Business only charges the difference.",
  },
  {
    q: "What Indian payroll compliance does JambaHR handle?",
    a: "The Business plan handles EPF (12% employee + employer, ₹15,000 wage ceiling), state-wise Professional Tax (10 states), and TDS under the new tax regime (FY 2025–26 slabs + Rebate u/s 87A). LOP deductions from approved unpaid leaves are calculated automatically.",
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Yes. Upgrades take effect immediately and you only pay the platform-fee delta plus pro-rated recurring. Downgrades take effect at the start of the next billing cycle.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. You can cancel from Settings → Billing at any time. You retain access to paid features until the end of your current billing cycle. We don't issue refunds for partial cycles.",
  },
  {
    q: "What is JambaHire?",
    a: "JambaHire is the built-in applicant tracking system (ATS) available on the Business plan. It includes a public careers page, a 7-stage candidate pipeline (Applied → Hired), interview scheduling with Google Calendar and Outlook links, structured interview feedback, and offer letters with accept/decline links.",
  },
  {
    q: "Does the price include GST?",
    a: "Prices shown exclude GST. 18% GST is added at checkout for all paid plans. If you provide a GSTIN in Settings → Billing, your invoices are issued as GST-compliant tax invoices.",
  },
];

function PriceLine({ tier, cycle }: { tier: Tier; cycle: Cycle }) {
  if (tier.key === "starter") {
    return (
      <>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tracking-tight">Free</span>
          <span className="text-sm text-muted-foreground">forever</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">No platform fee</p>
      </>
    );
  }

  if (tier.key === "custom") {
    return (
      <>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tracking-tight">₹120</span>
          <span className="text-sm text-muted-foreground">/feature/employee/month</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          From {formatPaise(tier.platformFee)} platform fee + GST · Founder review required
        </p>
      </>
    );
  }

  const amount = cycle === "monthly" ? tier.monthlyPerEmp : tier.annualPerEmp;
  const detail = cycle === "monthly" ? "/employee/month" : "/employee/year";

  return (
    <>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight">{formatPaise(amount)}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">+ 18% GST</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatPaise(tier.platformFee)} platform fee + GST · one-time
      </p>
    </>
  );
}

export default function PricingPage() {
  const [cycle, setCycle] = useState<Cycle>("annual");

  return (
    <main className="min-h-screen bg-white dark:bg-[#0a0a0f]">
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-white/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Image src="/Jamba.png" alt="JambaHR" width={30} height={30} className="rounded-md" />
            <span><span className="text-primary">Jamba</span>HR</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</Link>
            <Link href="/pricing" className="text-sm font-medium text-foreground transition-colors">Pricing</Link>
            <Link href="/blog" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Blog</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-10 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[400px] bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <AnimateIn animation="fade-up">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary mb-4">Pricing</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
            Start free. Pay as you grow.
          </h1>
          <p className="mx-auto max-w-md text-lg text-muted-foreground">
            No contracts. No surprises. Priced in ₹ for Indian businesses.
          </p>
        </AnimateIn>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-6">
        <div className="flex items-center justify-center gap-2 rounded-full border border-border bg-muted/40 p-1 w-fit mx-auto">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              cycle === "monthly"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle("annual")}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              cycle === "annual"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                cycle === "annual"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              Save 2 months
            </span>
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((tier, i) => (
            <AnimateIn key={tier.name} animation="scale-in" delay={i * 80}>
              <div className={`relative rounded-2xl border p-7 h-full flex flex-col ${
                tier.highlight
                  ? "border-primary bg-primary/5 shadow-xl shadow-primary/10"
                  : "border-border bg-white dark:bg-[#111118]"
              }`}>
                {tier.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Most Popular</span>
                  </div>
                )}
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{tier.name}</p>
                  <PriceLine tier={tier} cycle={cycle} />
                  <p className="mt-3 text-xs text-muted-foreground">{tier.limit}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{tier.sub}</p>
                </div>

                <Link
                  href={tier.href}
                  className={`mb-8 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                    tier.highlight
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
                      : "border border-border hover:bg-muted"
                  }`}
                >
                  {tier.cta}
                </Link>

                <div className="space-y-6 flex-1">
                  {Object.entries(tier.features).map(([category, items]) => (
                    <div key={category}>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{category}</p>
                      <ul className="space-y-2.5">
                        {items.map((item) => (
                          <li key={item.text} className="flex items-start gap-2.5 text-sm">
                            {item.included ? (
                              <span className="mt-0.5 text-primary font-bold shrink-0">✓</span>
                            ) : (
                              <span className="mt-0.5 text-muted-foreground/40 shrink-0">—</span>
                            )}
                            <span className={item.included ? "text-foreground/80" : "text-muted-foreground/50"}>
                              {item.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>

      <section className="bg-muted/30 border-y border-border/50 py-12">
        <AnimateIn animation="fade-up">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary mb-3">Indian Payroll Compliance</p>
            <h2 className="text-2xl font-bold tracking-tight mb-3">No CA needed for routine payroll.</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The Business plan handles EPF, state-wise PT (10 states), and TDS under the new tax regime automatically. Enter a CTC, JambaHR computes every component. Your CA still handles annual filings — but the monthly grind is gone.
            </p>
          </div>
        </AnimateIn>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-24">
        <AnimateIn animation="fade-up">
          <h2 className="text-2xl font-bold tracking-tight text-center mb-12">Frequently Asked Questions</h2>
        </AnimateIn>
        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <AnimateIn key={faq.q} animation="fade-up" delay={i * 60}>
              <div className="rounded-xl border border-border bg-white dark:bg-[#111118] p-6">
                <p className="font-semibold text-foreground mb-2">{faq.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>

      <section className="bg-foreground dark:bg-white py-20">
        <AnimateIn animation="fade-up">
          <div className="mx-auto max-w-xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-background dark:text-foreground mb-4">
              Start free today.
            </h2>
            <p className="text-background/70 dark:text-muted-foreground mb-8">
              Up to 10 employees. No credit card. Cancel any time.
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

      <footer className="border-t border-border bg-white dark:bg-[#0a0a0f] py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
            <Image src="/Jamba.png" alt="JambaHR" width={22} height={22} className="rounded-md" />
            <span><span className="text-primary">Jamba</span>HR</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <a href="mailto:support@jambahr.com" className="hover:text-foreground transition-colors">Contact</a>
          </div>
          <p>© {new Date().getFullYear()} JambaHR</p>
        </div>
      </footer>
    </main>
  );
}
