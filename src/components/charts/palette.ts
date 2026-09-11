/**
 * Chart palette.
 *
 * Validated with the dataviz validator against the chart surface #16171C
 * (dark mode). Slot 1 is the brand accent so single-series charts stay
 * on-brand; slots 2+ are the reference hues, in the order that clears the
 * CVD gates.
 *
 *   node scripts/validate_palette.js \
 *     "#5E6AD2,#d95926,#199e70,#c98500,#d55181" --mode dark --surface "#16171C"
 *   -> lightness band PASS · chroma PASS · CVD adjacent dE 8.4 PASS
 *      normal-vision dE 19.3 PASS · contrast >= 3:1 PASS
 *
 * Assign these in fixed order, never cycled. Past six series, fold the tail
 * into "Other" or facet into small multiples - never generate a new hue.
 */
export const SERIES = [
  "#5E6AD2", // 1 · brand accent
  "#d95926", // 2 · orange
  "#199e70", // 3 · aqua
  "#c98500", // 4 · yellow
  "#d55181", // 5 · magenta
  "#9085e9", // 6 · violet
] as const;

/** Sequential ramp (one hue, light -> dark) for magnitude comparisons. */
export const SEQUENTIAL = [
  "#c7ccf0",
  "#a5adee",
  "#8590e2",
  "#6e79d6",
  "#5E6AD2",
  "#4650a8",
] as const;

/**
 * Status colors are RESERVED for state and never reused as "series 4".
 * They always ship with a label, never color alone.
 */
export const STATUS = {
  good: "#4ea674",
  warning: "#c99a3f",
  serious: "#cc5c5c",
  info: "#4d8bbf",
  neutral: "#4b5563",
} as const;

export const CHART_INK = {
  surface: "#16171C",
  grid: "rgba(255,255,255,0.06)",
  axis: "#6B7280",
  text: "#9CA3AF",
  strong: "#F7F8F8",
} as const;

/** Sequential step for a value's position in a ranked list. */
export function sequentialStep(index: number, total: number): string {
  if (total <= 1) return SEQUENTIAL[4];
  const t = index / (total - 1);
  const i = Math.round(t * (SEQUENTIAL.length - 1));
  return SEQUENTIAL[SEQUENTIAL.length - 1 - i];
}
