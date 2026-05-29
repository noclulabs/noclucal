import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM token encryption for at-rest storage of OAuth tokens in
 * `calendar_connections`. Output format is `v1:base64nonce:base64ciphertext`,
 * where the ciphertext blob includes the 16-byte GCM auth tag appended to
 * the raw ciphertext.
 *
 * The `v1:` version prefix enables future key rotation: a new key would
 * produce `v2:...` ciphertext, and decryption can dispatch on the version
 * to find the right key without a schema change.
 *
 * Key sourcing: `process.env.TOKEN_ENCRYPTION_KEY` (base64-encoded 32 bytes).
 * Loaded lazily on first use; module import has no side effects.
 */

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const VERSION = "v1";

/**
 * Loads the encryption key from the environment. Throws with a clear
 * message if missing or the wrong length. Does not include any key
 * material in the error.
 */
function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.local (or the deploy environment).",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). Regenerate with \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}

/**
 * Encrypts a plaintext token for storage. Returns a string in the format
 * `v1:base64nonce:base64ciphertext`. Each call uses a fresh random nonce,
 * so the same plaintext encrypts to a different output every time.
 *
 * Throws if TOKEN_ENCRYPTION_KEY is unset or malformed.
 */
export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([ciphertext, authTag]);
  return `${VERSION}:${nonce.toString("base64")}:${combined.toString("base64")}`;
}

/**
 * Decrypts a ciphertext string produced by `encryptToken`. Throws if:
 * - the string does not have exactly three colon-separated parts
 * - the version prefix is not recognized (only `v1` currently supported)
 * - the nonce is not the expected length
 * - the ciphertext is too short to contain the auth tag
 * - the auth tag verification fails (tampering or wrong key)
 * - TOKEN_ENCRYPTION_KEY is unset or malformed
 *
 * Callers should treat any thrown error as "this token cannot be used";
 * the typical response in route code is to delete the connection row
 * and surface a reconnect-required UX.
 */
export function decryptToken(ciphertext: string): string {
  const key = loadKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected three colon-separated parts");
  }
  const [version, nonceB64, combinedB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported ciphertext version: ${version}`);
  }
  const nonce = Buffer.from(nonceB64, "base64");
  if (nonce.length !== NONCE_BYTES) {
    throw new Error(
      `Invalid nonce length: expected ${NONCE_BYTES} bytes, got ${nonce.length}`,
    );
  }
  const combined = Buffer.from(combinedB64, "base64");
  if (combined.length < AUTH_TAG_BYTES) {
    throw new Error(
      `Ciphertext too short: expected at least ${AUTH_TAG_BYTES} bytes for the auth tag`,
    );
  }
  const ct = combined.subarray(0, combined.length - AUTH_TAG_BYTES);
  const authTag = combined.subarray(combined.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
