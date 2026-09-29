import type { ReleaseApproval } from "@/lib/types";

/**
 * May this drop's edition be minted yet? (drop-approval-lifecycle.md §10)
 *
 * Minting waits for the same clearance publication waits for: the owner has
 * approved it, OR there is no owner to ask.
 *
 *   no artist AND no organization  → cleared, no review needed
 *   anything else, no review yet   → blocked: never submitted
 *   anything else, review PENDING  → blocked: awaiting its owner
 *   anything else, review REJECTED → blocked, quoting the rejection note
 *   anything else, review APPROVED → cleared
 *
 * "unknown" is not "blocked": a caller without release-approval:read cannot
 * see the review, so the button stays offered and the server's
 * SKUS_NOT_APPROVED answers for it. This is a courtesy check — the server is
 * the gate.
 */
export interface MintGate {
  state: "cleared" | "blocked" | "unknown";
  reason: string | null;
  /** The review that is blocking, for a link straight to it. */
  approvalId: string | null;
}

export function isOwnedDrop(p: { artistId: string | null; organizationId: string | null }) {
  return !!(p.artistId || p.organizationId);
}

export function mintGate(
  product: { artistId: string | null; organizationId: string | null },
  latest: ReleaseApproval | null | undefined,
  canReadReviews: boolean
): MintGate {
  if (!isOwnedDrop(product)) return { state: "cleared", reason: null, approvalId: null };
  if (!canReadReviews || latest === undefined) {
    return { state: "unknown", reason: null, approvalId: null };
  }
  if (latest === null) {
    return {
      state: "blocked",
      reason: "This drop has never been submitted for review. Units can be minted once its owner approves it.",
      approvalId: null,
    };
  }
  if (latest.status === "APPROVED") {
    return { state: "cleared", reason: null, approvalId: latest.id };
  }
  if (latest.status === "REJECTED") {
    return {
      state: "blocked",
      reason: `Review v${latest.version} was rejected${
        latest.comment ? `: “${latest.comment}”` : "."
      } Resubmit it and get it approved before minting.`,
      approvalId: latest.id,
    };
  }
  return {
    state: "blocked",
    reason: `Review v${latest.version} is waiting on the owner's approval. Units can be minted once it is approved.`,
    approvalId: latest.id,
  };
}
