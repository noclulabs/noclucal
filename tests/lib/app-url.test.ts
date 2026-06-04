import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAppOrigin } from "@/lib/app-url";

describe("app url", () => {
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

  describe("getAppOrigin", () => {
    it("returns the AUTH_URL value for a typical HTTPS URL", () => {
      process.env.AUTH_URL = "https://cal.noclulabs.com";
      expect(getAppOrigin()).toBe("https://cal.noclulabs.com");
    });

    it("returns the AUTH_URL value for a typical HTTP URL", () => {
      process.env.AUTH_URL = "http://localhost:3000";
      expect(getAppOrigin()).toBe("http://localhost:3000");
    });

    it("strips a single trailing slash", () => {
      process.env.AUTH_URL = "https://cal.noclulabs.com/";
      expect(getAppOrigin()).toBe("https://cal.noclulabs.com");
    });

    it("strips multiple trailing slashes", () => {
      process.env.AUTH_URL = "https://cal.noclulabs.com///";
      expect(getAppOrigin()).toBe("https://cal.noclulabs.com");
    });

    it("falls back to localhost when AUTH_URL is unset", () => {
      delete process.env.AUTH_URL;
      expect(getAppOrigin()).toBe("http://localhost:3000");
    });

    it("falls back to localhost when AUTH_URL is an empty string", () => {
      process.env.AUTH_URL = "";
      expect(getAppOrigin()).toBe("http://localhost:3000");
    });
  });
});
