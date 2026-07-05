// src/lib/documents/types.ts
// Shared types + Zod schemas for the document templating system.
import { z } from "zod";

export const CLAUSE_CATEGORIES = [
  "behavior",
  "compliance",
  "confidentiality",
  "comp",
  "custom",
] as const;
export type ClauseCategory = (typeof CLAUSE_CATEGORIES)[number];

export const DOCUMENT_TYPES = ["offer_letter", "nda", "policy"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const TEMPLATE_STATUSES = ["draft", "active", "archived"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const ISSUED_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "acknowledged",
  "declined",
] as const;
export type IssuedStatus = (typeof ISSUED_STATUSES)[number];

export const SIGNATURE_METHODS = ["typed_ack", "aadhaar_esign", "dsc"] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

// A clause as stored/rendered.
export interface Clause {
  id?: string;
  title: string;
  body_markdown: string;
  is_mandatory: boolean;
  category: ClauseCategory;
  order_index: number;
}

// The frozen clause snapshot stored on issued_documents.rendered_body.
export interface RenderedClause {
  title: string;
  body_markdown: string; // {{variables}} already resolved
  category: ClauseCategory;
}

// ── AI clause generation contract ──────────────────────────────────────────
export const ClauseGenClauseSchema = z.object({
  title: z.string().min(1),
  category: z.enum(CLAUSE_CATEGORIES),
  body_markdown: z.string().min(1),
  is_mandatory: z.boolean(),
});

export const ClauseGenResultSchema = z.object({
  clauses: z.array(ClauseGenClauseSchema).min(1),
  detected_variables: z.array(z.string()).default([]),
});

export type ClauseGenResult = z.infer<typeof ClauseGenResultSchema>;

export interface ClauseGenInput {
  groupName: string;
  issuingEntityName?: string;
  roleTitle: string;
  industry?: string;
  employmentType: "full_time" | "part_time" | "contract" | "intern";
  state?: string;
  pastedClauses?: string[];
  documentType: DocumentType;
}
