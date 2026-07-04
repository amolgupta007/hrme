import { describe, it, expect } from "vitest";
import {
  extractPlaceholders,
  collectPlaceholders,
  unknownPlaceholders,
  applyVariables,
} from "@/lib/documents/variables";

describe("placeholder extraction", () => {
  it("extracts unique {{tokens}} tolerant of whitespace", () => {
    expect(extractPlaceholders("Hi {{employee_name}}, role {{ designation }} {{employee_name}}"))
      .toEqual(["employee_name", "designation"]);
  });

  it("collects across many bodies", () => {
    expect(collectPlaceholders(["{{a}}", "{{b}} {{a}}"]).sort()).toEqual(["a", "b"]);
  });

  it("flags placeholders not in the declared registry", () => {
    const declared = ["employee_name", "ctc"];
    expect(unknownPlaceholders(["{{employee_name}} {{salary}}"], declared)).toEqual(["salary"]);
    expect(unknownPlaceholders(["{{ctc}}"], declared)).toEqual([]);
  });
});

describe("applyVariables", () => {
  it("substitutes known values", () => {
    expect(applyVariables("Dear {{employee_name}}", { employee_name: "Priya" }))
      .toBe("Dear Priya");
  });

  it("leaves unresolved tokens visible as [token]", () => {
    expect(applyVariables("CTC {{ctc}}", {})).toBe("CTC [ctc]");
    expect(applyVariables("CTC {{ctc}}", { ctc: "" })).toBe("CTC [ctc]");
  });
});
