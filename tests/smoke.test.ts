import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest is wired correctly", () => {
    expect(1 + 1).toBe(2);
  });

  it("can resolve the @ path alias", async () => {
    const mod = await import("@/lib/version");
    expect(mod.PROJECT_NAME).toBe("noCluCal");
  });
});
