import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, hashSha256 } from "@/lib/crypto/aes-gcm";

beforeAll(() => {
  process.env.RAZORPAYX_CRED_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("integration round-trip with realistic RazorpayX cred shapes", () => {
  it("handles 32-char RazorpayX key_secret", () => {
    const secret = "xK7mN3pQ9vR2sT8uW1yZ4aB6cD0eF5gH"; // 32 chars
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("handles 14-char IFSC + 18-digit account number", () => {
    const ifsc = "FDRL0001234567";
    const account = "123456789012345678";
    expect(decrypt(encrypt(ifsc))).toBe(ifsc);
    expect(decrypt(encrypt(account))).toBe(account);
  });

  it("handles whitespace + special chars", () => {
    const raw = "  \tabc def\n!@#$%^&*()_+{}|:\"<>?[];',./`~";
    expect(decrypt(encrypt(raw))).toBe(raw);
  });

  it("ciphertext stays under 1KB for typical inputs", () => {
    const realistic = "rzp_test_1234567890123456:secretAbcdefghijklmnopqrstuvwxyz";
    expect(encrypt(realistic).length).toBeLessThan(1024);
  });

  it("hashSha256 is stable for IFSC + account number dedupe key", () => {
    const a = hashSha256("FDRL0001234567|123456789012345678");
    const b = hashSha256("FDRL0001234567|123456789012345678");
    expect(a).toBe(b);
  });
});
