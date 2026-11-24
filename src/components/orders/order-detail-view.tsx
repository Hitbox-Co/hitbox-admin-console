"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CreditCard,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Phone,
  Truck,
  Undo2,
  User,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAdminOrder, useUpdateOrderStatus } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Mono,
  Panel,
  PanelHeader,
  Skeleton,
  Textarea,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { PackingPanel } from "./packing-panel";
import { OrderMoneyPanel, RequestRefundDialog } from "./order-money-panel";
import { OrderHistory, ShipmentCard, ShipmentForm } from "./shipment-ui";
import { RefundBanner } from "./refund-banner";
import type {
  AdminOrderDetail,
  OrderAddress,
  OrderSkuUnit,
  SettableOrderStatus,
} from "@/lib/types";

/**
 * One order, as a page: where it is, what it holds, who it is for, how it
 * was paid — and the one next step.
 *
 * Two rules from admin-write-apis.md §2 shape the action panel:
 *
 *  1. The buttons come from `allowedTransitions`, which the server
 *     precomputes. Hardcoding the lifecycle would mean discovering the rule by
 *     getting a 400, and would drift the moment the graph changes.
 *  2. PAID and REFUNDED never appear there — they are written by the payment
 *     and refund pipelines. An operator setting them would decouple the order
 *     from the transaction that justifies it.
 *
 * Buyer identity and money are present only with buyer-profile:read and
 * payment-royalty:read; their sections are absent, never blank, without them.
 */

const ALLOCATION_TONE: Record<string, "positive" | "warning" | "neutral"> = {
  ALLOCATED: "positive",
  HELD: "warning",
  RELEASED: "neutral",
};

const ALLOCATION_HELP: Record<string, string> = {
  ALLOCATED: "Settled — this unit belongs to the order.",
  HELD: "A temporary hold while payment is pending; a sweeper releases it at the expiry.",
  RELEASED: "The hold expired or the order was cancelled; the unit went back to stock.",
};

/** What each transition button says and does, in the operator's words. */
const TRANSITION_COPY: Record<
  string,
  { verb: string; help: string; icon: React.ComponentType<{ className?: string }> }
> = {
  PROCESSING: { verb: "Start processing", help: "Picking and packing has begun.", icon: Package },
  SHIPPED: { verb: "Mark as shipped", help: "Handed to the carrier. Add the tracking details.", icon: Truck },
  DELIVERED: { verb: "Mark as delivered", help: "The buyer has received it.", icon: PackageCheck },
  CANCELLED: { verb: "Cancel order", help: "Releases any held units back to stock. A reason is required.", icon: Ban },
};

