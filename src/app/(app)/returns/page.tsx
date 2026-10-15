"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  PackageOpen,
  RefreshCw,
  Search,
  Send,
  Undo2,
} from "lucide-react";
import { useOpenRefunds, useOrdersByIds } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  STAGE_COPY,
  daysSince,
  refundStage,
  type RefundStage,
} from "@/lib/refunds";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Panel, Skeleton, Tooltip } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import type { AdminOrderDetail, Refund } from "@/lib/types";

/**
 * Returns & refunds — every open refund, grouped by what it is waiting on
 * (order-payments-and-refunds-api.md §5). The counterpart of Packing: nobody
 * should have to open an order to discover it needs a return.
 *
 *   Awaiting the item → Ready to approve → Ready to pay back
 *
 * Oldest first in each lane, with the product and buyer on the card, and the
 * card's button goes straight to the refund where the action lives. Live:
 * re-read every minute and when the window regains focus.
 */
export default function ReturnsPage() {
  return (
    <PageGuard can={(p) => p.canOpen("/returns")} what="Returns & refunds" requires="payment-royalty:read (platform-wide)">
      <ReturnsView />
    </PageGuard>
  );
}

const LANES: { stage: Exclude<RefundStage, "CLOSED">; icon: React.ComponentType<{ className?: string }> }[] = [
  { stage: "AWAITING_ITEM", icon: PackageOpen },
  { stage: "READY_TO_APPROVE", icon: BadgeCheck },
  { stage: "READY_TO_PAY", icon: Send },
];

