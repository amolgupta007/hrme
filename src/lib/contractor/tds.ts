// Pure contractor TDS computation (FY 2025-26). No server/client directive — usable anywhere.
import type { TdsSection, PayeeType } from "@/lib/contractor/types";

const THRESHOLD_194J = 30000;          // annual, ₹
const THRESHOLD_194C_SINGLE = 30000;   // single payment, ₹
const THRESHOLD_194C_AGGREGATE = 100000; // YTD aggregate, ₹
const NO_PAN_RATE = 20;                // §206AA

export interface ContractorTDSInput {
  amount: number;        // this payment, ₹
  section: TdsSection;
  payeeType: PayeeType;
  hasPan: boolean;
  ytdPaid?: number;      // already paid this FY before this payment, ₹
}

export interface ContractorTDSResult {
  tds: number;           // ₹, rounded
  ratePct: number;
  thresholdApplied: boolean; // true => below threshold => no TDS
  reason: string;
}

export function computeContractorTDS(input: ContractorTDSInput): ContractorTDSResult {
  const { amount, section, payeeType, hasPan } = input;
  const ytdPaid = input.ytdPaid ?? 0;

  const belowThreshold =
    section === "194J"
      ? amount <= THRESHOLD_194J
      : amount < THRESHOLD_194C_SINGLE && ytdPaid + amount < THRESHOLD_194C_AGGREGATE;

  if (belowThreshold) {
    return { tds: 0, ratePct: 0, thresholdApplied: true, reason: `Below ${section} threshold` };
  }

  let ratePct: number;
  if (!hasPan) {
    ratePct = NO_PAN_RATE;
  } else if (section === "194J") {
    ratePct = 10;
  } else {
    ratePct = payeeType === "individual_huf" ? 1 : 2;
  }

  const tds = Math.round((amount * ratePct) / 100);
  const reason = hasPan ? `${section} @ ${ratePct}%` : `No PAN — §206AA @ ${ratePct}%`;
  return { tds, ratePct, thresholdApplied: false, reason };
}
