import type {
  MobileEmployee,
  MobileMeResponse,
  MobileOrgMembership,
} from "@jambahr/shared/auth/types";
import type { UserRole } from "@/types";

export type MeUserContext = {
  orgId: string;
  orgName: string;
  role: UserRole;
  plan: string;
};

export type MeEmployeeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  employment_type: string | null;
} | null;

export type MeMembershipRow = {
  org_id: string;
  role: string;
  organizations: { id: string; name: string | null };
};

export function buildMePayload(
  user: MeUserContext,
  employeeRow: MeEmployeeRow,
  membershipRows: MeMembershipRow[]
): MobileMeResponse {
  const employee: MobileEmployee | null = employeeRow
    ? {
        id: employeeRow.id,
        firstName: employeeRow.first_name,
        lastName: employeeRow.last_name,
        email: employeeRow.email,
        phone: employeeRow.phone,
        employmentType:
          (employeeRow.employment_type as MobileEmployee["employmentType"]) ??
          null,
      }
    : null;

  const memberships: MobileOrgMembership[] = membershipRows.map((row) => ({
    orgId: row.org_id,
    orgName: row.organizations?.name ?? "your organisation",
    role: row.role as UserRole,
  }));

  return {
    orgId: user.orgId,
    orgName: user.orgName,
    role: user.role,
    plan: user.plan,
    employee,
    memberships,
  };
}
