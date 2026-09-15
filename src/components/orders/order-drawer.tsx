"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { PackageCheck, RotateCw, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAdminOrder, useUpdateOrderStatus } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize } from "@/lib/format";
import {
  Badge,
  Button,
  Field,
  Mono,
  Panel,
  Skeleton,
  Textarea,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import type { OrderSkuUnit, SettableOrderStatus } from "@/lib/types";

/**
 * Order detail + the status change.
 *
 * Two rules from admin-write-apis.md §2 that shape this whole component:
 *
 *  1. The action buttons come from `allowedTransitions`, which the server
 *     precomputes. Hardcoding the lifecycle here would mean discovering the
 *     rule by getting a 400, and would drift the moment the graph changes.
 *  2. PAID and REFUNDED never appear there — they are written by the payment
 *     and refund pipelines. An operator typing them would decouple the order
 *     from the transaction that justifies it.
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

export function OrderDrawer({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const query = useAdminOrder(orderId);
  const update = useUpdateOrderStatus(orderId);
  const order = query.data;

  /** Which transition the operator is confirming, if any. */
  const [pending, setPending] = React.useState<SettableOrderStatus | null>(null);
  const [reason, setReason] = React.useState("");
  const [trackingNote, setTrackingNote] = React.useState("");

  const commit = () => {
    if (!pending) return;
    if (pending === "CANCELLED" && !reason.trim()) return;

    update.mutate(
      {
        status: pending,
        reason: pending === "CANCELLED" ? reason.trim() : undefined,
        trackingNote: trackingNote.trim() || undefined,
      },
      {
        onSuccess: (detail) => {
          toast.success(`Order marked ${humanize(detail.status).toLowerCase()}`);
          setPending(null);
          setReason("");
          setTrackingNote("");
        },
        onError: (err) => {
          // 409 is the concurrent-edit case: another operator moved it first.
          // Retrying would fight them, so the copy asks for a reload instead.
          if (err instanceof ApiError && err.status === 409) {
            toast.error("Someone else changed this order. Reloading it now.");
            query.refetch();
            setPending(null);
            return;
          }
          toast.error(err instanceof ApiError ? err.friendly : "Could not update the order.");
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[620px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {order ? order.productName : "Order"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                <Mono className="text-[10px]">{orderId}</Mono>
                {order ? (
                  <Badge tone={toneForStatus(order.status)} dot>
                    {humanize(order.status)}
                  </Badge>
                ) : null}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {query.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-[8px]" />
                ))}
              </div>
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            ) : order ? (
              <>
                <Facts
                  rows={[
                    ["Drop", `${order.productName} · ${order.productCode}`],
                    ["Quantity", String(order.quantity)],
                    [
                      "Market",
                      order.market
                        ? `${order.market.name} (${order.market.code}, ${order.market.currency})`
                        : "—",
                    ],
                    // Buyer identity only with buyer-profile:read — the keys
                    // are absent otherwise, never blank.
                    ...(order.buyerEmail
                      ? ([["Buyer", `${order.buyerName ?? ""} ${order.buyerEmail}`.trim()]] as [
                          string,
                          string,
                        ][])
                      : []),
                    // …and money only with payment-royalty:read.
                    ...(order.amount && order.currency
                      ? ([
                          ["Amount", formatCurrency(order.amount, order.currency)],
                          ...(order.unitPrice
                            ? ([
                                [
                                  "Unit price",
                                  formatCurrency(order.unitPrice, order.currency),
                                ],
                              ] as [string, string][])
                            : []),
                          ["Gateway", order.gateway ?? "—"],
                        ] as [string, string][])
                      : []),
                    ["Placed", formatDateTime(order.placedAt)],
                    ["Shipped", formatDateTime(order.shippedAt)],
                    ["Delivered", formatDateTime(order.deliveredAt)],
                    ...(order.trackingNote
                      ? ([["Tracking", order.trackingNote]] as [string, string][])
                      : []),
                  ]}
                />

                {order.addresses.length ? (
                  <Panel>
                    <SectionTitle>Addresses</SectionTitle>
                    <div className="space-y-2 p-3 pt-0">
                      {order.addresses.map((a, i) => (
                        <div
                          key={`${a.usage}-${i}`}
                          className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                            {humanize(a.usage)}
                          </p>
                          <p className="mt-1 text-[13px] text-[var(--text-1)]">
                            {a.recipientName}
                          </p>
                          <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
                            {[a.line1, a.line2, a.city, a.state, a.postalCode, a.countryCode]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                          {a.phone ? (
                            <p className="mt-0.5 text-[12px] text-[var(--text-3)]">{a.phone}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </Panel>
                ) : null}

                <SkuUnits units={order.skuUnits} />

                {order.payments?.length ? (
                  <Panel>
                    <SectionTitle>Payments</SectionTitle>
                    <ul className="divide-y divide-[var(--hairline)]">
                      {order.payments.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <Badge tone={toneForStatus(p.status)} dot>
                              {humanize(p.status)}
                            </Badge>
                            <span className="ml-2 text-[11px] text-[var(--text-3)]">
                              {p.gateway ?? "—"} · {formatDateTime(p.createdAt)}
                            </span>
                          </div>
                          <span className="tnum text-[12px] font-medium text-[var(--text-1)]">
                            {formatCurrency(p.amount, p.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ) : null}
              </>
            ) : null}
          </div>

          {order ? (
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              {pending === "CANCELLED" ? (
                <Field
                  label="Reason for cancelling"
                  htmlFor="cancel-reason"
                  hint="Required — the API rejects a cancellation without one."
                >
                  <Textarea
                    id="cancel-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Customer requested"
                  />
                </Field>
              ) : pending === "SHIPPED" ? (
                <Field
                  label="Tracking note"
                  htmlFor="tracking-note"
                  hint="Optional — carrier and consignment number."
                >
                  <Textarea
                    id="tracking-note"
                    rows={2}
                    value={trackingNote}
                    onChange={(e) => setTrackingNote(e.target.value)}
                    placeholder="DHL 7741…"
                  />
                </Field>
              ) : null}

              {pending ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={update.isPending}
                    disabled={pending === "CANCELLED" && !reason.trim()}
                    onClick={commit}
                  >
                    Confirm {humanize(pending).toLowerCase()}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
                    Back
                  </Button>
                </div>
              ) : order.allowedTransitions.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-[var(--text-3)]">Move to</span>
                  {order.allowedTransitions.map((s) => (
                    <Button
                      key={s}
                      variant={s === "CANCELLED" ? "danger" : "secondary"}
                      size="sm"
                      onClick={() => {
                        // DELIVERED and PROCESSING need no extra input, so
                        // they could commit straight away — but a two-step
                        // confirm keeps every transition equally deliberate.
                        setPending(s);
                      }}
                    >
                      <PackageCheck className="h-3.5 w-3.5" />
                      {humanize(s)}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                  <RotateCw className="h-3 w-3" aria-hidden />
                  No status change is available from {humanize(order.status)}.
                  {order.status === "PENDING_PAYMENT" || order.status === "PAID"
                    ? " Payment states are written by the payments pipeline."
                    : ""}
                </p>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
      {children}
    </p>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <Panel>
      <dl className="divide-y divide-[var(--hairline)]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="shrink-0 text-[12px] text-[var(--text-3)]">{k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-[var(--text-1)]">
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/**
 * The answer to "which physical items is this order holding". Allocation wins
 * over a hold for the same SKU, so an order for 3 with 1 settled and 2 pending
 * is three rows, not five.
 */
function SkuUnits({ units }: { units: OrderSkuUnit[] }) {
  if (!units.length) return null;

  return (
    <Panel>
      <SectionTitle>SKU units ({units.length})</SectionTitle>
      <ul className="divide-y divide-[var(--hairline)]">
        {units.map((u) => (
          <li key={u.skuId} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium text-[var(--text-1)]">
                {u.skuCode} <span className="text-[var(--text-3)]">#{u.serialNumber}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {u.tagId ? <Mono className="text-[10px]">{u.tagId}</Mono> : null}
                {u.tagLifecycleState ? (
                  <Badge tone={toneForStatus(u.tagLifecycleState)} className="px-1 py-0 text-[10px]">
                    {humanize(u.tagLifecycleState)}
                  </Badge>
                ) : null}
                {u.resaleBlocked ? (
                  <Badge tone="danger" className="px-1 py-0 text-[10px]">
                    Resale blocked
                  </Badge>
                ) : null}
              </p>
              {u.reservationExpiresAt ? (
                <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
                  Hold expires {formatDateTime(u.reservationExpiresAt)}
                </p>
              ) : null}
            </div>
            <Tooltip content={ALLOCATION_HELP[u.allocation] ?? u.allocation}>
              <span>
                <Badge tone={ALLOCATION_TONE[u.allocation] ?? "neutral"}>
                  {humanize(u.allocation)}
                </Badge>
              </span>
            </Tooltip>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
