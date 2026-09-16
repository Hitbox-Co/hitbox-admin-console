"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { usePrefetchRefund, useRefunds } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize, shortId } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { Badge, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { RefundCapabilityNotice, ScopeNotice } from "@/components/finance/scope-notice";
import { RefundDrawer } from "@/components/payments/refund-drawer";
import type { Refund } from "@/lib/types";

const STATUSES = ["REQUESTED", "AWAITING_RETURN", "APPROVED", "PROCESSED", "REJECTED"];

const REASON_CODES = [
  "DEFECTIVE_ITEM",
  "DEFECTIVE_TAG",
  "NOT_AS_DESCRIBED",
  "NOT_DELIVERED",
  "DUPLICATE_CHARGE",
  "BUYER_CHANGED_MIND",
  "FRAUDULENT_CHARGE",
  "OTHER",
];

/**
 * The refund queue.
 *
 * The status column is the workflow: a request waits for the item, an
 * operator approves it, and only then does money move. That ordering is the
 * one thing this module is stubborn about — a refund on a physical
 * collectible is an exchange, not a card reversal, and the platform has no
 * leverage once the money is gone.
 */
export default function RefundsPage() {
  const list = useListState<{
    status?: string;
    reasonCode?: string;
    orderId?: string;
  }>({
    status: undefined,
    reasonCode: undefined,
    orderId: undefined,
  });

  const [openId, setOpenId] = React.useState<string | null>(null);
  const prefetch = usePrefetchRefund();
  const query = useRefunds(list.params);

  usePageChrome({
    title: "Refunds",
    description: "Requested, returned, approved, processed — in that order.",
  });

  const columns = React.useMemo<Column<Refund>[]>(
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
          <Badge tone={toneForStatus(r.status)} dot>
            {humanize(r.status)}
          </Badge>
        ),
      },
      {
        key: "reason",
        header: "Reason",
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--text-1)]">{humanize(r.reasonCode)}</p>
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]" title={r.reason}>
              {r.reason}
            </p>
          </div>
        ),
      },
      {
        key: "return",
        header: "Physical return",
        cell: (r) =>
          !r.physicalReturnRequired ? (
            <span className="text-[11px] text-[var(--text-3)]">Not required</span>
          ) : r.physicalReturnConfirmedAt ? (
            <div className="min-w-0">
              <Badge tone="positive" className="px-1 py-0 text-[10px]">
                Received
              </Badge>
              {r.nfcTagCondition ? (
                <Badge
                  tone={toneForStatus(String(r.nfcTagCondition))}
                  className="ml-1 px-1 py-0 text-[10px]"
                >
                  Tag {humanize(String(r.nfcTagCondition)).toLowerCase()}
                </Badge>
              ) : null}
            </div>
          ) : (
            <Badge tone="warning" className="px-1 py-0 text-[10px]">
              Awaiting item
            </Badge>
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
        key: "requested",
        header: "Requested",
        cell: (r) => (
          <span className="tnum text-[12px]">{formatDateTime(r.createdAt)}</span>
        ),
      },
      {
        key: "processed",
        header: "Processed",
        cell: (r) => (
          <span className="tnum text-[12px] text-[var(--text-3)]">
            {formatDateTime(r.processedAt)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <>
      <div className="space-y-4">
        <RefundCapabilityNotice />
        <ScopeNotice caveat="own-purchases" />

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
              label="Reason"
              value={list.filters.reasonCode}
              onChange={(v) => list.setFilter("reasonCode", v)}
              options={REASON_CODES}
              allLabel="Any reason"
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
                    icon={RotateCcw}
                    title="No refund requests match these filters"
                    description="Buyers raise refunds from the storefront; support can raise one on any order."
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
        <RefundDrawer refundId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
