/**
 * Numeric interval helpers shared by the slot computation engine.
 *
 * Two callers use these. Availability window union runs in minutes from
 * midnight; busy overlap runs in epoch milliseconds. Both are plain numbers,
 * so one pair of helpers serves both without unit-specific code.
 */

export interface NumericInterval {
  start: number;
  end: number;
}

/**
 * Half-open overlap test. Intervals [start, end) overlap when each starts
 * strictly before the other ends. Touching at a boundary (a.end === b.start)
 * is not an overlap, so a slot ending exactly when a busy block starts is
 * still bookable.
 */
export function intervalsOverlap(
  a: NumericInterval,
  b: NumericInterval,
): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Merge overlapping or adjacent (touching) intervals into a minimal set,
 * sorted ascending by start. Adjacent windows merge so the union of
 * availability windows on a day has no artificial seams that would emit a
 * duplicate slot start.
 */
export function mergeIntervals(intervals: NumericInterval[]): NumericInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: NumericInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}
