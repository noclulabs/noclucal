import { beforeEach, describe, expect, it, vi } from "vitest";

describe("register-all", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers the Google provider when imported", async () => {
    // Import the registry AND register-all from the same post-reset module
    // graph. `vi.resetModules()` busts the import cache, so a statically
    // imported `getProvider` would bind to a different registry instance
    // than the one `register-all` writes into. Dynamic import after the
    // reset keeps both on the same instance.
    const { _resetRegistryForTests, getProvider } = await import(
      "@/lib/calendar/providers"
    );
    _resetRegistryForTests();
    await import("@/lib/calendar/providers/register-all");
    expect(getProvider("google").id).toBe("google");
  });
});
