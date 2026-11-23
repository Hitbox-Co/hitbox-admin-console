/**
 * Serial numbers as an artist types them: "1, 7, 40-45". A tier stores the
 * expanded, sorted, de-duplicated list; this is the round trip.
 */

export interface ParsedSerials {
  serials: number[];
  /** Human messages for the bits that didn't parse or are out of range. */
  errors: string[];
}

export function parseSerials(text: string, totalSupply: number, max = 1000): ParsedSerials {
  const out = new Set<number>();
  const errors: string[] = [];
  for (const raw of text.split(/[\s,;]+/).filter(Boolean)) {
    const token = raw.replace(/^#/, "");
    const range = token.match(/^(\d+)\s*[-–]\s*#?(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a < 1 || b < a) {
        errors.push(`"${raw}" isn't a range`);
        continue;
      }
      if (b - a + 1 > max) {
        errors.push(`"${raw}" is more than ${max} units`);
        continue;
      }
      for (let n = a; n <= b; n++) out.add(n);
    } else if (/^\d+$/.test(token)) {
      out.add(Number(token));
    } else {
      errors.push(`"${raw}" isn't a serial number`);
    }
  }
  const serials = [...out].sort((a, b) => a - b);
  const outside = serials.filter((n) => n < 1 || n > totalSupply);
  if (outside.length) {
    errors.push(
      `${outside.slice(0, 5).map((n) => `#${n}`).join(", ")}${outside.length > 5 ? "…" : ""} ${
        outside.length === 1 ? "is" : "are"
      } outside 1–${totalSupply}`
    );
  }
  if (serials.length > max) errors.push(`At most ${max} units per tier (${serials.length} given)`);
  return { serials, errors };
}

/** [1,2,3,7,40,41] → "1-3, 7, 40-41" — the editable form. */
export function formatSerials(serials: number[]): string {
  const sorted = [...serials].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i];
    parts.push(end > start ? `${start}-${end}` : String(start));
  }
  return parts.join(", ");
}

/** "#042" — padded to the drop's own width, as printed on the unit. */
export function serialLabel(n: number, totalSupply: number): string {
  return `#${String(n).padStart(Math.max(3, String(totalSupply).length), "0")}`;
}

/** "#001, #007, #040–#041" — for display. */
export function describeSerials(serials: number[], totalSupply: number, limit = 12): string {
  const ranges = formatSerials(serials).split(", ").filter(Boolean);
  const shown = ranges.slice(0, limit).map((r) => {
    const [a, b] = r.split("-").map(Number);
    return b ? `${serialLabel(a, totalSupply)}–${serialLabel(b, totalSupply)}` : serialLabel(a, totalSupply);
  });
  return shown.join(", ") + (ranges.length > limit ? ` +${ranges.length - limit} more` : "");
}

/** Serials in `next` but not `prev`, and in `prev` but not `next` — what the lock rule checks. */
export function serialDiff(prev: number[], next: number[]): { added: number[]; removed: number[] } {
  const a = new Set(prev);
  const b = new Set(next);
  return {
    added: next.filter((n) => !a.has(n)),
    removed: prev.filter((n) => !b.has(n)),
  };
}
