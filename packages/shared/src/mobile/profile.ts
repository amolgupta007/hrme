/**
 * Mobile BFF DTOs for the Staff MVP Profile screen (Mobile PRD-02, Phase D
 * Slice 2, Task 4). The mobile app and the `/api/mobile/profile` route handler
 * both import from here — these types are the wire contract.
 *
 * Types only. No runtime logic (masking + Zod whitelist live web-side in
 * apps/web/src/lib/mobile/profile-payload.ts). See
 * docs/superpowers/plans/2026-08-10-mobile-phase-d-slice2.md.
 *
 * SECURITY: this payload NEVER carries salary/CTC. PAN + Aadhaar are rendered
 * masked (last-4 only) and are NOT writable from mobile.
 */

export type MobileProfileAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

export type MobileEmergencyContact = {
  name: string | null;
  phone: string | null;
  relationship: string | null;
};

/** GET /api/mobile/profile — view-broad / edit-narrow. */
export type MobileProfile = {
  employeeId: string;
  firstName: string;
  lastName: string;
  designation: string | null;
  department: string | null;
  email: string | null; // work email (read-only)
  personalEmail: string | null;
  phone: string | null;
  gender: string | null;
  pronouns: string | null;
  maritalStatus: string | null;
  country: string | null;
  dateOfBirth: string | null;
  communicationAddress: MobileProfileAddress | null;
  permanentAddress: MobileProfileAddress | null;
  emergencyContact: MobileEmergencyContact;
  whatsappOptIn: boolean;
  avatarUrl: string | null;
  /** Masked to last-4 only (e.g. "••••234F"), or null. Read-only. */
  panMasked: string | null;
  /** Masked to last-4 only, or null. Read-only. */
  aadhaarMasked: string | null;
};
