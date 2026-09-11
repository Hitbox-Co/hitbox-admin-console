"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Lock, ShoppingCart } from "lucide-react";
import { useOrders } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Mono, Panel, Tooltip, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { OrderRow } from "@/lib/types";

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
    <PageGuard can={(p) => p.canRead("order")} what="Orders" requires="order:read">
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

  const list = useListState<{ status?: string }>({ status: initialStatus });
  const perms = usePermissions();
  const query = useOrders(list.params);

  usePageChrome({
    title: "Orders",
    description: "Every order your scope covers.",
  });

  const canMoney = perms.canRead("payment-royalty");
  const canBuyer = perms.canRead("buyer-profile");
  const buyerFull = perms.widestScope("buyer-profile") === "global";

  const columns = React.useMemo<Column<OrderRow>[]>(() => {
    const cols: Column<OrderRow>[] = [
      {
        key: "id",
        header: "Order",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[var(--text-1)]">
            {r.id.slice(0, 12)}…
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (r) => (
          <Badge tone={toneForStatus(r.status)} dot>
            {humanize(r.status)}
          </Badge>
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

    if (canBuyer) {
      cols.push({
        key: "buyer",
        header: "Buyer",
        cell: (r) =>
          r.buyerId ? (
            <Tooltip
              content={
                buyerFull
                  ? "Full buyer id — your scope is platform-wide."
                  : "Truncated: full buyer ids need global buyer-profile visibility."
              }
            >
              <span>
                <Mono className="text-[11px]">{r.buyerId}</Mono>
              </span>
            </Tooltip>
          ) : (
            "—"
          ),
      });
    }

    cols.push(
      {
        key: "product",
        header: "Product",
        cell: (r) => <Mono className="text-[11px]">{r.productId}</Mono>,
      },
      {
        key: "placed",
        header: "Placed",
        cell: (r) => (
          <span className="tnum text-[12px]">{formatDateTime(r.placedAt)}</span>
        ),
      },
      {
        key: "delivered",
        header: "Delivered",
        cell: (r) => (
          <span className="tnum text-[12px] text-[var(--text-3)]">
            {formatDateTime(r.deliveredAt)}
          </span>
        ),
      }
    );

    return cols;
  }, [canMoney, canBuyer, buyerFull]);

  return (
    <Panel className="overflow-hidden">
      <FilterRow onReset={list.reset} active={list.active}>
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          options={STATUSES}
          allLabel="All statuses"
        />
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
            dimmed={query.isFetching}
            emptyState={
              <EmptyState
                icon={ShoppingCart}
                title="No orders match these filters"
                description={
                  list.active
                    ? "Try clearing the status filter."
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
  );
}
