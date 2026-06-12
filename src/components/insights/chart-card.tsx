import { cn } from "@/lib/utils";
import { ExportCsvButton } from "./export-csv-button";

export function ChartCard({
  title,
  sub,
  className,
  exportRows,
  exportName,
  children,
}: {
  title: string;
  sub?: string;
  className?: string;
  /** When given, renders a CSV download button in the card header. */
  exportRows?: Record<string, unknown>[];
  exportName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "insight-card rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10",
        className
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        {exportRows && exportRows.length > 0 && (
          <ExportCsvButton
            rows={exportRows}
            filename={exportName ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          />
        )}
      </header>
      {children}
    </section>
  );
}
