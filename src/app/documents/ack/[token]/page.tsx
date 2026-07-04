import { CheckCircle2, XCircle, Clock, Building2, FileSignature } from "lucide-react";
import { getIssuedDocumentForAck } from "@/actions/documents-templating";
import { MarkdownView } from "@/components/documents/markdown-view";
import { AckForm } from "@/components/documents/ack-form";

interface Props {
  params: { token: string };
}

export const dynamic = "force-dynamic";

export default async function DocumentAckPage({ params }: Props) {
  const result = await getIssuedDocumentForAck(params.token);

  if (!result.success) {
    return (
      <Shell>
        <div className="bg-card rounded-2xl shadow-sm border p-8 text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-xl font-bold mb-2">Document not found</h1>
          <p className="text-sm text-muted-foreground">{result.error}</p>
        </div>
      </Shell>
    );
  }

  const doc = result.data;
  const canAct = doc.status === "viewed" || doc.status === "sent";

  return (
    <Shell>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-card rounded-full px-4 py-2 shadow-sm border mb-4">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">{doc.entity_name}</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <FileSignature className="h-6 w-6 text-primary" />
          {doc.document_title}
        </h1>
        {doc.employee_name ? (
          <p className="mt-1 text-sm text-muted-foreground">Prepared for {doc.employee_name}</p>
        ) : null}
      </div>

      {/* Document body */}
      <div className="bg-card rounded-2xl shadow-sm border p-6 md:p-8 space-y-4 max-h-[60vh] overflow-y-auto">
        {doc.clauses.map((c, i) => (
          <section key={i}>
            <h2 className="text-sm font-bold text-foreground mb-1">{c.title}</h2>
            <MarkdownView markdown={c.body_markdown} />
          </section>
        ))}
      </div>

      {/* Action / status */}
      {doc.expired ? (
        <StatusCard tone="amber" icon={<Clock className="mx-auto h-10 w-10 text-amber-500 mb-3" />} title="This link has expired">
          The acknowledgement window has closed. Please contact {doc.entity_name} directly.
        </StatusCard>
      ) : doc.status === "acknowledged" ? (
        <StatusCard tone="emerald" icon={<CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />} title="Acknowledged">
          Thank you — your acknowledgement has been recorded. {doc.entity_name} has been notified.
        </StatusCard>
      ) : doc.status === "declined" ? (
        <StatusCard tone="gray" icon={<XCircle className="mx-auto h-10 w-10 text-gray-400 mb-3" />} title="Response recorded">
          Thanks for letting us know.
        </StatusCard>
      ) : canAct ? (
        <div className="bg-card rounded-2xl shadow-sm border p-6">
          <AckForm token={params.token} statement={doc.acknowledgement_statement} />
        </div>
      ) : null}

      <div className="text-center text-xs text-muted-foreground">Powered by JambaHR</div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">{children}</div>
    </div>
  );
}

function StatusCard({
  tone,
  icon,
  title,
  children,
}: {
  tone: "emerald" | "gray" | "amber";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const toneMap = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    gray: "border-gray-200 bg-gray-50 text-gray-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  } as const;
  return (
    <div className={`rounded-2xl border p-6 text-center ${toneMap[tone]}`}>
      {icon}
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm mt-1 opacity-90">{children}</p>
    </div>
  );
}