export function OrderDetailView({ orderId }: { orderId: string }) {
  const query = useAdminOrder(orderId);
  const order = query.data;

  usePageChrome({
    title: order ? order.productName : "Order",
    description: order ? `Order ${shortRef(order.id)} · placed ${formatDateTime(order.placedAt)}` : undefined,
  });

  if (query.isLoading) return <DetailSkeleton />;
  if (query.isError || !order) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackLink />
      <RefundBanner order={order} />
      <Header order={order} />
      <Progress order={order} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <PackingPanel order={order} />
          <ShipmentCard order={order} />
          <ItemsPanel order={order} />
          {order.addresses.length ? <AddressesPanel addresses={order.addresses} /> : null}
          <OrderMoneyPanel order={order} />
          <OrderHistory order={order} />
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <ActionsPanel order={order} onConflict={() => query.refetch()} />
          {order.buyerEmail ? <CustomerPanel order={order} /> : null}
          <DetailsPanel order={order} />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function shortRef(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function BackLink() {
  return (
    <Link
      href="/orders"
      className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All orders
    </Link>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Tooltip content={done ? "Copied" : `Copy ${label}`}>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            toast.error("Could not copy to the clipboard.");
          }
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
      >
        {done ? <Check className="h-3.5 w-3.5 text-[var(--positive)]" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({ order }: { order: AdminOrderDetail }) {
  const perms = usePermissions();
  const canOpenDrop = perms.canOpen("/products/detail");

  return (
    <Panel className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={toneForStatus(order.status)} dot>
              {humanize(order.status)}
            </Badge>
            <span className="flex items-center gap-1 text-[12px] text-[var(--text-3)]">
              Order <Mono className="text-[11px]" title={order.id}>{shortRef(order.id)}</Mono>
              <CopyButton value={order.id} label="order id" />
            </span>
            {order.archivedAt ? <Badge tone="neutral" outline>Archived</Badge> : null}
          </div>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
            {canOpenDrop ? (
              <Link
                href={`/products/${order.productId}`}
                className="inline-flex items-center gap-1 hover:underline"
              >
                {order.productName}
                <ArrowUpRight className="h-4 w-4 text-[var(--text-3)]" aria-hidden />
              </Link>
            ) : (
              order.productName
            )}
          </h2>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-3)]">
            <Mono className="text-[10.5px]">{order.productCode}</Mono>
            <span>
              {order.quantity} unit{order.quantity === 1 ? "" : "s"}
            </span>
            {order.market ? <span>{order.market.name}</span> : null}
            <span>Placed {formatDateTime(order.placedAt)}</span>
          </p>
        </div>

        {order.amount && order.currency ? (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">Total</p>
            <p className="tnum text-[24px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              {formatCurrency(order.amount, order.currency)}
            </p>
            {order.unitPrice && order.quantity > 1 ? (
              <p className="tnum text-[11.5px] text-[var(--text-3)]">
                {order.quantity} × {formatCurrency(order.unitPrice, order.currency)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Progress — where the order is in its life                           */
/* ------------------------------------------------------------------ */

const FLOW = ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
const FLOW_LABEL: Record<(typeof FLOW)[number], string> = {
  PENDING_PAYMENT: "Placed",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

function Progress({ order }: { order: AdminOrderDetail }) {
  const ended = order.status === "CANCELLED" || order.status === "REFUNDED";
  const reached = FLOW.indexOf(order.status as (typeof FLOW)[number]);
  // A cancelled/refunded order shows how far it got before it stopped.
  const lastReached = ended
    ? order.deliveredAt
      ? 4
      : order.shippedAt
        ? 3
        : order.paidAt || (order.payments ?? []).some((p) => /SUCCE|CAPTUR|PAID/i.test(p.status))
          ? 1
          : 0
    : reached;

  const when: Partial<Record<(typeof FLOW)[number], string | null>> = {
    PENDING_PAYMENT: order.placedAt,
    // Filled in when payment settles (it used to stay null).
    PAID: order.paidAt ?? null,
    SHIPPED: order.shippedAt,
    DELIVERED: order.deliveredAt,
  };

  return (
    <Panel className="px-4 py-4 sm:px-5">
      <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
        {FLOW.map((s, i) => {
          const done = i < lastReached || (i === lastReached && (ended || s === "DELIVERED"));
          const current = !ended && i === lastReached && s !== "DELIVERED";
          return (
            <li key={s} className="relative flex flex-col items-center text-center">
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2",
                    i <= lastReached ? "bg-[var(--positive)]" : "bg-[var(--hairline-strong)]"
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
                  done
                    ? "border-[var(--positive)] bg-[var(--positive)] text-white"
                    : current
                      ? "border-[var(--accent)] bg-[var(--surface-1)] text-[var(--accent-text)]"
                      : "border-[var(--hairline-strong)] bg-[var(--surface-1)] text-[var(--text-3)]"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "mt-1.5 text-[11.5px]",
                  current ? "font-medium text-[var(--text-1)]" : done ? "text-[var(--text-2)]" : "text-[var(--text-3)]"
                )}
              >
                {FLOW_LABEL[s]}
              </span>
              {when[s] ? (
                <span className="tnum text-[10.5px] text-[var(--text-3)]">{formatDateTime(when[s] ?? null)}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {ended ? (
        <p
          className={cn(
            "mt-3 flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12px]",
            order.status === "CANCELLED"
              ? "bg-[var(--danger-dim)] text-[var(--danger)]"
              : "bg-[var(--info-dim)] text-[var(--info)]"
          )}
        >
          {order.status === "CANCELLED" ? <Ban className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />}
          {order.status === "CANCELLED"
            ? "This order was cancelled. Any held units went back to stock."
            : order.shippedAt
              ? "This order was refunded through the payments pipeline."
              : "Refunded before it shipped — the unit went straight back on sale."}
        </p>
      ) : null}
      {order.status === "PENDING_PAYMENT" ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-[8px] bg-[var(--warning-dim)] px-3 py-2 text-[12px] text-[var(--text-2)]">
          <CreditCard className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
          <span>
            Unpaid checkout. The unit is held for a short while; if payment doesn&rsquo;t arrive the
            hold is released and the order is cancelled automatically by the checkout sweep. A late
            card payment still settles if nobody else took the unit.
          </span>
        </p>
      ) : null}
      {/* The legacy note only when there's no shipment record to show. */}
      {order.trackingNote && !order.shipment ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-[8px] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--text-2)]">
          <Truck className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
          <span>
            <span className="text-[var(--text-3)]">Tracking: </span>
            {order.trackingNote}
          </span>
        </p>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Actions — the next step                                             */
/*                                                                      */
/* Ship comes from canRecordShipment (allowedTransitions never offers   */
/* SHIPPED any more); Delivered and an unpaid cancel come from          */
/* allowedTransitions; a PAID / PROCESSING order is cancelled by        */
/* refunding it (ORDERS_CANCEL_REQUIRES_REFUND).                        */
/* ------------------------------------------------------------------ */

function ActionsPanel({ order, onConflict }: { order: AdminOrderDetail; onConflict: () => void }) {
  const perms = usePermissions();
  const update = useUpdateOrderStatus(order.id);
  const [pending, setPending] = React.useState<SettableOrderStatus | null>(null);
  const [shipping, setShipping] = React.useState(false);
  const [refunding, setRefunding] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const canManage = perms.can("order", "manage");
  const forward = order.allowedTransitions.filter((s) => s !== "CANCELLED" && s !== "SHIPPED");
  const canCancelUnpaid = order.allowedTransitions.includes("CANCELLED");
  const paidNotShipped = order.status === "PAID" || order.status === "PROCESSING";
  // A paid order is cancelled by refunding it. Offered to refund-capable
  // callers; money.canRequestRefund is the server's word when present.
  const canRefund = order.money
    ? order.money.canRequestRefund
    : perms.hasAction("order", "refund", "global");
  const openRefundId = order.money?.openRefundId ?? null;
  const waitingForScan = paidNotShipped && !order.unitAssignedAt;

  const commit = () => {
    if (!pending) return;
    if (pending === "CANCELLED" && !reason.trim()) return;
    update.mutate(
      { status: pending, reason: reason.trim() || undefined },
      {
        onSuccess: (detail) => {
          toast.success(`Order marked ${humanize(detail.status).toLowerCase()}`);
          setPending(null);
          setReason("");
        },
        onError: (err) => {
          // 409: another operator (or a payment) moved it first.
          if (err instanceof ApiError && err.status === 409) {
            toast.error("The order changed at that moment. Reloaded with the latest.");
            onConflict();
            setPending(null);
            return;
          }
          if (err instanceof ApiError && err.code === "ORDERS_CANCEL_REQUIRES_REFUND") {
            setPending(null);
            setRefunding(true);
            return;
          }
          toast.error(err instanceof ApiError ? err.friendly : "Could not update the order.");
        },
      }
    );
  };

  const nothing =
    !order.canRecordShipment && forward.length === 0 && !canCancelUnpaid && !(paidNotShipped && (canRefund || openRefundId));

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Next step" />
      <div className="space-y-3 px-4 py-3">
        {shipping ? (
          <>
            <p className="text-[12.5px] text-[var(--text-2)]">
              <strong className="font-medium text-[var(--text-1)]">Ship this order.</strong> Enter what the
              carrier gave you — the buyer sees the carrier, number and link.
            </p>
            <ShipmentForm orderId={order.id} compact onDone={() => setShipping(false)} onCancel={() => setShipping(false)} />
          </>
        ) : pending ? (
          <>
            <p className="text-[12.5px] text-[var(--text-2)]">
              <strong className="font-medium text-[var(--text-1)]">
                {TRANSITION_COPY[pending]?.verb ?? humanize(pending)}?
              </strong>{" "}
              {TRANSITION_COPY[pending]?.help}
            </p>
            <Field
              label={pending === "CANCELLED" ? "Reason for cancelling" : "Reason"}
              htmlFor="status-reason"
              required={pending === "CANCELLED"}
              hint={
                pending === "DELIVERED"
                  ? "What you checked — recorded on the order's history."
                  : "Recorded on the order's history."
              }
            >
              <Textarea
                id="status-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={pending === "DELIVERED" ? "Carrier shows delivered on 21 Oct" : "Customer requested"}
                autoFocus
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button
                variant={pending === "CANCELLED" ? "danger" : "primary"}
                size="sm"
                loading={update.isPending}
                disabled={pending === "CANCELLED" && !reason.trim()}
                onClick={commit}
              >
                {pending === "CANCELLED" ? "Cancel order" : "Confirm"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                Back
              </Button>
            </div>
          </>
        ) : !canManage ? (
          <p className="text-[12px] text-[var(--text-3)]">
            You can view this order. Moving it on needs order:manage.
          </p>
        ) : nothing ? (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--text-3)]">
            <CheckCircle2 className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
            {order.status === "DELIVERED"
              ? "Delivered — nothing left to do."
              : order.status === "PENDING_PAYMENT"
                ? "Waiting for payment. The payments pipeline moves it to Paid."
                : waitingForScan
                  ? "Waiting for the physical unit to be scanned at packing."
                  : `No step is available from ${humanize(order.status).toLowerCase()}.`}
          </p>
        ) : (
          <>
            {order.canRecordShipment ? (
              <button
                type="button"
                onClick={() => setShipping(true)}
                className="pressable flex w-full items-start gap-3 rounded-[8px] border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2.5 text-left"
              >
                <Truck className="mt-[1px] h-4 w-4 shrink-0 text-[var(--text-2)]" />
                <span>
                  <span className="block text-[13px] font-medium text-[var(--text-1)]">Ship (add tracking)</span>
                  <span className="block text-[11.5px] text-[var(--text-3)]">
                    Record the carrier and tracking number — that&rsquo;s what marks it shipped.
                  </span>
                </span>
              </button>
            ) : null}

            {forward.map((s, i) => {
              const c = TRANSITION_COPY[s];
              const Icon = c?.icon ?? PackageCheck;
              const first = i === 0 && !order.canRecordShipment;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPending(s)}
                  className={cn(
                    "pressable flex w-full items-start gap-3 rounded-[8px] border px-3 py-2.5 text-left transition-colors",
                    first
                      ? "border-[var(--accent)] bg-[var(--accent-dim)] hover:bg-[var(--accent-dim)]"
                      : "border-[var(--hairline)] bg-[var(--surface-2)] hover:border-[var(--hairline-strong)]"
                  )}
                >
                  <Icon className="mt-[1px] h-4 w-4 shrink-0 text-[var(--text-2)]" />
                  <span>
                    <span className="block text-[13px] font-medium text-[var(--text-1)]">
                      {c?.verb ?? humanize(s)}
                    </span>
                    <span className="block text-[11.5px] text-[var(--text-3)]">{c?.help}</span>
                  </span>
                </button>
              );
            })}

            {waitingForScan ? (
              <p className="flex items-start gap-1.5 rounded-[8px] bg-[var(--warning-dim)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-2)]">
                <Truck className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
                Shipping unlocks once the physical unit is scanned at packing.
              </p>
            ) : null}

            {canCancelUnpaid ? (
              <Button variant="ghost" size="sm" className="text-[var(--danger)]" onClick={() => setPending("CANCELLED")}>
                <Ban className="h-3.5 w-3.5" />
                Cancel order
              </Button>
            ) : paidNotShipped && openRefundId && perms.canOpen("/payments/refunds") ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/payments/refunds/${openRefundId}`}>
                  <Undo2 className="h-3.5 w-3.5" />
                  Refund in progress
                </Link>
              </Button>
            ) : paidNotShipped && canRefund ? (
              <Button variant="ghost" size="sm" className="text-[var(--danger)]" onClick={() => setRefunding(true)}>
                <Ban className="h-3.5 w-3.5" />
                Cancel &amp; refund
              </Button>
            ) : null}
          </>
        )}
      </div>

      {refunding ? (
        <RequestRefundDialog
          order={order}
          onClose={() => setRefunding(false)}
          preset={{
            title: "Cancel & refund",
            description:
              "The buyer has paid, so cancelling means paying them back. When the refund is processed the order becomes Refunded and — because it never shipped — the unit goes straight back on sale.",
            reasonCode: "BUYER_CHANGED_MIND",
            reason: "Cancelled before packing",
            physicalReturnRequired: false,
          }}
        />
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Items — the drop and the physical units                             */
/* ------------------------------------------------------------------ */

function ItemsPanel({ order }: { order: AdminOrderDetail }) {
  const units = order.skuUnits;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Items"
        description={
          units.length
            ? `${units.length} serialized unit${units.length === 1 ? "" : "s"} attached to this order.`
            : "No serialized units are attached yet."
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{order.productName}</p>
          <Mono className="text-[10.5px]">{order.productCode}</Mono>
        </div>
        <div className="tnum text-right text-[12.5px] text-[var(--text-2)]">
          {order.quantity} ×{" "}
          {order.unitPrice && order.currency ? formatCurrency(order.unitPrice, order.currency) : "—"}
          {order.amount && order.currency ? (
            <p className="text-[13px] font-medium text-[var(--text-1)]">
              {formatCurrency(order.amount, order.currency)}
            </p>
          ) : null}
        </div>
      </div>
      {units.length ? (
        <ul className="divide-y divide-[var(--hairline)]">
          {units.map((u) => (
            <UnitRow key={u.skuId} unit={u} />
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function UnitRow({ unit: u }: { unit: OrderSkuUnit }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text-1)]">
          <span className="font-mono">{u.skuCode}</span>
          <CopyButton value={u.skuCode} label="unit code" />
          <span className="text-[var(--text-3)]">#{u.serialNumber}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {u.tagId ? <Mono className="text-[10px]">{u.tagId}</Mono> : (
            <span className="text-[10.5px] text-[var(--text-3)]">No tag bound</span>
          )}
          {u.tagLifecycleState ? (
            <Badge tone={toneForStatus(u.tagLifecycleState)} className="px-1 py-0 text-[10px]">
              {humanize(u.tagLifecycleState)}
            </Badge>
          ) : null}
          {u.claimedStatus ? (
            <Badge tone={toneForStatus(u.claimedStatus)} className="px-1 py-0 text-[10px]">
              {humanize(u.claimedStatus)}
            </Badge>
          ) : null}
          {u.resaleBlocked ? (
            <Badge tone="danger" className="px-1 py-0 text-[10px]">
              Resale blocked
            </Badge>
          ) : null}
        </p>
        {u.reservationExpiresAt && u.allocation === "HELD" ? (
          <p className="mt-0.5 text-[10.5px] text-[var(--warning)]">
            Hold expires {formatDateTime(u.reservationExpiresAt)}
          </p>
        ) : null}
      </div>
      <Tooltip content={ALLOCATION_HELP[u.allocation] ?? u.allocation}>
        <span>
          <Badge tone={ALLOCATION_TONE[u.allocation] ?? "neutral"}>{humanize(u.allocation)}</Badge>
        </span>
      </Tooltip>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

function formatAddress(a: OrderAddress) {
  return [a.recipientName, a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(", "), a.countryCode]
    .filter(Boolean)
    .join("\n");
}

function AddressesPanel({ addresses }: { addresses: OrderAddress[] }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Addresses" />
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {addresses.map((a, i) => (
          <div
            key={`${a.usage}-${i}`}
            className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                <MapPin className="h-3 w-3" aria-hidden />
                {humanize(a.usage)}
                {a.labelCustom || a.label ? (
                  <span className="normal-case tracking-normal">· {a.labelCustom ?? humanize(a.label ?? "")}</span>
                ) : null}
              </p>
              <CopyButton value={formatAddress(a)} label="address" />
            </div>
            <p className="mt-1 text-[13px] font-medium text-[var(--text-1)]">{a.recipientName}</p>
            <p className="text-[12.5px] leading-relaxed text-[var(--text-2)]">
              {a.line1}
              {a.line2 ? <><br />{a.line2}</> : null}
              <br />
              {[a.city, a.state, a.postalCode].filter(Boolean).join(", ")}
              <br />
              {a.countryCode}
            </p>
            {a.phone ? (
              <a
                href={`tel:${a.phone}`}
                className="mt-1 inline-flex items-center gap-1 text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)]"
              >
                <Phone className="h-3 w-3" aria-hidden />
                {a.phone}
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Side rail                                                           */
/* ------------------------------------------------------------------ */

function CustomerPanel({ order }: { order: AdminOrderDetail }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Customer" />
      <div className="space-y-1.5 px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-1)]">
          <User className="h-3.5 w-3.5 text-[var(--text-3)]" aria-hidden />
          {order.buyerName || "No name on file"}
        </p>
        <p className="flex items-center gap-1 text-[12.5px]">
          <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
          <a href={`mailto:${order.buyerEmail}`} className="ml-1 truncate text-[var(--accent-text)] hover:underline">
            {order.buyerEmail}
          </a>
          <CopyButton value={order.buyerEmail ?? ""} label="email" />
        </p>
      </div>
    </Panel>
  );
}

function DetailsPanel({ order }: { order: AdminOrderDetail }) {
  const rows: [string, React.ReactNode][] = [
    [
      "Market",
      order.market ? `${order.market.name} (${order.market.code} · ${order.market.currency})` : "—",
    ],
    ...(order.amount ? ([["Gateway", order.gateway ? humanize(order.gateway) : "—"]] as [string, React.ReactNode][]) : []),
    ["Placed", formatDateTime(order.placedAt)],
    ["Shipped", formatDateTime(order.shippedAt)],
    ["Delivered", formatDateTime(order.deliveredAt)],
    ["Terms accepted", formatDateTime(order.termsAcceptedAt)],
    ["Last updated", formatDateTime(order.updatedAt)],
  ];
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Details" />
      <dl className="divide-y divide-[var(--hairline)]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2">
            <dt className="shrink-0 text-[12px] text-[var(--text-3)]">{k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-[var(--text-1)]">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-72 w-full rounded-xl xl:col-span-2" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
