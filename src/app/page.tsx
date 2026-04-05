import Link from "next/link";
import Image from "next/image";
import { AnimateIn } from "@/components/ui/animate-in";

const features = [
  {
    icon: "👥",
    title: "Employee Directory",
    description: "Centralised profiles, org chart, reporting structure, and employment history in one place.",
  },
  {
    icon: "📅",
    title: "Leave Management",
    description: "CL, SL, EL, optional holidays — employees apply, managers approve, balances update in real time.",
  },
  {
    icon: "💰",
    title: "Payroll",
    description: "Enter CTC. Get Basic, HRA, PF, PT (10 states), and TDS under the new regime — automatically.",
  },
  {
    icon: "⭐",
    title: "Performance Reviews",
    description: "Review cycles, self-assessments, manager evaluations, and OKR tracking in one flow.",
  },
  {
    icon: "📚",
    title: "Training & Compliance",
    description: "Assign courses, track completion, flag overdue employees. Stay audit-ready.",
  },
  {
    icon: "📄",
    title: "Document Hub",
    description: "Upload policies and contracts. Require e-acknowledgment. Track who has and hasn't signed off.",
  },
  {
    icon: "🎯",
    title: "OKRs",
    description: "Set objectives, track key results, link goals directly to review cycles.",
  },
  {
    icon: "📢",
    title: "Announcements",
    description: "Pin company-wide notices. Employees see what matters. No more all-hands emails.",
  },
  {
    icon: "🤖",
    title: "AI-Powered Hiring",
    description: "Generate job descriptions with AI. Post jobs, track candidates, and send offer letters — all built in.",
  },
];

const painPoints = [
  {
    icon: "💬",
    text: "Leave requests approved on WhatsApp, never tracked.",
  },
  {
    icon: "📊",
    text: "Payroll in Excel, with broken formulas and wrong PT slabs.",
  },
  {
    icon: "📥",
    text: "Resumes scattered across 3 inboxes, feedback in a chat thread.",
  },
  {
    icon: "🤷",
    text: "No idea who acknowledged the new policy you sent last month.",
  },
];

const steps = [
  {
    number: "01",
    title: "Set up your workspace",
    description: "Add your company details, departments, and leave policies. Default Indian policies are pre-loaded — just tweak to match your rules.",
  },
  {
    number: "02",
    title: "Invite your team",
    description: "Employees get self-service access. They can apply for leave, view payslips, acknowledge documents, and update their own profiles.",
  },
  {
    number: "03",
    title: "HR runs itself",
    description: "Approvals, balances, reminders, and compliance tracking happen automatically. You focus on building the business.",
  },
];

