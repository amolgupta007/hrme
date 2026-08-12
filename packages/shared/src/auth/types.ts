/**
 * Mobile BFF auth contract (PRD-01 §2.2 "thin packages/shared/auth interface").
 * The mobile app and /api/mobile/* route handlers both import from here —
 * if the auth backend ever changes (e.g. Supabase Auth), this contract is
 * the only surface mobile code depends on.
 */
import type { UserRole } from "../types";

export type MobileOrgMembership = {
  orgId: string;
  orgName: string;
  role: UserRole;
};

/** The signed-in employee's own record, scoped to the active org. */
export type MobileEmployee = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  employmentType: "full_time" | "part_time" | "contract" | "intern" | null;
};

export type MobileMeResponse = {
  orgId: string;
  orgName: string;
  role: UserRole;
  plan: string;
  employee: MobileEmployee | null;
  /** All non-terminated org memberships, oldest first (org switcher, later). */
  memberships: MobileOrgMembership[];
  /**
   * Org attendance capabilities the client must know BEFORE the user acts —
   * chiefly whether to ask for location permission ahead of the first punch
   * rather than in the middle of one.
   */
  attendance: MobileAttendanceCapabilities;
};

export type MobileAttendanceCapabilities = {
  /** Mirrors `getCurrentUser().attendanceEnabled` (the org feature flag). */
  enabled: boolean;
  /**
   * Location-verified clock-in. `enabled: false` ⇒ the app never asks for
   * location at all and the whole feature stays dark.
   */
  locationPunch: {
    enabled: boolean;
    /** `required` ⇒ a punch without coordinates is rejected server-side. */
    mode: "optional" | "required";
  };
};

export type MobileApiError = { error: string };
