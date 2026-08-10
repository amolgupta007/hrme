import { z } from "zod";
import type {
  MobileEmergencyContact,
  MobileProfile,
  MobileProfileAddress,
} from "@jambahr/shared";

/**
 * Pure shaper + edit whitelist for the mobile profile endpoint. No I/O.
 *
 * SECURITY: salary/CTC is never read here. PAN + Aadhaar are masked to last-4
 * only in the GET payload and are NOT part of the edit whitelist — the POST
 * route physically cannot write them.
 */

/** Mask a sensitive id to its last 4 characters (e.g. "••••234F"), or null. */
export function maskLast4(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return null;
  const last4 = trimmed.slice(-4);
  return `••••${last4}`;
}

function normalizeAddress(raw: unknown): MobileProfileAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  return {
    line1: typeof a.line1 === "string" ? a.line1 : "",
    line2: typeof a.line2 === "string" ? a.line2 : "",
    city: typeof a.city === "string" ? a.city : "",
    state: typeof a.state === "string" ? a.state : "",
    pincode: typeof a.pincode === "string" ? a.pincode : "",
  };
}

/** The `employees` row the profile route selects, plus the resolved dept name. */
export type ProfileEmployeeRow = {
  id: string;
  first_name: string;
  last_name: string;
  designation: string | null;
  email: string | null;
  personal_email: string | null;
  phone: string | null;
  gender: string | null;
  pronouns: string | null;
  marital_status: string | null;
  country: string | null;
  date_of_birth: string | null;
  communication_address: unknown;
  permanent_address: unknown;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  whatsapp_opt_in: boolean | null;
  avatar_url: string | null;
  pan_number: string | null;
  aadhar_number: string | null;
  departments?: { name: string | null } | null;
};

export function buildProfile(row: ProfileEmployeeRow): MobileProfile {
  const emergencyContact: MobileEmergencyContact = {
    name: row.emergency_contact_name ?? null,
    phone: row.emergency_contact_phone ?? null,
    relationship: row.emergency_contact_relationship ?? null,
  };

  return {
    employeeId: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    designation: row.designation ?? null,
    department: row.departments?.name ?? null,
    email: row.email ?? null,
    personalEmail: row.personal_email ?? null,
    phone: row.phone ?? null,
    gender: row.gender ?? null,
    pronouns: row.pronouns ?? null,
    maritalStatus: row.marital_status ?? null,
    country: row.country ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    communicationAddress: normalizeAddress(row.communication_address),
    permanentAddress: normalizeAddress(row.permanent_address),
    emergencyContact,
    whatsappOptIn: !!row.whatsapp_opt_in,
    avatarUrl: row.avatar_url ?? null,
    panMasked: maskLast4(row.pan_number),
    aadhaarMasked: maskLast4(row.aadhar_number),
  };
}

// ── Edit whitelist (mobile-restricted; PAN/Aadhaar/names/dob NOT here) ────────

const emergencyContactSchema = z.object({
  name: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  relationship: z.string().max(80).optional(),
});

/**
 * The ONLY fields mobile may edit: phone, personal email, emergency contact,
 * WhatsApp opt-in. Unknown keys (pan/aadhaar/firstName/dob/…) are stripped by
 * Zod — they can never reach the DB update.
 */
export const MobileProfileUpdateSchema = z
  .object({
    phone: z.string().max(40).optional(),
    personalEmail: z.string().email("Invalid email").or(z.literal("")).optional(),
    emergencyContact: emergencyContactSchema.optional(),
    whatsappOptIn: z.boolean().optional(),
  })
  .strict();

export type MobileProfileUpdateBody = z.infer<typeof MobileProfileUpdateSchema>;

/**
 * Translate a validated update body into the `employees` column patch. Only
 * whitelisted columns appear; PAN/Aadhaar/names are structurally impossible.
 */
export function buildProfileUpdatePatch(body: MobileProfileUpdateBody): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.phone !== undefined) patch.phone = body.phone || null;
  if (body.personalEmail !== undefined) patch.personal_email = body.personalEmail || null;
  if (body.emergencyContact) {
    const ec = body.emergencyContact;
    if (ec.name !== undefined) patch.emergency_contact_name = ec.name || null;
    if (ec.phone !== undefined) patch.emergency_contact_phone = ec.phone || null;
    if (ec.relationship !== undefined) patch.emergency_contact_relationship = ec.relationship || null;
  }
  if (body.whatsappOptIn !== undefined) {
    patch.whatsapp_opt_in = body.whatsappOptIn;
    patch.whatsapp_opt_in_at = body.whatsappOptIn ? new Date().toISOString() : null;
  }
  return patch;
}
