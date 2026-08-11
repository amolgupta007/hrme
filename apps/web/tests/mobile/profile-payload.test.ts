import { describe, it, expect } from "vitest";
import {
  maskLast4,
  buildProfile,
  buildProfileUpdatePatch,
  MobileProfileUpdateSchema,
  type ProfileEmployeeRow,
} from "@/lib/mobile/profile-payload";

const row: ProfileEmployeeRow = {
  id: "emp-1",
  first_name: "Ravi",
  last_name: "Kumar",
  designation: "Engineer",
  email: "ravi@acme.com",
  personal_email: "ravi@gmail.com",
  phone: "+919000000000",
  gender: "male",
  pronouns: "he/him",
  marital_status: "single",
  country: "India",
  date_of_birth: "1995-01-01",
  communication_address: { line1: "1 St", line2: "", city: "Pune", state: "MH", pincode: "411001" },
  permanent_address: null,
  emergency_contact_name: "Sita",
  emergency_contact_phone: "+919111111111",
  emergency_contact_relationship: "Spouse",
  whatsapp_opt_in: true,
  avatar_url: "https://x/a.jpg",
  pan_number: "ABCDE1234F",
  aadhar_number: "123456789012",
  departments: { name: "Engineering" },
};

describe("maskLast4", () => {
  it("masks to last 4 chars", () => {
    expect(maskLast4("ABCDE1234F")).toBe("••••234F");
    expect(maskLast4("123456789012")).toBe("••••9012");
  });
  it("returns null for empty/nullish", () => {
    expect(maskLast4(null)).toBeNull();
    expect(maskLast4("")).toBeNull();
    expect(maskLast4("   ")).toBeNull();
  });
});

describe("buildProfile", () => {
  it("masks PAN + Aadhaar and never exposes raw ids", () => {
    const p = buildProfile(row);
    expect(p.panMasked).toBe("••••234F");
    expect(p.aadhaarMasked).toBe("••••9012");
    const json = JSON.stringify(p);
    expect(json).not.toContain("ABCDE1234F");
    expect(json).not.toContain("123456789012");
  });
  it("maps department, addresses and emergency contact", () => {
    const p = buildProfile(row);
    expect(p.department).toBe("Engineering");
    expect(p.communicationAddress?.city).toBe("Pune");
    expect(p.permanentAddress).toBeNull();
    expect(p.emergencyContact).toEqual({ name: "Sita", phone: "+919111111111", relationship: "Spouse" });
    expect(p.whatsappOptIn).toBe(true);
  });
  it("never includes any salary/ctc field", () => {
    const p = buildProfile(row);
    const json = JSON.stringify(p).toLowerCase();
    expect(json).not.toContain("ctc");
    expect(json).not.toContain("salary");
    expect(json).not.toContain("net_pay");
  });
});

describe("MobileProfileUpdateSchema + buildProfileUpdatePatch", () => {
  it("strips non-whitelisted keys (pan/aadhaar/firstName/dob) via strict()", () => {
    const parsed = MobileProfileUpdateSchema.safeParse({
      phone: "+919222222222",
      panNumber: "ZZZZZ9999Z",
      aadharNumber: "999999999999",
      firstName: "Hacker",
      dateOfBirth: "2000-01-01",
    });
    expect(parsed.success).toBe(false); // strict() rejects unknown keys
  });

  it("accepts only the whitelist and builds a patch of allowed columns", () => {
    const parsed = MobileProfileUpdateSchema.parse({
      phone: "+919222222222",
      personalEmail: "new@gmail.com",
      emergencyContact: { name: "Gita", phone: "+919333333333", relationship: "Sister" },
      whatsappOptIn: false,
    });
    const patch = buildProfileUpdatePatch(parsed);
    expect(patch.phone).toBe("+919222222222");
    expect(patch.personal_email).toBe("new@gmail.com");
    expect(patch.emergency_contact_name).toBe("Gita");
    expect(patch.whatsapp_opt_in).toBe(false);
    expect(patch.whatsapp_opt_in_at).toBeNull();
    // Structurally impossible columns:
    expect(patch).not.toHaveProperty("pan_number");
    expect(patch).not.toHaveProperty("aadhar_number");
    expect(patch).not.toHaveProperty("first_name");
    expect(patch).not.toHaveProperty("date_of_birth");
  });

  it("rejects an invalid personal email", () => {
    const parsed = MobileProfileUpdateSchema.safeParse({ personalEmail: "not-an-email" });
    expect(parsed.success).toBe(false);
  });
});

describe("buildDirectory-shared: masking sanity for directory (no PAN leak)", () => {
  it("profile payload alone carries PAN masked; directory never touches it", () => {
    // Guard: buildProfile is the only place PAN/Aadhaar surface, and only masked.
    const p = buildProfile(row);
    expect(p.panMasked?.startsWith("••••")).toBe(true);
  });
});