export default function HomePage() {
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
            <Link href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</Link>
            <Link href="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
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

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-6xl px-6 pt-24 pb-20 text-center overflow-hidden">
        {/* Soft gradient blob */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] bg-gradient-to-b from-primary/5 via-transparent to-transparent" />

        <AnimateIn animation="fade-up" delay={0}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            🇮🇳 Built for Indian SMBs · Free to start
          </div>
        </AnimateIn>

        <AnimateIn animation="fade-up" delay={80}>
          <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight leading-[1.1] sm:text-6xl">
            From first hire to five hundred —{" "}
            <span className="text-primary">HR that grows with you.</span>
          </h1>
        </AnimateIn>

        <AnimateIn animation="fade-up" delay={160}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
            JambaHR is one platform for leaves, payroll, hiring, reviews, training, and documents — built for Indian companies that don&apos;t have a dedicated HR team.
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
          <p className="mt-4 text-sm text-muted-foreground">Free for up to 10 employees, forever.</p>
        </AnimateIn>

        {/* Stats strip */}
        <AnimateIn animation="fade-in" delay={400}>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 border-t border-border/50 pt-10">
            {[
              { value: "10+", label: "Modules" },
              { value: "₹0", label: "To start" },
              { value: "PF · PT · TDS", label: "Indian compliance built in" },
              { value: "AI", label: "Powered hiring" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ── Pain Points ── */}
      <section className="bg-muted/30 border-y border-border/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <AnimateIn animation="fade-up">
            <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Sound familiar?</p>
            <h2 className="text-center text-3xl font-bold tracking-tight mb-12">
              This is HR at most Indian startups right now.
            </h2>
          </AnimateIn>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {painPoints.map((pain, i) => (
              <AnimateIn key={pain.text} animation="scale-in" delay={i * 80}>
                <div className="rounded-xl border border-border bg-white dark:bg-[#111118] p-6 h-full">
                  <div className="text-3xl mb-3">{pain.icon}</div>
                  <p className="text-sm font-medium text-foreground/80 leading-relaxed">{pain.text}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
          <AnimateIn animation="fade-up" delay={200}>
            <p className="mt-10 text-center text-muted-foreground">
              There&apos;s a better way. &darr;
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <AnimateIn animation="fade-up">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-primary mb-4">How it works</p>
          <h2 className="text-center text-3xl font-bold tracking-tight mb-16">Up and running in an afternoon.</h2>
        </AnimateIn>
        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <AnimateIn key={step.number} animation="fade-up" delay={i * 100}>
              <div className="relative">
                <div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {step.number}
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-5 left-full w-full h-px bg-border -translate-y-0.5 -translate-x-4" />
                )}
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="bg-muted/30 border-y border-border/50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <AnimateIn animation="fade-up">
            <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Everything included</p>
            <h2 className="text-center text-3xl font-bold tracking-tight mb-4">
              One platform. Every HR function.
            </h2>
            <p className="mx-auto mb-16 max-w-xl text-center text-muted-foreground">
              Replace the spreadsheet, the WhatsApp group, the shared Drive folder, and the three tools you&apos;re paying for separately.
            </p>
          </AnimateIn>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <AnimateIn key={f.title} animation="scale-in" delay={i * 60}>
                <div className="group rounded-xl border border-border bg-white dark:bg-[#111118] p-6 h-full transition-all hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5">
                  <div className="mb-4 text-2xl">{f.icon}</div>
                  <h3 className="mb-2 text-base font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── JambaHire Spotlight ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <AnimateIn animation="fade-up">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary mb-3">JambaHire — Built-in ATS</p>
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              Your hiring pipeline.<br />Not your inbox.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Post jobs to a branded careers page. Track candidates through 7 stages. Schedule interviews with Google Calendar links. Send offer letters with one click. All without leaving JambaHR.
            </p>
            <ul className="space-y-3 text-sm">
              {[
                "Public careers page at jambahr.com/careers/your-company",
                "7-stage Kanban pipeline with bulk moves",
                "Interview scheduling with calendar links",
                "AI job description generator — powered by Claude",
                "Offer letters with accept/decline tracking",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-muted-foreground">
                  <span className="mt-0.5 text-primary font-bold">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/sign-up"
              className="mt-8 inline-flex h-10 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
            >
              Start Hiring →
            </Link>
          </AnimateIn>
          <AnimateIn animation="scale-in" delay={100}>
            <div className="rounded-2xl border border-border bg-muted/50 p-8 space-y-3">
              {["Applied", "Screening", "Interview 1", "Interview 2", "Final Round", "Offer", "Hired"].map((stage, i) => (
                <div key={stage} className="flex items-center justify-between rounded-lg border border-border bg-white dark:bg-[#111118] px-4 py-2.5">
                  <span className="text-sm font-medium">{stage}</span>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {[8, 5, 4, 3, 2, 2, 1][i]} candidates
                  </span>
                </div>
              ))}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Payroll Spotlight ── */}
      <section className="bg-muted/30 border-y border-border/50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <AnimateIn animation="scale-in">
              <div className="rounded-2xl border border-border bg-white dark:bg-[#111118] p-8 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CTC Breakdown — Mumbai · ₹12 LPA</p>
                {[
                  { label: "Basic Salary", value: "₹40,000 /mo" },
                  { label: "HRA (metro)", value: "₹20,000 /mo" },
                  { label: "Special Allowance", value: "₹40,000 /mo" },
                  { label: "Employee PF", value: "− ₹1,800 /mo" },
                  { label: "Professional Tax (MH)", value: "− ₹200 /mo" },
                  { label: "TDS (new regime)", value: "− ₹2,800 /mo" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm border-b border-border/50 pb-3 last:border-0 last:pb-0">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className={`font-medium ${row.value.startsWith("−") ? "text-destructive" : "text-foreground"}`}>{row.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <span className="font-semibold">Net Take-Home</span>
                  <span className="font-bold text-primary text-lg">₹95,200 /mo</span>
                </div>
              </div>
            </AnimateIn>
            <AnimateIn animation="fade-up" delay={100}>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary mb-3">Indian Payroll — Built In</p>
              <h2 className="text-3xl font-bold tracking-tight mb-4">
                Payroll that knows Indian tax law.
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Enter a CTC. JambaHR computes everything — Basic, HRA, PF (with wage ceiling), state-wise Professional Tax across 10 states, and TDS under the new tax regime with Rebate u/s 87A. No CA needed for routine payroll.
              </p>
              <ul className="space-y-3 text-sm">
                {[
                  "PF with ₹15,000 wage ceiling, employer + employee split",
                  "PT slabs for Maharashtra, Karnataka, WB, and 7 more states",
                  "TDS under new regime — FY 2025–26 slabs + 87A rebate",
                  "LOP auto-deducted from unpaid approved leaves",
                  "Printable payslips for every employee, every month",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-0.5 text-primary font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── Pricing Teaser ── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <AnimateIn animation="fade-up">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Pricing</p>
          <h2 className="text-center text-3xl font-bold tracking-tight mb-4">Start free. Upgrade when you grow.</h2>
          <p className="mx-auto mb-14 max-w-md text-center text-muted-foreground">
            No contracts. No surprises. Priced in ₹ for Indian businesses.
          </p>
        </AnimateIn>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              name: "Starter",
              price: "Free",
              sub: "Up to 10 employees",
              features: ["Employee directory", "Leave management", "Announcements", "Org chart"],
              cta: "Get Started Free",
              href: "/sign-up",
              highlight: false,
            },
            {
              name: "Growth",
              price: "₹500",
              sub: "/employee/month · up to 200",
              features: ["Everything in Starter", "Documents + acknowledgments", "Performance reviews + OKRs", "Training & compliance", "AI hiring JD generator"],
              cta: "Start Growth",
              href: "/sign-up",
              highlight: true,
            },
            {
              name: "Business",
              price: "₹800",
              sub: "/employee/month · up to 500",
              features: ["Everything in Growth", "Full payroll (PF, PT, TDS)", "JambaHire ATS + interviews + offers", "AI-powered features", "Priority support"],
              cta: "Start Business",
              href: "/sign-up",
              highlight: false,
            },
          ].map((tier, i) => (
            <AnimateIn key={tier.name} animation="scale-in" delay={i * 80}>
              <div className={`relative rounded-2xl border p-8 h-full flex flex-col ${
                tier.highlight
                  ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                  : "border-border bg-white dark:bg-[#111118]"
              }`}>
                {tier.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Most Popular</span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-1">{tier.name}</p>
                  <p className="text-3xl font-bold tracking-tight">{tier.price}</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-6">{tier.sub}</p>
                  <ul className="space-y-2.5 mb-8">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-primary mt-0.5 font-bold">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href={tier.href}
                  className={`mt-auto inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                    tier.highlight
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
                      : "border border-border hover:bg-muted"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            </AnimateIn>
          ))}
        </div>
        <AnimateIn animation="fade-in" delay={200}>
          <p className="mt-8 text-center">
            <Link href="/pricing" className="text-sm text-primary hover:underline underline-offset-4">
              See full feature comparison →
            </Link>
          </p>
        </AnimateIn>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-foreground dark:bg-white py-24">
        <AnimateIn animation="fade-up">
          <div className="mx-auto max-w-2xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-background dark:text-foreground mb-4">
              Your team deserves better than a spreadsheet.
            </h2>
            <p className="text-background/70 dark:text-muted-foreground mb-8">
              Free for up to 10 employees. No credit card required. Set up in under an hour.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center rounded-lg bg-primary px-10 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:-translate-y-0.5"
            >
              Start Free Today
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
                All-in-one HR for Indian SMBs. Leaves, payroll, hiring, reviews — one login.
              </p>
            </div>
            <div className="flex flex-wrap gap-8 text-sm">
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Product</p>
                <div className="space-y-1.5 text-muted-foreground">
                  <Link href="#features" className="block hover:text-foreground transition-colors">Features</Link>
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
