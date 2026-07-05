export type OwnershipTransferStatus = "pending" | "accepted" | "cancelled" | "expired";

export type TransferLike = {
  status: OwnershipTransferStatus;
  expires_at: string;
  to_email: string | null;
  to_phone: string | null;
};

export function isExpired(t: TransferLike, nowMs: number): boolean {
  return Date.parse(t.expires_at) <= nowMs;
}

export function canAccept(t: TransferLike, nowMs: number): boolean {
  return t.status === "pending" && !isExpired(t, nowMs);
}

export function canCancel(t: TransferLike): boolean {
  return t.status === "pending";
}

export function identityMatches(
  caller: { email?: string | null; phone?: string | null },
  t: TransferLike
): boolean {
  if (t.to_email && caller.email && t.to_email.trim().toLowerCase() === caller.email.trim().toLowerCase()) {
    return true;
  }
  if (t.to_phone && caller.phone && t.to_phone.trim() === caller.phone.trim()) {
    return true;
  }
  return false;
}
