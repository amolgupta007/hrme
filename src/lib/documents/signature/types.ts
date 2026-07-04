// src/lib/documents/signature/types.ts
// Pluggable signature abstraction. P1 ships one TypedAckProvider; Phase 2 adds a
// Digio/Leegality Aadhaar-eSign adapter that populates the esign_* fields and
// sets signatureMethod='aadhaar_esign' — with NO schema change. Plain module
// (never "use server") — finalize handles PII + produces the audit artifact.
import type { createAdminSupabase } from "@/lib/supabase/server";
import type { SignatureMethod } from "../types";

type Sb = ReturnType<typeof createAdminSupabase>;

export interface SignatureContext {
  signerName: string;
  ip?: string;
  userAgent?: string;
  acknowledgementText: string;
}

export interface SignedResult {
  signatureMethod: SignatureMethod;
  signerName: string;
  signedPdfPath: string; // immutable storage path
  acknowledgedAt: string; // ISO
  signerIp?: string;
  userAgent?: string;
  // Phase 2 (certified eSign) — null under typed_ack:
  esignProvider?: string | null;
  esignTransactionId?: string | null;
  esignCertificateUrl?: string | null;
}

export interface SignatureProvider {
  readonly method: SignatureMethod;
  /** Produce the final signed artifact for an issued document. Does NOT write the
   *  signed_records row — the calling action does that with this result. */
  finalize(sb: Sb, issuedDocumentId: string, ctx: SignatureContext): Promise<SignedResult>;
}
