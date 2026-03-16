import Link from "next/link";

const features = [
  {
    title: "Employee Directory",
    description: "Centralized profiles, documents, and org structure.",
    icon: "👥",
  },
  {
    title: "Leave Management",
    description: "Request, approve, and track time off with ease.",
    icon: "📅",
  },
  {
    title: "Performance Reviews",
    description: "Run review cycles with self and manager assessments.",
    icon: "⭐",
  },
  {
    title: "Training & Compliance",
    description: "Assign courses, track completion, stay compliant.",
    icon: "📚",
  },
  {
    title: "Payroll & Compensation",
    description: "Salary structures, payslips, and bonus tracking.",
    icon: "💰",
  },
  {
    title: "Document Hub",
    description: "Secure storage for policies, contracts, and forms.",
    icon: "📄",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="text-primary">HR</span>Flow
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
            Built for teams of 10–500 people
          </div>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            HR that runs itself,
            <br />
            <span className="text-primary">so you don&apos;t have to.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            One platform for employee management, leave tracking, performance
            reviews, training, compliance, and payroll. No HR degree required.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all hover:shadow-xl hover:shadow-primary/30"
            >
              Start Free — 14 Days
            </Link>
            <Link
              href="#features"
              className="inline-flex h-12 items-center rounded-lg border border-border px-8 text-base font-medium hover:bg-muted transition-colors"
            >
              See Features
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="mb-4 text-center text-3xl font-bold tracking-tight">
          Everything your team needs
        </h2>
        <p className="mx-auto mb-16 max-w-xl text-center text-muted-foreground">
          Replace spreadsheets, scattered docs, and that one person who
          &quot;handles HR stuff&quot; with a single, purpose-built platform.
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div className="mb-4 text-3xl">{feature.icon}</div>
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to simplify your HR?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Free for up to 10 employees. No credit card required.
          </p>
          <Link
            href="/sign-up"
            className="mt-8 inline-flex h-12 items-center rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            Get Started Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} HRFlow. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
