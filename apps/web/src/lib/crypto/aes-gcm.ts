import { randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";

const ALG = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.RAZORPAYX_CRED_ENCRYPTION_KEY;
  if (!raw) throw new Error("RAZORPAYX_CRED_ENCRYPTION_KEY env var missing — set a 32-byte base64 key");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("RAZORPAYX_CRED_ENCRYPTION_KEY must decode to 32 bytes (AES-256)");
  return key;
}

/**
 * Encrypts plaintext with AES-256-GCM. Returns `v1:<iv>:<authTag>:<ciphertext>` base64-encoded segments.
 * IV is random per call → identical plaintexts produce distinct ciphertexts.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, cipherB64] = payload.split(":");
  if (version !== VERSION) throw new Error(`Unsupported ciphertext version: ${version}`);
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

/** Non-reversible hash for indexing / dedupe (e.g. bank account uniqueness checks). */
export function hashSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * True when RAZORPAYX_CRED_ENCRYPTION_KEY is present and well-formed. Callers
 * that would otherwise throw deep inside encrypt()/decrypt() (crashing a page
 * or server action — see the 2026-07-15 /dashboard/profile incident) should
 * check this first and degrade with a friendly error instead.
 */
export function isEncryptionConfigured(): boolean {
  const raw = process.env.RAZORPAYX_CRED_ENCRYPTION_KEY;
  if (!raw) return false;
  try {
    return Buffer.from(raw, "base64").length === 32;
  } catch {
    return false;
  }
}
