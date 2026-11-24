"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { useFinanceLedger } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize, shortId } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { Badge, Mono, Panel } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { OrderPicker } from "@/components/finance/entity-pickers";
import { usePermissions } from "@/components/layout/authz-provider";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ScopeNotice } from "@/components/finance/scope-notice";
import { FINANCE_CURRENCIES, type FinanceEntry } from "@/lib/types";

const CATEGORIES = [
  "SALE_REVENUE",
  "COST_OF_GOODS",
  "GATEWAY_FEE",
  "REFUND",
  "CHARGEBACK",
  "ROYALTY_EXPENSE",
  "ROYALTY_PAYOUT",
  "ADJUSTMENT",
];

/**
 * The platform's own books, line by line.
 *
 * This is double-entry in spirit: every line carries a `direction` (CREDIT or
 * DEBIT) and a `category`, and the revenue summary on the Overview tab is
 * this table grouped. A line here is never edited — a correction is a new
 * ADJUSTMENT line beside it, which is why the same order can appear several
 * times with different categories.
 */
export default function FinanceLedgerPage() {
  const list = useListState<{
    category?: string;
    direction?: string;
    currency?: string;
    orderId?: string;
  }>({
    category: undefined,
    direction: undefined,
    currency: undefined,
    orderId: undefined,
  });
  // Pickers read the order list and the artist directory, which need
  // platform-wide reach — hidden rather than offered to answer 403.
  const perms = usePermissions();

  const query = useFinanceLedger(list.params);

  usePageChrome({
    title: "Platform ledger",
    description: "Every line HitBox posted — revenue, costs, fees, corrections.",
  });

  const columns = React.useMemo<Column<FinanceEntry>[]>(
    () => [
      {
        key: "category",
        header: "Category",
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] text-[var(--text-1)]">
              {humanize(r.category)}
            </p>
            {r.description ? (
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">
                {r.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "direction",
        header: "Direction",
        cell: (r) => (
          <Badge tone={r.direction === "CREDIT" ? "positive" : "info"}>
            {humanize(r.direction)}
          </Badge>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        numeric: true,
        cell: (r) => (
          <span className="font-medium text-[var(--text-1)]">
            {formatCurrency(r.amount, r.currency)}
          </span>
        ),
      },
      {
        key: "cogs",
        header: "Cost of goods",
        numeric: true,
        cell: (r) =>
          r.costOfGoods ? (
            formatCurrency(r.costOfGoods, r.currency)
          ) : (
            <span className="text-[var(--text-3)]">—</span>
          ),
      },
      {
        key: "fee",
        header: "Gateway fee",
        numeric: true,
        cell: (r) =>
          r.gatewayFee ? (
            formatCurrency(r.gatewayFee, r.currency)
          ) : (
            <span className="text-[var(--text-3)]">—</span>
          ),
      },
      {
        key: "order",
        header: "Order",
        cell: (r) =>
          r.orderId ? (
            <Mono className="text-[10px]" title={r.orderId}>
              {shortId(r.orderId)}
            </Mono>
          ) : (
            <span className="text-[11px] text-[var(--text-3)]">Not order-linked</span>
          ),
      },
      {
        key: "posted",
        header: "Posted",
        cell: (r) => (
          <span className="tnum text-[12px]">{formatDateTime(r.createdAt)}</span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <ScopeNotice caveat="platform-books" />

      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.active}>
          <FilterSelect
            label="Category"
            value={list.filters.category}
            onChange={(v) => list.setFilter("category", v)}
            options={CATEGORIES}
            allLabel="All categories"
          />
          <FilterSelect
            label="Direction"
            value={list.filters.direction}
            onChange={(v) => list.setFilter("direction", v)}
            options={["CREDIT", "DEBIT"]}
            allLabel="Both"
          />
          <FilterSelect
            label="Currency"
            value={list.filters.currency}
            onChange={(v) => list.setFilter("currency", v)}
            options={[...FINANCE_CURRENCIES]}
            allLabel="Any"
          />
          {perms.reaches("order") ? (
          <OrderPicker
            size="sm"
            aria-label="All orders"
            className="w-[220px]"
            placeholder="All orders"
            value={list.filters.orderId}
            onChange={(v) => list.setFilter("orderId", v)}
          />
          ) : null}
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={7} />
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
                  icon={BookOpen}
                  title="No ledger lines match these filters"
                  description="Lines are posted when a sale settles, a refund processes, a chargeback lands or an adjustment is made."
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
    </div>
  );
}
