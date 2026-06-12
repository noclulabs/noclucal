import "server-only";

import { Resend } from "resend";

// Resend client management, mirroring the lazy, side-effect-free shape of
// src/lib/db/index.ts and src/lib/queue/connection.ts. Importing this module
// has zero side effects: no client is constructed until a function here is
// called, and a missing RESEND_API_KEY or EMAIL_FROM throws only at first
// use, never at import time. This is load-bearing because Next.js's
// build-time module collection imports route modules transitively without
// the email env vars set, and an eager read would crash the build.
//
// The `server-only` import makes any accidental client-bundle import a build
// error, so the API key can never reach the browser.

let _client: Resend | undefined;

export function requireResendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return key;
}

/**
 * The verified sender address, for example `noCluCal <bookings@cal.noclulabs.com>`.
 * Must be a sender on a domain verified in Resend.
 */
export function requireEmailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is not set");
  }
  return from;
}

/**
 * The memoized Resend client. Constructing `new Resend(...)` makes no network
 * call, so first use stays side-effect-free until an actual send happens.
 */
export function getResendClient(): Resend {
  if (!_client) {
    _client = new Resend(requireResendApiKey());
  }
  return _client;
}

/** Clears the memoized client so tests can vary the env between cases. */
export function _resetResendClientForTests(): void {
  _client = undefined;
}
