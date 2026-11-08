import type { RoyaltyRule, RoyaltySplit } from "@/lib/types";

/**
 * Reads the splits out of a rule's `splitConfig`.
 *
 * `splitConfig` is an untyped JSON column and the server's own reader
 * (`splitsOf` in packages/finance/src/domain/royalty-calculation.ts) is
 * deliberately forgiving: anything that is not `{ splits: [...] }` falls back
 * to the single `percentage` column, and an individual split naming no payee
 * is skipped rather than defaulted, so a malformed config never quietly pays
 * the wrong party.
 *
 * This mirrors those rules exactly. Trusting the column's shape here would
 * mean a rule written by an older version of the API crashing the rules
 * table rather than rendering as the single-percentage deal it is.
 */
export function splitsOf(rule: Pick<RoyaltyRule, "splitConfig">): RoyaltySplit[] {
  const config = rule.splitConfig as { splits?: unknown } | null | undefined;
  const raw = Array.isArray(config?.splits) ? config.splits : [];

  const out: RoyaltySplit[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;

    const percentage = item.percentage;
    if (typeof percentage !== "number" && typeof percentage !== "string") continue;

    const payeeType = item.payeeType === "ORGANIZATION" ? "ORGANIZATION" : "ARTIST";
    const artistId = typeof item.artistId === "string" ? item.artistId : null;
    const organizationId =
      typeof item.organizationId === "string" ? item.organizationId : null;

    // A split that names no payee cannot be paid to anyone; the server skips
    // it, so showing it here would describe terms that will not be honoured.
    if (payeeType === "ARTIST" && !artistId) continue;
    if (payeeType === "ORGANIZATION" && !organizationId) continue;

    out.push({ payeeType, artistId, organizationId, percentage });
  }
  return out;
}

/**
 * What a rule applies to, in the order the accrual service resolves it:
 * product beats collection beats artist beats organization.
 *
 * A rule scoped to nothing at all would be the platform-wide default, and the
 * create DTO refuses one — so "Unscoped" here means a row written before that
 * refusal existed, not a normal state.
 */
export function ruleScopeLabel(rule: Pick<RoyaltyRule, "scope">): {
  label: string;
  id: string | null;
} {
  const s = rule.scope;
  if (s.productId) return { label: "One drop", id: s.productId };
  if (s.collectionId) return { label: "A collection", id: s.collectionId };
  if (s.artistId) return { label: "An artist", id: s.artistId };
  if (s.organizationId) return { label: "An organization", id: s.organizationId };
  return { label: "Unscoped", id: null };
}

/**
 * Totals a set of splits the way the server does before refusing them.
 *
 * Returned as a string so the caller can show the exact figure the API would
 * quote back. Splits totalling more than 100% are refused with
 * FINANCE_INVALID_RULE — the cost of that typo is money paid out that the
 * platform never took in.
 */
export function totalPercentage(splits: { percentage: string | number }[]): number {
  return splits.reduce((sum, s) => {
    const n = typeof s.percentage === "number" ? s.percentage : Number.parseFloat(s.percentage);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}
