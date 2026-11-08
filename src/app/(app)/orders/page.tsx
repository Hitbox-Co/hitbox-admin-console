"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Lock, ShoppingCart, Undo2 } from "lucide-react";
import { useAdminOrders, useOpenRefunds, usePrefetchOrder } from "@/lib/api/hooks";
import { STAGE_COPY, refundStage } from "@/lib/refunds";
import { formatCurrency, formatDateTime, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { AdminOrderRow, Refund } from "@/lib/types";

const STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

export default function OrdersPage() {
  return (
    <PageGuard can={(p) => p.canOpen("/orders")} what="Orders" requires="order:read (platform-wide)">
      {/* OrdersView reads ?status= to accept deep links from the dashboard. */}
      <React.Suspense fallback={<TableSkeleton rows={10} cols={6} />}>
        <OrdersView />
      </React.Suspense>
    </PageGuard>
  );
}

function OrdersView() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") ?? undefined;

  const list = useListState<{ status?: string; buyerEmail?: string; productCode?: string }>({
    status: initialStatus,
    buyerEmail: undefined,
    productCode: undefined,
  });
  const perms = usePermissions();
  const router = useRouter();
  // Hovering a row warms its detail, so the order page usually paints from cache.
  const prefetchOrder = usePrefetchOrder();

  // Old links opened a drawer with ?open=<id>; send them to the page instead.
  const legacyOpen = searchParams.get("open");
  React.useEffect(() => {
    if (legacyOpen) router.replace(`/orders/${legacyOpen}`);
  }, [legacyOpen, router]);

  const canMoney = perms.canRead("payment-royalty");
  const canBuyer = perms.canRead("buyer-profile");
  const canManage = perms.can("order", "manage");

  const query = useAdminOrders(list.params);

  // Orders with an open refund are highlighted — read once from the refund
  // queue (payment-royalty:read) rather than discovered by opening each one.
  const canSeeRefunds = perms.canOpen("/returns");
  const openRefunds = useOpenRefunds(canSeeRefunds);
  const refundByOrder = React.useMemo(() => {
    const m = new Map<string, Refund>();
    for (const r of openRefunds.data?.items ?? []) m.set(r.orderId, r);
    return m;
  }, [openRefunds.data]);
  const openCount = openRefunds.data?.items.length ?? 0;

  usePageChrome({
    title: "Orders",
    description: "Every order your scope covers. Open one to see its units and move it on.",
  });

  const columns = React.useMemo<Column<AdminOrderRow>[]>(() => {
    const cols: Column<AdminOrderRow>[] = [
      {
        key: "product",
        header: "Drop",
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
              {r.productName}
            </p>
            <Mono className="mt-0.5 text-[10px]">{r.productCode}</Mono>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (r) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={toneForStatus(r.status)} dot>
              {humanize(r.status)}
            </Badge>
            {refundByOrder.has(r.id) ? (
              <Badge tone={STAGE_COPY[refundStage(refundByOrder.get(r.id)!)].tone} className="px-1.5 py-0 text-[10.5px]">
                <Undo2 className="h-3 w-3" aria-hidden />
                {STAGE_COPY[refundStage(refundByOrder.get(r.id)!)].short}
              </Badge>
            ) : null}
            {/* Paid but no unit scanned yet: it can't ship until it's packed. */}
            {(r.status === "PAID" || r.status === "PROCESSING") && r.unitAssignedAt === null ? (
              <Badge tone="warning" className="px-1 py-0 text-[10px]">
                To pack
              </Badge>
            ) : null}
          </span>
        ),
      },
      { key: "qty", header: "Qty", numeric: true, cell: (r) => r.quantity },
    ];

    // The amount column exists only with payment-royalty:read. Rendering a
    // dash here instead would read as "this order had no value".
    if (canMoney) {
      cols.push({
        key: "amount",
        header: "Amount",
        numeric: true,
        cell: (r) =>
          r.amount && r.currency ? (
            <span className="font-medium text-[var(--text-1)]">
              {formatCurrency(r.amount, r.currency)}
            </span>
          ) : (
            "—"
          ),
      });
    }

    // buyerEmail/buyerName are resolved at the database, so there is no
    // per-row lookup and no truncated id to apologise for any more.
    if (canBuyer) {
      cols.push({
        key: "buyer",
        header: "Buyer",
        cell: (r) =>
          r.buyerEmail ? (
            <div className="min-w-0">
              {r.buyerName ? (
                <p className="truncate text-[12.5px] text-[var(--text-1)]">{r.buyerName}</p>
              ) : null}
              <p className="truncate text-[11px] text-[var(--text-3)]">{r.buyerEmail}</p>
            </div>
          ) : (
            "—"
          ),
      });
    }

    cols.push(
      {
        key: "placed",
        header: "Placed",
        cell: (r) => <span className="tnum text-[12px]">{formatDateTime(r.placedAt)}</span>,
      },
      {
        key: "delivered",
        header: "Delivered",
        cell: (r) => (
          <span className="tnum text-[12px] text-[var(--text-3)]">
            {formatDateTime(r.deliveredAt)}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        cell: (r) => (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/orders/${r.id}`} onClick={(e) => e.stopPropagation()}>
              {canManage ? "Manage" : "View"}
            </Link>
          </Button>
        ),
      }
    );

    return cols;
  }, [canMoney, canBuyer, canManage, refundByOrder]);

  return (
    <>
      {openCount > 0 ? (
        <Link
          href="/returns"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--warning)] bg-[var(--warning-dim)] px-4 py-3 transition-colors hover:brightness-110"
        >
          <Undo2 className="h-4 w-4 text-[var(--warning)]" aria-hidden />
          <span className="text-[13px] text-[var(--text-1)]">
            <strong className="font-semibold">
              {openCount} order{openCount === 1 ? " has" : "s have"} an open refund
            </strong>
            <span className="text-[var(--text-2)]"> — highlighted below.</span>
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--text-1)]">
            Open returns <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      ) : null}
      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.active}>
          <FilterSelect
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={STATUSES}
            allLabel="All statuses"
          />

          <SearchInput
            value={list.filters.productCode ?? ""}
            onChange={(v) => list.setFilter("productCode", v || undefined)}
            placeholder="Drop code"
            className="w-[150px]"
          />

          {/*
            buyerEmail is a 403 without buyer-profile:read rather than a
            silently-ignored filter — the result count would otherwise confirm
            an address exists. So the input is hidden, not disabled.
          */}
          {canBuyer ? (
            <SearchInput
              value={list.filters.buyerEmail ?? ""}
              onChange={(v) => list.setFilter("buyerEmail", v || undefined)}
              placeholder="Buyer email"
              className="w-[170px]"
            />
          ) : null}

          {!canMoney ? (
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
              <Lock className="h-3 w-3" aria-hidden />
              Order amounts need payment-royalty:read
            </span>
          ) : null}
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={columns.length} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data?.items ?? []}
              getRowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/orders/${r.id}`)}
              rowClassName={(r) =>
                refundByOrder.has(r.id)
                  ? "bg-[var(--warning-dim)] shadow-[inset_3px_0_0_var(--warning)] hover:bg-[var(--warning-dim)]"
                  : undefined
              }
              onRowIntent={(r) => prefetchOrder(r.id)}
              dimmed={query.isFetching}
              emptyState={
                <EmptyState
                  icon={ShoppingCart}
                  title="No orders match these filters"
                  description={
                    list.active
                      ? "Try clearing the filters."
                      : "No orders have been placed in your scope yet."
                  }
                />
              }
            />
            <Pagination
              page={query.data?.page ?? 1}
              limit={query.data?.limit ?? 20}
              total={query.data?.total ?? 0}
              onPageChange={list.setPage}
              onLimitChange={list.setLimit}
            />
          </>
        )}
      </Panel>

    </>
  );
}
