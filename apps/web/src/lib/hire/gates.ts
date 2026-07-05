// M5 — gates that block the offer → hired drag.
//
// Both server (convertOfferToHire) and client (pipeline-client → drag handler)
// call checkOfferToHiredGates so the failure messages stay in sync. Day-precision
// IST comparison for the joining-date gate per locked Q7.

export type OfferLike = {
  status: "draft" | "sent" | "accepted" | "declined" | "expired" | "revoked";
  joining_date: string;
};

export type GateResult =
  | { ok: true }
  | { ok: false; reason: "gate_a" | "gate_b" | "no_offer"; message: string };

// Returns the IST-local YYYY-MM-DD for the given date.
function toISTDateKey(d: Date): string {
  // Asia/Kolkata is UTC+5:30. We add the offset to UTC to shift to local-of-IST.
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// joining_date is stored as a 'YYYY-MM-DD' date column in Supabase.
// Compare day-keys directly so we don't drift across the IST midnight boundary.
function joiningDateKey(joiningDate: string): string {
  // Accept either "YYYY-MM-DD" or full ISO; truncate to first 10 chars.
  return joiningDate.slice(0, 10);
}

export function checkOfferToHiredGates(offer: OfferLike | null): GateResult {
  if (!offer) {
    return {
      ok: false,
      reason: "no_offer",
      message: "No offer exists for this candidate yet. Create and send an offer first.",
    };
  }

  if (offer.status !== "accepted") {
    return {
      ok: false,
      reason: "gate_a",
      message:
        offer.status === "sent"
          ? "Candidate hasn't accepted the offer yet."
          : `Cannot hire — offer status is "${offer.status}".`,
    };
  }

  const todayKey = toISTDateKey(new Date());
  const joiningKey = joiningDateKey(offer.joining_date);

  if (todayKey < joiningKey) {
    return {
      ok: false,
      reason: "gate_b",
      message: `Cannot mark hired until ${joiningKey}. Update the offer's joining date if you want to hire earlier.`,
    };
  }

  return { ok: true };
}
