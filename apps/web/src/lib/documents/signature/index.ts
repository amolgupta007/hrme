// src/lib/documents/signature/index.ts
// Provider factory. The acknowledge action calls getSignatureProvider(method)
// and never hard-codes typed-ack logic, so Phase 2 (aadhaar_esign / dsc) plugs
// in by adding a case here.
import type { SignatureMethod } from "../types";
import type { SignatureProvider } from "./types";
import { TypedAckProvider } from "./typed-ack";

export function getSignatureProvider(method: SignatureMethod = "typed_ack"): SignatureProvider {
  switch (method) {
    case "typed_ack":
      return TypedAckProvider;
    // case "aadhaar_esign": return DigioProvider;   // Phase 2
    // case "dsc":           throw new Error("DSC not supported");
    default:
      return TypedAckProvider;
  }
}

export type { SignatureProvider, SignatureContext, SignedResult } from "./types";
