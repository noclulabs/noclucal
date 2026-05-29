import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "@/lib/calendar/crypto";

// Fresh 32-byte test key per file run. Decoupled from whatever is in
// .env.local so test outcomes never depend on the deployed key value.
const TEST_KEY = randomBytes(32).toString("base64");

describe("token encryption", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = savedKey;
    }
  });

  it("round-trips a non-empty ASCII string", () => {
    const plaintext = "ya29.a0AfB_byC-some-access-token";
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    expect(decryptToken(encryptToken(""))).toBe("");
  });

  it("round-trips unicode and multi-byte characters", () => {
    const plaintext = "héllo, 世界 🔐";
    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it("produces distinct ciphertexts for the same plaintext", () => {
    const plaintext = "same value";
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(plaintext);
    expect(decryptToken(b)).toBe(plaintext);
  });

  it("emits the v1 prefix with exactly two colons", () => {
    const out = encryptToken("anything");
    expect(out.startsWith("v1:")).toBe(true);
    expect(out.split(":")).toHaveLength(3);
  });

  it("rejects a tampered ciphertext blob", () => {
    const [version, nonceB64, combinedB64] = encryptToken("payload").split(":");
    const combined = Buffer.from(combinedB64, "base64");
    // Flip a byte in the ciphertext portion (before the 16-byte auth tag).
    combined[0] ^= 0xff;
    const tampered = `${version}:${nonceB64}:${combined.toString("base64")}`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const [version, nonceB64, combinedB64] = encryptToken("payload").split(":");
    const combined = Buffer.from(combinedB64, "base64");
    // Flip a byte inside the trailing 16-byte auth tag.
    combined[combined.length - 1] ^= 0xff;
    const tampered = `${version}:${nonceB64}:${combined.toString("base64")}`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects a tampered nonce", () => {
    const [version, nonceB64, combinedB64] = encryptToken("payload").split(":");
    const nonce = Buffer.from(nonceB64, "base64");
    nonce[0] ^= 0xff;
    const tampered = `${version}:${nonce.toString("base64")}:${combinedB64}`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects an unknown version prefix", () => {
    const [, nonceB64, combinedB64] = encryptToken("payload").split(":");
    const forged = `v2:${nonceB64}:${combinedB64}`;
    expect(() => decryptToken(forged)).toThrow(/version/i);
  });

  it("rejects a format with too few parts", () => {
    expect(() => decryptToken("v1:foo")).toThrow();
  });

  it("rejects a format with too many parts", () => {
    expect(() => decryptToken("v1:foo:bar:baz")).toThrow();
  });

  it("throws when the key is missing", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() => decryptToken("v1:foo:bar")).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it("throws when the key is the wrong length", () => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
    expect(() => decryptToken("v1:foo:bar")).toThrow(/32 bytes/);
  });

  it("fails to decrypt ciphertext bound to a different key", () => {
    const ciphertext = encryptToken("secret");
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptToken(ciphertext)).toThrow();
  });
});
