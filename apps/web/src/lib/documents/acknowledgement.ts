// src/lib/documents/acknowledgement.ts
// The fixed acknowledgement statement shown to the signer and frozen onto the
// immutable signed_record. Wording must make clear this is acknowledgement of
// receipt/agreement, NOT a digitally certified or Aadhaar-based signature
// (PRD §4). A copy is stored per-record so future wording changes never mutate
// a historical audit record.
export const ACKNOWLEDGEMENT_STATEMENT =
  "By typing my name below I acknowledge that I have read, received, and agree " +
  "to the terms of this document. I understand this is an electronic " +
  "acknowledgement of receipt and agreement, not a digitally certified or " +
  "Aadhaar-based signature.";