function ReturnsView() {
  const perms = usePermissions();
  const canOrders = perms.canOpen("/orders");
  const query = useOpenRefunds();
  const [search, setSearch] = React.useState("");
  const [focus, setFocus] = React.useState<RefundStage | null>(null);

  usePageChrome({
    title: "Returns & refunds",
    description: "Open refunds by what they're waiting on — oldest first.",
  });

  const refunds = React.useMemo(() => query.data?.items ?? [], [query.data]);

  // Product and buyer live on the order, so read each order once (cached).
  const orderIds = React.useMemo(() => [...new Set(refunds.map((r) => r.orderId))].slice(0, 100), [refunds]);
  const orderQueries = useOrdersByIds(orderIds, canOrders);
  const orders = React.useMemo(() => {
    const m = new Map<string, AdminOrderDetail>();
    orderQueries.forEach((q, i) => {
      if (q.data) m.set(orderIds[i], q.data);
    });
    return m;
  }, [orderQueries, orderIds]);
  const loadingOrders = new Set(orderIds.filter((_, i) => orderQueries[i]?.isLoading));

  const needle = search.trim().toLowerCase();
  const visible = refunds.filter((r) => {
    if (!needle) return true;
    const o = orders.get(r.orderId);
    return [r.reason, r.reasonCode, r.orderId, o?.productName, o?.productCode, o?.buyerEmail, o?.buyerName]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  });

  const byStage = (stage: RefundStage) =>
    visible
      .filter((r) => refundStage(r) === stage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Panel>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Panel>
    );
  }

  const lanes = focus ? LANES.filter((l) => l.stage === focus) : LANES;

  return (
    <div className="space-y-4">
      <PageActions>
        <Button asChild variant="ghost" size="sm">
          <Link href="/payments/refunds">
            All refunds incl. closed
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </PageActions>

      {/* Stage tiles — click to focus one lane */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {LANES.map(({ stage, icon: Icon }) => {
          const list = refunds.filter((r) => refundStage(r) === stage);
          const oldest = list.reduce<number | null>((m, r) => Math.max(m ?? 0, daysSince(r.createdAt)), null);
          const copy = STAGE_COPY[stage];
          const active = focus === stage;
          return (
            <button
              key={stage}
              type="button"
              aria-pressed={active}
              onClick={() => setFocus(active ? null : stage)}
              className={cn(
                "pressable rounded-xl border px-4 py-3 text-left transition-colors",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                  : "border-[var(--hairline)] bg-[var(--surface-1)] hover:border-[var(--hairline-strong)]"
              )}
            >
              <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
                <Icon className="h-3.5 w-3.5" />
                {copy.label}
              </p>
              <p className="tnum mt-1 text-[28px] font-semibold leading-none text-[var(--text-1)]">{list.length}</p>
              <p className="mt-1.5 text-[11.5px] text-[var(--text-3)]">
                {list.length
                  ? `Oldest waiting ${oldest} day${oldest === 1 ? "" : "s"}`
                  : "Nothing waiting"}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search buyer, drop, reason or order"
            aria-label="Search open refunds"
            className="h-8 w-[300px] max-w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] pl-8 pr-2 text-[12.5px] text-[var(--text-1)]"
          />
        </div>
        {focus ? (
          <Button variant="ghost" size="sm" onClick={() => setFocus(null)}>
            Show all stages
          </Button>
        ) : null}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
          <RefreshCw className={cn("h-3 w-3", query.isFetching && "animate-spin")} />
          Updates every minute
        </span>
      </div>

      {query.data?.truncated ? (
        <p className="text-[11.5px] text-[var(--warning)]">
          Showing the first 100 per stage — open the full refunds list for the rest.
        </p>
      ) : null}

      {refunds.length === 0 ? (
        <Panel className="flex flex-col items-center px-6 py-14 text-center">
          <Undo2 className="h-6 w-6 text-[var(--text-3)]" />
          <p className="mt-2 text-[14px] font-medium text-[var(--text-1)]">No open refunds</p>
          <p className="mt-1 text-[12.5px] text-[var(--text-3)]">
            When a buyer or support raises a refund it appears here, by what it&rsquo;s waiting on.
          </p>
        </Panel>
      ) : (
        <div className={cn("grid grid-cols-1 gap-4", lanes.length === 3 && "xl:grid-cols-3")}>
          {lanes.map(({ stage, icon: Icon }) => {
            const list = byStage(stage);
            const copy = STAGE_COPY[stage];
            return (
              <section key={stage} className="min-w-0 space-y-2">
                <header className="flex items-center gap-2 px-1">
                  <Icon className="h-4 w-4 text-[var(--text-3)]" />
                  <h2 className="text-[13px] font-semibold text-[var(--text-1)]">{copy.label}</h2>
                  <Badge tone={copy.tone}>{list.length}</Badge>
                </header>
                <p className="px-1 text-[11.5px] text-[var(--text-3)]">{copy.help}</p>
                {list.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--hairline)] px-4 py-6 text-center text-[12px] text-[var(--text-3)]">
                    {needle ? "No match." : "Nothing here."}
                  </div>
                ) : (
                  list.map((r) => (
                    <RefundCard
                      key={r.id}
                      refund={r}
                      order={orders.get(r.orderId)}
                      orderLoading={loadingOrders.has(r.orderId)}
                      canOrders={canOrders}
                    />
                  ))
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RefundCard({
  refund: r,
  order,
  orderLoading,
  canOrders,
}: {
  refund: Refund;
  order?: AdminOrderDetail;
  orderLoading: boolean;
  canOrders: boolean;
}) {
  const stage = refundStage(r);
  const copy = STAGE_COPY[stage];
  const days = daysSince(r.createdAt);
  const ageTone = days >= 14 ? "danger" : days >= 7 ? "warning" : "neutral";

  return (
    <article className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] p-3.5 transition-colors hover:border-[var(--hairline-strong)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {order ? (
            <p className="truncate text-[13.5px] font-semibold text-[var(--text-1)]">{order.productName}</p>
          ) : orderLoading ? (
            <Skeleton className="h-4 w-36" />
          ) : (
            <p className="truncate font-mono text-[11.5px] text-[var(--text-3)]">Order {r.orderId.slice(0, 8)}</p>
          )}
          <p className="mt-0.5 truncate text-[12px] text-[var(--text-3)]">
            {order?.buyerName || order?.buyerEmail || (order ? "Buyer hidden" : "")}
            {order?.buyerName && order?.buyerEmail ? ` · ${order.buyerEmail}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-[16px] font-semibold text-[var(--text-1)]">{formatCurrency(r.amount, r.currency)}</p>
          <Tooltip content={`Requested ${formatDateTime(r.createdAt)}`}>
            <span>
              <Badge tone={ageTone} className="mt-0.5 px-1.5 py-0 text-[10.5px]">
                <Clock className="h-3 w-3" aria-hidden />
                {days === 0 ? "today" : `${days}d`}
              </Badge>
            </span>
          </Tooltip>
        </div>
      </div>

      <p className="mt-2 text-[12px] text-[var(--text-2)]">
        <span className="font-medium text-[var(--text-1)]">{humanize(r.reasonCode)}</span>
        {r.reason ? <span className="text-[var(--text-3)]"> — {r.reason}</span> : null}
      </p>

      <p className="mt-1.5 text-[11.5px] text-[var(--text-3)]">
        {!r.physicalReturnRequired
          ? "No return needed"
          : r.physicalReturnConfirmedAt
            ? <>Item back {formatDateTime(r.physicalReturnConfirmedAt)}{r.nfcTagCondition ? <> · tag <strong className="text-[var(--text-2)]">{humanize(String(r.nfcTagCondition)).toLowerCase()}</strong></> : null}</>
            : "Waiting for the buyer to send it back"}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button asChild variant={stage === "AWAITING_ITEM" ? "secondary" : "primary"} size="sm">
          <Link href={`/payments/refunds/${r.id}`}>
            {copy.next}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
        {canOrders ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/orders/${r.orderId}`}>Order</Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
