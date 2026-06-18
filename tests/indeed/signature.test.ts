import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyIndeedSignature } from "../../src/lib/indeed/signature";

const SECRET = "test-shared-secret";
const sign = (body: string) => createHmac("sha1", SECRET).update(body).digest("base64");

describe("verifyIndeedSignature", () => {
  it("accepts a correct signature", () => {
    const body = '{"id":"abc"}';
    expect(verifyIndeedSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = '{"id":"abc"}';
    expect(verifyIndeedSignature('{"id":"xyz"}', sign(body), SECRET)).toBe(false);
  });

  it("rejects a null/empty signature", () => {
    expect(verifyIndeedSignature("{}", null, SECRET)).toBe(false);
    expect(verifyIndeedSignature("{}", "", SECRET)).toBe(false);
  });
});
