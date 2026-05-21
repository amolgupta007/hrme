import { describe, it, expect } from "vitest";
import { redactPII } from "@/lib/assistant/redact";

describe("redactPII", () => {
  it("replaces email addresses with <EMAIL>", () => {
    expect(redactPII("contact john@acme.co")).toBe("contact <EMAIL>");
  });

  it("replaces ₹ amounts with <AMOUNT>", () => {
    expect(redactPII("salary is ₹95,200")).toBe("salary is <AMOUNT>");
  });

  it("replaces Rs and INR amounts with <AMOUNT>", () => {
    expect(redactPII("salary is Rs 5000")).toBe("salary is <AMOUNT>");
    expect(redactPII("salary is INR 5000")).toBe("salary is <AMOUNT>");
  });

  it("replaces Indian phone numbers with <PHONE>", () => {
    expect(redactPII("call 9876543210")).toBe("call <PHONE>");
  });

  it("redacts mixed PII in a single sentence", () => {
    expect(
      redactPII("email john@acme.co amount ₹95,200 phone 9876543210"),
    ).toBe("email <EMAIL> amount <AMOUNT> phone <PHONE>");
  });

  it("is idempotent: running twice on mixed input produces the same result", () => {
    const input = "email john@acme.co amount ₹95,200 phone 9876543210";
    const once = redactPII(input);
    const twice = redactPII(once);
    // Tokens like <EMAIL>, <PHONE>, <AMOUNT> must not be re-mangled
    expect(twice).toBe(once);
    expect(twice).toBe("email <EMAIL> amount <AMOUNT> phone <PHONE>");
  });

  it("returns empty string unchanged and passes through text with no PII", () => {
    expect(redactPII("")).toBe("");
    expect(redactPII("hello world no pii here")).toBe("hello world no pii here");
  });
});
