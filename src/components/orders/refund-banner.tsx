"use client";

import Link from "next/link";
import { ArrowRight, Undo2 } from "lucide-react";
import { useOpenRefunds } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { STAGE_COPY, isOpenRefund, refundStage } from "@/lib/refunds";
import { usePermissions } from "@/components/layout/authz-provider";
import { Button } from "@/components/ui/primitives";
import type { AdminOrderDetail } from "@/lib/types";

/**
 * The first thing on an order with an open refund: what it is waiting on and
 * a button straight to the step. Reads the order's own `refunds` when the
 * caller sees money; otherwise falls back to the open-refunds queue.
 */
export function RefundBanner({ order }: { order: AdminOrderDetail }) {
  const perms = usePermissions();
  const canRefunds = perms.canOpen("/returns");
  // Only needed when the order detail carries no refunds of its own.
  const queue = useOpenRefunds(canRefunds && !order.refunds);

  const open =
    order.refunds?.find(isOpenRefund) ??
    queue.data?.items.find((r) => r.orderId === order.id);
  if (!open) return null;

  const stage = refundStage(open);
  const copy = STAGE_COPY[stage];
  const tone =
    stage === "AWAITING_ITEM"
      ? "border-[var(--warning)] bg-[var(--warning-dim)]"
      : stage === "READY_TO_PAY"
        ? "border-[var(--positive)] bg-[var(--positive-dim)]"
        : "border-[var(--accent)] bg-[var(--accent-dim)]";

  return (
    <div role="status" className={cn("flex flex-wrap items-center gap-3 rounded-xl border-2 px-4 py-3", tone)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-1)]">
        <Undo2 className="h-4 w-4 text-[var(--text-1)]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[var(--text-1)]">
          Refund in progress · {copy.label.toLowerCase()}
        </p>
        <p className="text-[12.5px] text-[var(--text-2)]">
          {formatCurrency(open.amount, open.currency)} · {humanize(open.reasonCode)} · requested{" "}
          {formatDateTime(open.createdAt)}
          {stage === "AWAITING_ITEM" ? " — the item has to come back before money moves." : ""}
        </p>
      </div>
      {canRefunds ? (
        <Button asChild variant={stage === "AWAITING_ITEM" ? "secondary" : "primary"} size="sm">
          <Link href={`/payments/refunds/${open.id}`}>
            {copy.next}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
