export const EVENT_TYPE_COLORS = [
  "indigo",
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
] as const;

export type EventTypeColor = (typeof EVENT_TYPE_COLORS)[number];

export const DEFAULT_EVENT_TYPE_COLOR: EventTypeColor = "indigo";

/**
 * Display hex per palette token. Tuned to read well on the dark canvas
 * (#0e1117). Consumed by the swatch UI in Phase 3c. indigo and sky sit
 * closest to the Indigo Signal brand primary and secondary.
 */
export const EVENT_TYPE_COLOR_HEX: Record<EventTypeColor, string> = {
  indigo: "#818cf8",
  sky: "#38bdf8",
  emerald: "#34d399",
  amber: "#fbbf24",
  rose: "#fb7185",
  violet: "#a78bfa",
};
