export type AgreementType = "service" | "nda" | "ip_assignment";
export type IpOwnership = "work_for_hire" | "licensed" | "na";
export type AgreementStatus = "sent" | "signed" | "declined" | "expired" | "superseded";

export const AGREEMENT_TYPE_LABELS: Record<AgreementType, string> = {
  service: "Service agreement",
  nda: "Non-disclosure agreement (NDA)",
  ip_assignment: "IP assignment agreement",
};

export const IP_OWNERSHIP_LABELS: Record<IpOwnership, string> = {
  work_for_hire: "Work for hire — org owns all output",
  licensed: "Licensed — contractor retains ownership, grants a licence",
  na: "Not applicable",
};
