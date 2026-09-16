"use client";

import * as React from "react";
import { Coins } from "lucide-react";
import { useRoyaltyEntries, usePrefetchRoyaltyEntry } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize, shortId } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { Badge, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { RoyaltyEntryDrawer } from "@/components/finance/royalty-entry-drawer";
import { FINANCE_CURRENCIES, type RoyaltyEntry } from "@/lib/types";

const STATUSES = ["ACCRUED", "PENDING_PAYOUT", "PAID", "REVERSED"];
const ENTRY_TYPES = ["ORIGINAL", "ADJUSTMENT"];

/**
 * Every accrual, with the arithmetic that produced it one click away.
 *
 * An `artistId` filter belonging to someone outside the caller's scope
 * returns an empty page rather than a 403: the filter is applied ON TOP OF
 * the scope clause, never in place of it. So this screen offers the filter
 * freely — it cannot be used to widen anything.
 */
export default function RoyaltyEntriesPage() {
  const list = useListState<{
    status?: string;
    entryType?: string;
    currency?: string;
    orderId?: string;
    artistId?: string;
  }>({
    status: undefined,
    entryType: undefined,
    currency: undefined,
    orderId: undefined,
    artistId: undefined,
  });

  const [openId, setOpenId] = React.useState<string | null>(null);
  const prefetch = usePrefetchRoyaltyEntry();
  const query = useRoyaltyEntries(list.params);

  usePageChrome({
    title: "Royalties",
    description: "Every accrual, and the calculation that produced it.",
  });

  const columns = React.useMemo<Column<RoyaltyEntry>[]>(
    () => [
      {
        key: "payee",
        header: "Payee",
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
              {r.payee.name ?? humanize(r.payee.type)}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
              {humanize(r.payee.type)}
            </p>
          </div>
        ),
      },
      {
        key: "amount",
        header: "Amount",
        numeric: true,
        cell: (r) => (
          <span
            className={
              r.status === "REVERSED"
                ? "text-[var(--text-3)] line-through"
                : "font-medium text-[var(--text-1)]"
            }
          >
            {formatCurrency(r.amount, r.currency)}
          </span>
        ),
      },
      {
        key: "basis",
        header: "Terms",
        cell: (r) => (
          <span className="text-[12px] text-[var(--text-2)]">
            {r.calculation.percentage ? `${r.calculation.percentage}%` : "—"}
            <span className="ml-1.5 text-[var(--text-3)]">
              of {humanize(r.calculation.basis).toLowerCase()}
            </span>
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
      {
        key: "type",
        header: "Type",
        cell: (r) =>
          r.entryType === "ADJUSTMENT" ? (
            <Badge tone="info" className="px-1 py-0 text-[10px]">
              Adjustment
            </Badge>
          ) : (
            <span className="text-[11px] text-[var(--text-3)]">Original</span>
          ),
      },
      {
        key: "order",
        header: "Order",
        cell: (r) => (
          <Mono className="text-[10px]" title={r.orderId}>
            {shortId(r.orderId)}
          </Mono>
        ),
      },
      {
        key: "accrued",
        header: "Accrued",
        cell: (r) => (
          <span className="tnum text-[12px]">{formatDateTime(r.accruedAt)}</span>
        ),
      },
      {
        key: "paid",
        header: "Paid",
        cell: (r) => (
          <span className="tnum text-[12px] text-[var(--text-3)]">
            {formatDateTime(r.paidAt)}
          </span>
        ),
      },
    ],
    []
  );

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
          <FilterSelect
            label="Type"
            value={list.filters.entryType}
            onChange={(v) => list.setFilter("entryType", v)}
            options={ENTRY_TYPES}
            allLabel="All types"
          />
          <FilterSelect
            label="Currency"
            value={list.filters.currency}
            onChange={(v) => list.setFilter("currency", v)}
            options={[...FINANCE_CURRENCIES]}
            allLabel="Any"
          />
          <SearchInput
            value={list.filters.orderId ?? ""}
            onChange={(v) => list.setFilter("orderId", v || undefined)}
            placeholder="Order id"
            className="w-[190px]"
          />
          <SearchInput
            value={list.filters.artistId ?? ""}
            onChange={(v) => list.setFilter("artistId", v || undefined)}
            placeholder="Artist id"
            className="w-[190px]"
          />
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={8} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data?.items ?? []}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setOpenId(r.id)}
              onRowIntent={(r) => prefetch(r.id)}
              dimmed={query.isFetching}
              emptyState={
                <EmptyState
                  icon={Coins}
                  title="No royalty entries match these filters"
                  description={
                    list.active
                      ? "Try clearing the filters. An id outside your scope returns nothing rather than an error."
                      : "Royalties accrue when a buyer claims a unit — not when the order is placed or paid."
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

      {openId ? (
        <RoyaltyEntryDrawer entryId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
