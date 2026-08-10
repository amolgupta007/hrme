import { describe, it, expect } from "vitest";
import { buildDirectory, type DirectoryEmployeeRow } from "@/lib/mobile/directory-payload";

describe("buildDirectory", () => {
  const rows: DirectoryEmployeeRow[] = [
    {
      id: "e1",
      first_name: "Ravi",
      last_name: "Kumar",
      email: "ravi@acme.com",
      phone: "+919000000000",
      role: "manager",
      avatar_url: "https://x/a.jpg",
      departments: { name: "Sales" },
    },
    {
      id: "e2",
      first_name: "asha",
      last_name: "n",
      email: null,
      phone: null,
      role: "employee",
      avatar_url: null,
      departments: null,
    },
  ];

  it("projects employee-safe fields with initials, department and role badge", () => {
    const out = buildDirectory(rows);
    expect(out[0]).toEqual({
      id: "e1",
      name: "Ravi Kumar",
      initials: "RK",
      department: "Sales",
      roleBadge: "manager",
      avatarUrl: "https://x/a.jpg",
      email: "ravi@acme.com",
      phone: "+919000000000",
    });
  });

  it("uppercases initials and tolerates missing dept/contact", () => {
    const out = buildDirectory(rows);
    expect(out[1].initials).toBe("AN");
    expect(out[1].department).toBeNull();
    expect(out[1].email).toBeNull();
    expect(out[1].phone).toBeNull();
  });

  it("never leaks salary/PAN (shape has no such keys)", () => {
    const out = buildDirectory(rows);
    const keys = Object.keys(out[0]);
    expect(keys).not.toContain("ctc");
    expect(keys).not.toContain("salary");
    expect(keys).not.toContain("pan_number");
  });
});
