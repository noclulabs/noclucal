import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  generateOAuthState,
  getOAuthStateCookieName,
  getOAuthStateCookieOptions,
  validateOAuthState,
} from "@/lib/calendar/oauth-state";

describe("oauth state", () => {
  let savedAuthUrl: string | undefined;

  beforeEach(() => {
    savedAuthUrl = process.env.AUTH_URL;
  });

  afterEach(() => {
    if (savedAuthUrl === undefined) {
      delete process.env.AUTH_URL;
    } else {
      process.env.AUTH_URL = savedAuthUrl;
    }
  });

  describe("generateOAuthState", () => {
    it("returns a non-empty string", () => {
      expect(generateOAuthState().length).toBeGreaterThan(0);
    });

    it("returns a different value on each call", () => {
      expect(generateOAuthState()).not.toBe(generateOAuthState());
    });

    it("returns a base64url value (no padding, no + or /)", () => {
      expect(generateOAuthState()).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("decodes to exactly 32 bytes", () => {
      expect(Buffer.from(generateOAuthState(), "base64url")).toHaveLength(32);
    });
  });

  describe("validateOAuthState", () => {
    it("returns true for identical values", () => {
      const a = generateOAuthState();
      expect(validateOAuthState(a, a)).toBe(true);
    });

    it("returns false for same-length but different content", () => {
      const a = "a".repeat(43);
      const b = "b".repeat(43);
      expect(validateOAuthState(a, b)).toBe(false);
    });

    it("returns false for different lengths", () => {
      expect(validateOAuthState("short", "a-much-longer-value")).toBe(false);
    });
  });

  describe("getOAuthStateCookieName", () => {
    it("uses the __Host- prefix when AUTH_URL is https", () => {
      process.env.AUTH_URL = "https://cal.noclulabs.com";
      expect(getOAuthStateCookieName()).toBe("__Host-noclucal-oauth-state");
    });

    it("uses the plain name when AUTH_URL is http", () => {
      process.env.AUTH_URL = "http://localhost:3000";
      expect(getOAuthStateCookieName()).toBe("noclucal-oauth-state");
    });

    it("uses the plain name when AUTH_URL is unset", () => {
      delete process.env.AUTH_URL;
      expect(getOAuthStateCookieName()).toBe("noclucal-oauth-state");
    });
  });

  describe("getOAuthStateCookieOptions", () => {
    it("sets secure: true when AUTH_URL is https", () => {
      process.env.AUTH_URL = "https://cal.noclulabs.com";
      expect(getOAuthStateCookieOptions().secure).toBe(true);
    });

    it("sets secure: false when AUTH_URL is not https", () => {
      process.env.AUTH_URL = "http://localhost:3000";
      expect(getOAuthStateCookieOptions().secure).toBe(false);
    });

    it("always sets httpOnly, sameSite=lax, path=/, maxAge=600", () => {
      process.env.AUTH_URL = "https://cal.noclulabs.com";
      const options = getOAuthStateCookieOptions();
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe("lax");
      expect(options.path).toBe("/");
      expect(options.maxAge).toBe(600);
    });
  });
});
