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
