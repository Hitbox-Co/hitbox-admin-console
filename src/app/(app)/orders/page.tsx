"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Lock, ShoppingCart } from "lucide-react";
import { useAdminOrders, usePrefetchOrder } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { OrderDrawer } from "@/components/orders/order-drawer";
import type { AdminOrderRow } from "@/lib/types";

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
  const [openId, setOpenId] = React.useState<string | null>(null);
  // Hovering a row warms its detail, so the drawer usually opens from cache.
  const prefetchOrder = usePrefetchOrder();

  const canMoney = perms.canRead("payment-royalty");
  const canBuyer = perms.canRead("buyer-profile");
  const canManage = perms.can("order", "manage");

  const query = useAdminOrders(list.params);

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
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setOpenId(r.id);
            }}
          >
            {canManage ? "Manage" : "View"}
          </Button>
        ),
      }
    );

    return cols;
  }, [canMoney, canBuyer, canManage]);

  return (
    <>
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
              onRowClick={(r) => setOpenId(r.id)}
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

      {openId ? <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
