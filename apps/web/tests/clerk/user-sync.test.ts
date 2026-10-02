import { describe, expect, it } from "vitest";
import { employeeUpdateFromClerk } from "@/lib/clerk/user-sync";

describe("employeeUpdateFromClerk (Clerk user.updated → employees)", () => {
  it("never blanks a name when Clerk has none (the Sameer/Sakshi bug)", () => {
    expect(employeeUpdateFromClerk({ first_name: null, last_name: "", image_url: null })).toEqual({});
    expect(employeeUpdateFromClerk({ first_name: "  ", last_name: undefined })).toEqual({});
  });
  it("syncs names Clerk does have, trimmed, independently", () => {
    expect(employeeUpdateFromClerk({ first_name: " Sakshi ", last_name: null })).toEqual({ first_name: "Sakshi" });
    expect(employeeUpdateFromClerk({ first_name: "Sakshi", last_name: "Madhikar" })).toEqual({ first_name: "Sakshi", last_name: "Madhikar" });
  });
  it("still syncs the avatar", () => {
    expect(employeeUpdateFromClerk({ image_url: "https://img.clerk.com/x" })).toEqual({ avatar_url: "https://img.clerk.com/x" });
  });
});

import { missingEmployeeIdentifiers } from "@/lib/clerk/user-sync";
import { normalizePhone } from "@/lib/phone";

describe("missingEmployeeIdentifiers (restore work email/phone on a login)", () => {
  const sakshi = { email: "sakshi@medialoop.in", phone: "+918600902984" };
  it("finds the email removed from a login (the Sakshi lockout)", () => {
    expect(
      missingEmployeeIdentifiers({ email_addresses: [], phone_numbers: [{ phone_number: "+918600902984" }] }, [sakshi], normalizePhone)
    ).toEqual([{ email: "sakshi@medialoop.in", phone: null }]);
  });
  it("reports nothing when both are present (case-insensitive), so re-adding can't loop", () => {
    expect(
      missingEmployeeIdentifiers(
        { email_addresses: [{ email_address: "Sakshi@Medialoop.in" }], phone_numbers: [{ phone_number: "+918600902984" }] },
        [sakshi],
        normalizePhone
      )
    ).toEqual([]);
  });
  it("ignores employees with no email or phone and de-duplicates across orgs", () => {
    expect(missingEmployeeIdentifiers({}, [{ email: null, phone: null }], normalizePhone)).toEqual([]);
    expect(missingEmployeeIdentifiers({}, [sakshi, sakshi], normalizePhone)).toHaveLength(1);
  });
});
