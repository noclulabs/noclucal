import { describe, expect, it } from "vitest";

import {
  DEFAULT_EVENT_TYPE_COLOR,
  EVENT_TYPE_COLORS,
  EVENT_TYPE_COLOR_HEX,
} from "@/lib/event-types/colors";

describe("event type colors", () => {
  it("has a hex for every palette token", () => {
    for (const color of EVENT_TYPE_COLORS) {
      expect(EVENT_TYPE_COLOR_HEX[color]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("only maps hexes for known palette tokens", () => {
    expect(Object.keys(EVENT_TYPE_COLOR_HEX).sort()).toEqual(
      [...EVENT_TYPE_COLORS].sort(),
    );
  });

  it("has a default color that is a member of the palette", () => {
    expect(EVENT_TYPE_COLORS).toContain(DEFAULT_EVENT_TYPE_COLOR);
  });
});
