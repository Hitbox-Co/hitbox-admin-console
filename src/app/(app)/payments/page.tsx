"use client";

import * as React from "react";
import { CreditCard } from "lucide-react";
import { usePaymentTransactions, usePrefetchPaymentTransaction } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize, shortId } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { Badge, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ScopeNotice } from "@/components/finance/scope-notice";
import { TransactionDrawer } from "@/components/payments/transaction-drawer";
import { FINANCE_CURRENCIES, type PaymentTransaction } from "@/lib/types";

const STATUSES = ["INITIATED", "PENDING", "SUCCEEDED", "FAILED", "NEEDS_REVIEW"];

/**
 * Charge attempts, and the ones that stopped rather than failed.
 *
 * NEEDS_REVIEW is the status worth building a screen around: a transaction
 * with something wrong about it — settled but unfulfillable, an amount that
 * does not match the order — parks instead of failing, and clearing it is a
 * decision with a name and a written note on it. The banner below surfaces
 * that queue without the operator having to know to filter for it.
 */
export default function PaymentTransactionsPage() {
  const list = useListState<{
    status?: string;
    currency?: string;
    orderId?: string;
    needsReview?: string;
  }>({
    status: undefined,
    currency: undefined,
    orderId: undefined,
    needsReview: undefined,
  });

  const [openId, setOpenId] = React.useState<string | null>(null);
  const prefetch = usePrefetchPaymentTransaction();
  const query = usePaymentTransactions(list.params);

  usePageChrome({
    title: "Payments",
    description: "Every charge attempt, and the ones parked for review.",
  });

  const columns = React.useMemo<Column<PaymentTransaction>[]>(
    () => [
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
        key: "status",
        header: "Status",
        cell: (r) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={toneForStatus(r.status)} dot>
              {humanize(r.status)}
            </Badge>
            {r.needsReview ? (
              <Badge tone="warning" className="px-1 py-0 text-[10px]">
                Parked
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        key: "gateway",
        header: "Gateway",
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--text-2)]">{r.gateway}</p>
            {r.gatewayRef ? (
              <p
                className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-3)]"
                title={r.gatewayRef}
              >
                {r.gatewayRef}
              </p>
            ) : null}
          </div>
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
        key: "created",
        header: "Started",
        cell: (r) => (
          <span className="tnum text-[12px]">{formatDateTime(r.createdAt)}</span>
        ),
      },
      {
        key: "settled",
        header: "Settled",
        cell: (r) => (
          <span className="tnum text-[12px] text-[var(--text-3)]">
            {formatDateTime(r.settledAt)}
          </span>
        ),
      },
      {
        key: "failure",
        header: "",
        cell: (r) =>
          r.failureReason ? (
            <span
              className="text-[11px] text-[var(--danger)]"
              title={r.failureReason}
            >
              {r.failureReason.slice(0, 32)}
              {r.failureReason.length > 32 ? "…" : ""}
            </span>
          ) : null,
      },
    ],
    []
  );

  const parked = query.data?.items.filter((t) => t.needsReview).length ?? 0;

  return (
    <>
      <div className="space-y-4">
        <ScopeNotice caveat="own-purchases" />

        {parked && list.filters.needsReview !== "true" ? (
          <button
            onClick={() => list.setFilter("needsReview", "true")}
            className="flex w-full items-center gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2.5 text-left transition-colors hover:border-[var(--warning)]"
          >
            <p className="text-[12px] text-[var(--text-1)]">
              <span className="font-medium">
                {parked} {parked === 1 ? "transaction is" : "transactions are"} parked
                for review
              </span>{" "}
              <span className="text-[var(--text-2)]">
                on this page. They will not settle on their own.
              </span>
            </p>
            <span className="ml-auto shrink-0 text-[11px] text-[var(--text-3)]">
              Show only those
            </span>
          </button>
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
            {/*
              The wire values are the strings "true"/"false"; FilterSelect
              humanises its options and would label these "True" and "False".
            */}
            <label className="flex items-center gap-1.5">
              <span className="text-[12px] text-[var(--text-3)]">Review</span>
              <select
                value={list.filters.needsReview ?? ""}
                onChange={(e) =>
                  list.setFilter("needsReview", e.target.value || undefined)
                }
                className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
              >
                <option value="">Any</option>
                <option value="true">Parked for review</option>
                <option value="false">Not parked</option>
              </select>
            </label>
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
                onRowClick={(r) => setOpenId(r.id)}
                onRowIntent={(r) => prefetch(r.id)}
                dimmed={query.isFetching}
                emptyState={
                  <EmptyState
                    icon={CreditCard}
                    title="No transactions match these filters"
                    description="A charge attempt is recorded the moment a checkout opens, before any money moves."
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

      {openId ? (
        <TransactionDrawer paymentId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
