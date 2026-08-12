import type {
  MobileEmployee,
  MobileMeResponse,
  MobileOrgMembership,
} from "@jambahr/shared/auth/types";
import {
  DEFAULT_LOCATION_PUNCH_SETTINGS,
  type LocationPunchSettings,
} from "@jambahr/shared/attendance/geo-punch";
import type { UserRole } from "@/types";

export type MeUserContext = {
  orgId: string;
  orgName: string;
  role: UserRole;
  plan: string;
  attendanceEnabled?: boolean;
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
  membershipRows: MeMembershipRow[],
  locationPunch: LocationPunchSettings = DEFAULT_LOCATION_PUNCH_SETTINGS
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
    attendance: {
      enabled: user.attendanceEnabled === true,
      locationPunch: {
        // Only surfaced as "on" when attendance itself is on — otherwise the
        // client would ask for location permission for a module it can't use.
        enabled: user.attendanceEnabled === true && locationPunch.enabled,
        mode: locationPunch.mode,
      },
    },
  };
}
