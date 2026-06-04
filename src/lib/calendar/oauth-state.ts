import { randomBytes, timingSafeEqual } from "node:crypto";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/**
 * OAuth state cookie name. In production (HTTPS) we use the `__Host-`
 * prefix for strongest cookie integrity (Secure required, Path=/ required,
 * no Domain attribute). In dev, the `__Host-` prefix would be rejected by
 * the browser without HTTPS, so we use a plain name.
 */
export function getOAuthStateCookieName(): string {
  return process.env.AUTH_URL?.startsWith("https://")
    ? "__Host-noclucal-oauth-state"
    : "noclucal-oauth-state";
}

const STATE_BYTE_LENGTH = 32;
const COOKIE_MAX_AGE_SECONDS = 600;

/**
 * Generate a cryptographically random OAuth state value. Used as both
 * the `state` parameter in the authorization URL and the value of the
 * state cookie. base64url so the value is safe in both contexts.
 */
export function generateOAuthState(): string {
  return randomBytes(STATE_BYTE_LENGTH).toString("base64url");
}

/**
 * Build the cookie options for setting the OAuth state cookie on the
 * connect-route response. SameSite must be `lax` (not `strict`) because
 * the callback navigation from Google is cross-site top-level; `strict`
 * would drop the cookie on that navigation. Secure mirrors the AUTH_URL
 * scheme. Path is `/` for `__Host-` compliance in production.
 */
export function getOAuthStateCookieOptions(): Omit<
  ResponseCookie,
  "name" | "value"
> {
  const secure = process.env.AUTH_URL?.startsWith("https://") ?? false;
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * Constant-time equality check between the state from the callback's
 * query string and the state from the cookie. Returns false on length
 * mismatch (timingSafeEqual throws on length mismatch; we wrap that as
 * a quiet false to avoid leaking timing on length).
 */
export function validateOAuthState(
  stateFromQuery: string,
  stateFromCookie: string,
): boolean {
  if (stateFromQuery.length !== stateFromCookie.length) return false;
  return timingSafeEqual(
    Buffer.from(stateFromQuery),
    Buffer.from(stateFromCookie),
  );
}
