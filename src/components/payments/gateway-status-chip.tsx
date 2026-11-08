"use client";

import { humanize } from "@/lib/format";
import { Badge, Tooltip } from "@/components/ui/primitives";

/**
 * Stripe's view of a refund's money, separate from the workflow status
 * (order-payments-and-refunds-api.md §6.3). A PROCESSED refund with FAILED /
 * CANCELED here means the buyer was NOT paid back — nothing undoes itself;
 * an operator contacts the buyer and pays them another way.
 */
export function GatewayStatusChip({
  status,
  reason,
  processed,
}: {
  status: string | null | undefined;
  reason?: string | null;
  /** Only processed refunds have money in flight; skip the chip before that. */
  processed: boolean;
}) {
  if (!processed && !status) return null;
  switch (status) {
    case "SUCCEEDED":
      return <Badge tone="positive" dot>Refunded to card</Badge>;
    case "PENDING":
      return <Badge tone="warning" dot>On its way to card</Badge>;
    case "FAILED":
    case "CANCELED":
      return (
        <Tooltip content="The workflow finished but the money never reached the buyer. Contact them and pay them another way.">
          <span>
            <Badge tone="danger" dot>
              Failed at Stripe{reason ? `: ${humanize(reason).toLowerCase()}` : ""}
            </Badge>
          </span>
        </Tooltip>
      );
    default:
      return <Badge tone="neutral" dot>Waiting for Stripe</Badge>;
  }
}

export const refundFailedAtStripe = (r: { status: string; gatewayStatus?: string | null }) =>
  r.status === "PROCESSED" && (r.gatewayStatus === "FAILED" || r.gatewayStatus === "CANCELED");
