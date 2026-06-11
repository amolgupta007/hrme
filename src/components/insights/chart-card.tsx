import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  sub,
  className,
  children,
}: {
  title: string;
  sub?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10",
        className
      )}
    >
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </header>
      {children}
    </section>
  );
}
