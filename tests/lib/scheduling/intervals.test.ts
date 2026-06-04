import { describe, expect, it } from "vitest";

import { intervalsOverlap, mergeIntervals } from "@/lib/scheduling/intervals";

describe("intervalsOverlap", () => {
  it("returns false for fully disjoint intervals", () => {
    expect(intervalsOverlap({ start: 0, end: 10 }, { start: 20, end: 30 })).toBe(
      false,
    );
  });

  it("returns false for intervals that touch at a boundary (half-open)", () => {
    // a.end === b.start: touching is not overlapping, so a slot ending
    // exactly when a busy block starts stays bookable.
    expect(intervalsOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(
      false,
    );
    expect(intervalsOverlap({ start: 10, end: 20 }, { start: 0, end: 10 })).toBe(
      false,
    );
  });

  it("returns true for a partial overlap", () => {
    expect(intervalsOverlap({ start: 0, end: 15 }, { start: 10, end: 25 })).toBe(
      true,
    );
  });

  it("returns true for full containment", () => {
    expect(intervalsOverlap({ start: 0, end: 100 }, { start: 40, end: 60 })).toBe(
      true,
    );
    expect(intervalsOverlap({ start: 40, end: 60 }, { start: 0, end: 100 })).toBe(
      true,
    );
  });

  it("returns true for identical intervals", () => {
    expect(intervalsOverlap({ start: 5, end: 15 }, { start: 5, end: 15 })).toBe(
      true,
    );
  });
});

describe("mergeIntervals", () => {
  it("returns an empty array for empty input", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("returns a single interval unchanged", () => {
    expect(mergeIntervals([{ start: 10, end: 20 }])).toEqual([
      { start: 10, end: 20 },
    ]);
  });

  it("keeps two disjoint intervals separate, sorted ascending", () => {
    expect(
      mergeIntervals([
        { start: 30, end: 40 },
        { start: 0, end: 10 },
      ]),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 40 },
    ]);
  });

  it("merges two overlapping intervals into one", () => {
    expect(
      mergeIntervals([
        { start: 0, end: 15 },
        { start: 10, end: 25 },
      ]),
    ).toEqual([{ start: 0, end: 25 }]);
  });

  it("merges two adjacent (touching) intervals into one", () => {
    // Adjacent windows merge so the union has no seam that would emit a
    // duplicate slot start.
    expect(
      mergeIntervals([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
      ]),
    ).toEqual([{ start: 0, end: 20 }]);
  });

  it("handles unsorted input", () => {
    expect(
      mergeIntervals([
        { start: 50, end: 60 },
        { start: 0, end: 10 },
        { start: 5, end: 8 },
        { start: 55, end: 70 },
      ]),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 50, end: 70 },
    ]);
  });

  it("absorbs a fully contained interval", () => {
    expect(
      mergeIntervals([
        { start: 0, end: 100 },
        { start: 40, end: 60 },
      ]),
    ).toEqual([{ start: 0, end: 100 }]);
  });
});
