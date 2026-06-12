import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The `server-only` marker throws outside a React Server environment, so it
// is stubbed here the way `googleapis` is stubbed in the provider tests. The
// guard itself is exercised by `pnpm build`, not by this suite.
vi.mock("server-only", () => ({}));

import { Resend } from "resend";

import {
  _resetResendClientForTests,
  getResendClient,
  requireEmailFrom,
  requireResendApiKey,
} from "@/lib/email/client";

const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

describe("email client", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
    }
    _resetResendClientForTests();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    _resetResendClientForTests();
  });

  describe("requireResendApiKey", () => {
    it("throws when RESEND_API_KEY is unset", () => {
      delete process.env.RESEND_API_KEY;
      expect(() => requireResendApiKey()).toThrow("RESEND_API_KEY is not set");
    });

    it("throws when RESEND_API_KEY is an empty string", () => {
      process.env.RESEND_API_KEY = "";
      expect(() => requireResendApiKey()).toThrow("RESEND_API_KEY is not set");
    });

    it("returns the value when RESEND_API_KEY is set", () => {
      process.env.RESEND_API_KEY = "re_test_key";
      expect(requireResendApiKey()).toBe("re_test_key");
    });
  });

  describe("requireEmailFrom", () => {
    it("throws when EMAIL_FROM is unset", () => {
      delete process.env.EMAIL_FROM;
      expect(() => requireEmailFrom()).toThrow("EMAIL_FROM is not set");
    });

    it("throws when EMAIL_FROM is an empty string", () => {
      process.env.EMAIL_FROM = "";
      expect(() => requireEmailFrom()).toThrow("EMAIL_FROM is not set");
    });

    it("returns the value when EMAIL_FROM is set", () => {
      process.env.EMAIL_FROM = "noCluCal <bookings@cal.noclulabs.com>";
      expect(requireEmailFrom()).toBe("noCluCal <bookings@cal.noclulabs.com>");
    });
  });

  describe("getResendClient", () => {
    it("returns a Resend client without any network call", () => {
      process.env.RESEND_API_KEY = "re_test_key";
      // Construction is the only side effect; `new Resend(...)` opens no
      // socket, so this passes with a dummy key and no network.
      expect(getResendClient()).toBeInstanceOf(Resend);
    });

    it("memoizes the client across calls", () => {
      process.env.RESEND_API_KEY = "re_test_key";
      expect(getResendClient()).toBe(getResendClient());
    });

    it("throws on first use when RESEND_API_KEY is missing", () => {
      delete process.env.RESEND_API_KEY;
      expect(() => getResendClient()).toThrow("RESEND_API_KEY is not set");
    });
  });
});
