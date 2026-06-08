import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, hashSha256 } from "@/lib/crypto/aes-gcm";

beforeAll(() => {
  // Predictable 32-byte key (base64) for test determinism
  process.env.RAZORPAYX_CRED_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
});

describe("AES-256-GCM encrypt/decrypt", () => {
  it("round-trips a plain string", () => {
    const plain = "rzp_test_AbCd1234XyZ";
    const cipher = encrypt(plain);
    expect(cipher).not.toBe(plain);
    expect(cipher).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/); // v1:iv:tag:cipher
    expect(decrypt(cipher)).toBe(plain);
  });

  it("produces a different ciphertext on every call (random IV)", () => {
    const c1 = encrypt("hello");
    const c2 = encrypt("hello");
    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe("hello");
    expect(decrypt(c2)).toBe("hello");
  });

  it("throws on tampered ciphertext (GCM auth tag fails)", () => {
    const cipher = encrypt("sensitive");
    const parts = cipher.split(":");
    parts[3] = Buffer.from("XXXXXXXXXXXX").toString("base64"); // corrupt
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when env var is missing", () => {
    const saved = process.env.RAZORPAYX_CRED_ENCRYPTION_KEY;
    delete process.env.RAZORPAYX_CRED_ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/RAZORPAYX_CRED_ENCRYPTION_KEY/);
    process.env.RAZORPAYX_CRED_ENCRYPTION_KEY = saved;
  });

  it("encrypt handles empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });
});

describe("hashSha256", () => {
  it("produces stable 64-char hex hash", () => {
    expect(hashSha256("test")).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
    expect(hashSha256("test")).toBe(hashSha256("test"));
  });
  it("different inputs → different hashes", () => {
    expect(hashSha256("a")).not.toBe(hashSha256("b"));
  });
});
