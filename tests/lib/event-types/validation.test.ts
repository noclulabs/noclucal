import { describe, expect, it } from "vitest";
import {
  eventTypeInputSchema,
  slugify,
  RESERVED_SLUGS,
} from "@/lib/event-types/validation";
import { DEFAULT_EVENT_TYPE_COLOR } from "@/lib/event-types/colors";

/** A minimal valid input: only the fields without a default. */
function base() {
  return {
    name: "Intro call",
    slug: "intro-call",
    durationMinutes: 30,
  };
}

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Intro Call")).toBe("intro-call");
  });

  it("strips punctuation", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("collapses runs of separators", () => {
    expect(slugify("multiple   spaces")).toBe("multiple-spaces");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("--Leading and trailing--")).toBe("leading-and-trailing");
  });

  it("handles mixed case and symbols together", () => {
    expect(slugify("  MiXeD_CaSe & Symbols  ")).toBe("mixed-case-symbols");
  });
});

describe("eventTypeInputSchema", () => {
  it("accepts a fully specified valid input", () => {
    const result = eventTypeInputSchema.safeParse({
      name: "Intro call",
      slug: "intro-call",
      description: "A short intro",
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      minNoticeMinutes: 120,
      maxFutureMinutes: 43200,
      slotGranularityMinutes: 30,
      color: "sky",
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults when optional fields are omitted", () => {
    const result = eventTypeInputSchema.safeParse(base());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.bufferBeforeMinutes).toBe(0);
    expect(result.data.bufferAfterMinutes).toBe(0);
    expect(result.data.minNoticeMinutes).toBe(0);
    expect(result.data.maxFutureMinutes).toBe(86400);
    expect(result.data.slotGranularityMinutes).toBe(15);
    expect(result.data.color).toBe(DEFAULT_EVENT_TYPE_COLOR);
    expect(result.data.enabled).toBe(true);
  });

  it("coerces numeric strings (as posted by a form)", () => {
    const result = eventTypeInputSchema.safeParse({
      ...base(),
      durationMinutes: "45",
      bufferBeforeMinutes: "5",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.durationMinutes).toBe(45);
    expect(result.data.bufferBeforeMinutes).toBe(5);
  });

  it("treats description as optional and nullable", () => {
    const omitted = eventTypeInputSchema.safeParse(base());
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.description).toBeUndefined();

    const nulled = eventTypeInputSchema.safeParse({
      ...base(),
      description: null,
    });
    expect(nulled.success).toBe(true);
    if (nulled.success) expect(nulled.data.description).toBeNull();

    const present = eventTypeInputSchema.safeParse({
      ...base(),
      description: "Hello",
    });
    expect(present.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = eventTypeInputSchema.safeParse({ ...base(), name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects reserved slugs", () => {
    for (const slug of RESERVED_SLUGS) {
      const result = eventTypeInputSchema.safeParse({ ...base(), slug });
      expect(result.success).toBe(false);
    }
  });

  it("rejects badly formatted slugs", () => {
    for (const slug of ["Intro", "intro call", "-intro", "intro-", "intro_call"]) {
      const result = eventTypeInputSchema.safeParse({ ...base(), slug });
      expect(result.success, slug).toBe(false);
    }
  });

  it("rejects zero or negative duration", () => {
    for (const durationMinutes of [0, -5]) {
      const result = eventTypeInputSchema.safeParse({
        ...base(),
        durationMinutes,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects minimum notice that is not less than maximum future", () => {
    const equal = eventTypeInputSchema.safeParse({
      ...base(),
      minNoticeMinutes: 1000,
      maxFutureMinutes: 1000,
    });
    expect(equal.success).toBe(false);
    if (!equal.success) {
      expect(equal.error.issues[0].path).toEqual(["minNoticeMinutes"]);
    }

    const greater = eventTypeInputSchema.safeParse({
      ...base(),
      minNoticeMinutes: 2000,
      maxFutureMinutes: 1000,
    });
    expect(greater.success).toBe(false);
  });

  it("rejects a color outside the palette", () => {
    const result = eventTypeInputSchema.safeParse({
      ...base(),
      color: "fuchsia",
    });
    expect(result.success).toBe(false);
  });
});
