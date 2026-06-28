import { describe, it, expect } from "vitest";
import { commandKey, missingCommands } from "@/lib/attendance/device-command-diff";

describe("commandKey", () => {
  it("is stable per device+pin+type", () => {
    expect(commandKey({ device_id: "d1", pin: "5", cmd_type: "upsert_user" })).toBe(
      "d1|5|upsert_user"
    );
  });
});

describe("missingCommands", () => {
  it("returns only commands not already pending", () => {
    const desired = [
      { device_id: "d1", pin: "5", cmd_type: "upsert_user" as const },
      { device_id: "d1", pin: "6", cmd_type: "upsert_user" as const },
    ];
    const existing = new Set(["d1|5|upsert_user"]);
    expect(missingCommands(desired, existing)).toEqual([
      { device_id: "d1", pin: "6", cmd_type: "upsert_user" },
    ]);
  });
  it("dedupes duplicates within the desired list", () => {
    const desired = [
      { device_id: "d1", pin: "5", cmd_type: "upsert_user" as const },
      { device_id: "d1", pin: "5", cmd_type: "upsert_user" as const },
    ];
    expect(missingCommands(desired, new Set())).toHaveLength(1);
  });
});
