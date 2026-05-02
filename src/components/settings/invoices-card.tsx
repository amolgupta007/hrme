import { FileText, Download } from "lucide-react";
import { listInvoices } from "@/actions/billing";
import { formatPaise } from "@/config/billing";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_COLORS: Record<string, string> = {
  paid: "text-green-700",
  issued: "text-blue-700",
  partially_paid: "text-amber-700",
  expired: "text-muted-foreground",
};

export async function InvoicesCard() {
  const result = await listInvoices();

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Invoices</h3>
      </div>

      {!result.success ? (
        <p className="text-sm text-destructive">Could not load invoices: {result.error}</p>
      ) : result.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No invoices yet. Your first invoice will appear here after your first billing cycle.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {result.data.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{formatDate(inv.date)}</p>
                <p className={`text-xs ${STATUS_COLORS[inv.status] ?? "text-muted-foreground"}`}>
                  {inv.status} · {formatPaise(inv.amount)}
                </p>
              </div>
              {inv.url && (
                <a
                  href={inv.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
