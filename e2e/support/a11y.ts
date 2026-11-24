import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * Axe, scoped to the rules worth failing a build over.
 *
 * WCAG 2.1 A and AA only. "best-practice" is excluded on purpose: it flags
 * house-style choices (heading order inside a card, region landmarks around a
 * data table) that are opinions, and mixing opinions into a gate teaches
 * people to ignore the gate.
 */
export async function scan(page: Page, opts: { disable?: string[] } = {}) {
  const builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
  if (opts.disable?.length) builder.disableRules(opts.disable);
  return builder.analyze();
}

/** A one-line summary per violation — a bare count tells nobody what to fix. */
export function describeViolations(
  violations: { id: string; impact?: string | null; nodes: unknown[]; help: string }[]
) {
  return violations
    .map((v) => `  [${v.impact ?? "n/a"}] ${v.id} — ${v.help} (${v.nodes.length} node(s))`)
    .join("\n");
}
