// src/lib/documents/signature/typed-ack.ts
// P1 signature provider: renders the final signed PDF (with an embedded
// acknowledgement block) and uploads it once to the immutable path.
import { renderDocumentPdf } from "../pdf";
import { signedPdfPath, uploadSignedPdf } from "../storage";
import { documentTitleFor } from "../title";
import { formatDateTime } from "@/lib/utils";
import type { RenderedClause, DocumentType } from "../types";
import type { SignatureProvider, SignatureContext, SignedResult } from "./types";

export const TypedAckProvider: SignatureProvider = {
  method: "typed_ack",

  async finalize(sb, issuedDocumentId, ctx: SignatureContext): Promise<SignedResult> {
    const { data: doc } = await sb
      .from("issued_documents")
      .select("id, org_id, issuing_entity_id, template_id, rendered_body, resolved_values")
      .eq("id", issuedDocumentId)
      .maybeSingle();
    if (!doc) throw new Error("Issued document not found");
    const d = doc as Record<string, any>;

    const [{ data: tpl }, { data: entity }] = await Promise.all([
      sb.from("document_templates").select("name, type").eq("id", d.template_id).maybeSingle(),
      sb.from("organizations").select("name").eq("id", d.issuing_entity_id).maybeSingle(),
    ]);

    const clauses = (d.rendered_body ?? []) as RenderedClause[];
    const resolved = (d.resolved_values ?? {}) as Record<string, string>;
    const acknowledgedAt = new Date().toISOString();

    const pdf = await renderDocumentPdf({
      documentTitle: documentTitleFor(
        (tpl as { type: DocumentType } | null)?.type ?? "offer_letter",
        (tpl as { name: string } | null)?.name
      ),
      issuingEntityName: (entity as { name: string } | null)?.name ?? resolved.issuing_entity_name ?? "",
      issuingEntityAddress: resolved.issuing_entity_address,
      clauses,
      acknowledgement: {
        signerName: ctx.signerName,
        acknowledgedAt: formatDateTime(acknowledgedAt),
        ip: ctx.ip,
        statement: ctx.acknowledgementText,
      },
    });

    const path = signedPdfPath(d.org_id, issuedDocumentId);
    const up = await uploadSignedPdf(sb, path, pdf);
    if (!up.ok) throw new Error(`Signed PDF upload failed: ${up.error}`);

    return {
      signatureMethod: "typed_ack",
      signerName: ctx.signerName,
      signedPdfPath: path,
      acknowledgedAt,
      signerIp: ctx.ip,
      userAgent: ctx.userAgent,
      esignProvider: null,
      esignTransactionId: null,
      esignCertificateUrl: null,
    };
  },
};
