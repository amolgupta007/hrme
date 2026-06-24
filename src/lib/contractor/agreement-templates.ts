// Pure agreement-body templates. No server/client directive.
import type { AgreementType, IpOwnership } from "@/lib/contractor/agreement-types";

export interface AgreementBodyInput {
  type: AgreementType;
  orgName: string;
  contractorName: string;
  ipOwnership: IpOwnership;
}

export function defaultAgreementTitle(type: AgreementType): string {
  switch (type) {
    case "nda": return "Non-Disclosure Agreement";
    case "ip_assignment": return "IP Assignment Agreement";
    case "service": return "Independent Contractor Service Agreement";
  }
}

function ipClause(ipOwnership: IpOwnership, orgName: string, contractorName: string): string {
  switch (ipOwnership) {
    case "work_for_hire":
      return `All deliverables, creative output, and work product created by ${contractorName} under this engagement shall be a "work made for hire" and are hereby assigned exclusively to ${orgName}, which owns all intellectual property rights therein.`;
    case "licensed":
      return `${contractorName} retains ownership of the intellectual property in their creative output and grants ${orgName} a non-exclusive, worldwide, royalty-free licence to use, reproduce, and distribute the deliverables for its business purposes.`;
    case "na":
      return "";
  }
}

export function buildAgreementBody(input: AgreementBodyInput): string {
  const { type, orgName, contractorName, ipOwnership } = input;
  const intro = `This agreement is entered into between ${orgName} ("Company") and ${contractorName} ("Contractor").`;

  if (type === "nda") {
    return [
      intro,
      `The Contractor agrees to keep confidential all non-public information, materials, and trade secrets of the Company disclosed during the engagement, and not to use or disclose such Confidential Information except as required to perform the engagement.`,
      `This obligation survives the termination of the engagement.`,
    ].join("\n\n");
  }

  const ip = ipClause(ipOwnership, orgName, contractorName);
  if (type === "ip_assignment") {
    return [intro, ip || "Intellectual-property ownership is governed by the parties' separate written terms."].join("\n\n");
  }

  // service
  return [
    intro,
    `The Contractor will provide services as an independent contractor and not as an employee. The Contractor is responsible for their own taxes; the Company will deduct TDS as required under the Income-tax Act, 1961.`,
    ip,
    `Either party may terminate this engagement with written notice. Confidentiality obligations survive termination.`,
  ].filter(Boolean).join("\n\n");
}

export function isAgreementExpired(expiresAt: string | null, now: number = Date.now()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < now;
}
