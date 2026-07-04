// src/lib/documents/title.ts
import type { DocumentType } from "./types";

const LABELS: Record<DocumentType, string> = {
  offer_letter: "Letter of Appointment",
  nda: "Non-Disclosure Agreement",
  policy: "Policy Document",
};

/** Human document heading. Falls back to the template name for policies (which
 *  are org-specific) or when a type has no fixed label. */
export function documentTitleFor(type: DocumentType, templateName?: string | null): string {
  if (type === "policy" && templateName) return templateName;
  return LABELS[type] ?? templateName ?? "Document";
}
