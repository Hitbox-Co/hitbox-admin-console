import type { BadgeTone } from "@/components/ui/primitives";

/**
 * What an open refund is waiting on, in the operator's words — derived from
 * the refund's own fields (order-payments-and-refunds-api.md §5), so every
 * screen that highlights a refund says the same thing about it.
 *
 *   AWAITING_ITEM    the item must come back first (money never moves before)
 *   READY_TO_APPROVE item is back, or no return is needed — decide
 *   READY_TO_PAY     approved — pay it back
 *   CLOSED           processed or rejected
 */
export type RefundStage = "AWAITING_ITEM" | "READY_TO_APPROVE" | "READY_TO_PAY" | "CLOSED";

export const OPEN_REFUND_STATUSES = ["REQUESTED", "AWAITING_RETURN", "APPROVED"] as const;

interface StageInput {
  status: string;
  physicalReturnRequired: boolean;
  physicalReturnConfirmedAt: string | null;
}

export function refundStage(r: StageInput): RefundStage {
  if (r.status === "APPROVED") return "READY_TO_PAY";
  if (r.status === "REQUESTED" || r.status === "AWAITING_RETURN") {
    return r.physicalReturnRequired && !r.physicalReturnConfirmedAt ? "AWAITING_ITEM" : "READY_TO_APPROVE";
  }
  return "CLOSED";
}

export const isOpenRefund = (r: { status: string }) =>
  (OPEN_REFUND_STATUSES as readonly string[]).includes(r.status);

export const STAGE_COPY: Record<
  RefundStage,
  { label: string; short: string; next: string; help: string; tone: BadgeTone }
> = {
  AWAITING_ITEM: {
    label: "Awaiting the item",
    short: "Return pending",
    next: "Confirm item received",
    help: "The buyer has to send it back. When it arrives, record the NFC tag's condition.",
    tone: "warning",
  },
  READY_TO_APPROVE: {
    label: "Ready to approve",
    short: "Refund to approve",
    next: "Review & approve",
    help: "The item is back (or no return is needed). Approve or reject it.",
    tone: "accent",
  },
  READY_TO_PAY: {
    label: "Ready to pay back",
    short: "Refund to pay",
    next: "Pay back",
    help: "Approved. Paying it back refunds the buyer and closes the order as refunded.",
    tone: "positive",
  },
  CLOSED: {
    label: "Closed",
    short: "Refund closed",
    next: "View",
    help: "Processed or rejected.",
    tone: "neutral",
  },
};

/** Whole days since an ISO instant. */
export function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
