"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { usePrefetchRefund, useRefunds } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize, shortId } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { Badge, Mono, Panel, Segmented, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { RefundCapabilityNotice, ScopeNotice } from "@/components/finance/scope-notice";
import { GatewayStatusChip } from "@/components/payments/gateway-status-chip";
import type { Refund, RefundActionCode } from "@/lib/types";

/** The workflow as tabs (order-payments-and-refunds-api.md §6.2). */
const TABS = [
  { value: "ALL", label: "All" },
  { value: "REQUESTED", label: "Requested" },
  { value: "AWAITING_RETURN", label: "Awaiting return" },
  { value: "APPROVED", label: "Approved · ready to pay" },
  { value: "PROCESSED", label: "Processed" },
  { value: "REJECTED", label: "Rejected" },
  // Not a workflow status — Stripe's: processed, but the money never arrived.
  { value: "STRIPE_FAILED", label: "Failed at Stripe" },
];

/** What the caller can do next, in a word — from the server's allowedActions. */
const NEXT_LABEL: Record<RefundActionCode, string> = {
  CONFIRM_RETURN: "Confirm return",
  APPROVE: "Approve",
  APPROVE_WITH_OVERRIDE: "Approve (override)",
  PROCESS: "Pay back",
  REJECT: "Reject",
};

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
  return (
    // Reads ?open= to forward old drawer links to the refund page.
    <React.Suspense fallback={<TableSkeleton rows={10} cols={7} />}>
      <RefundsView />
    </React.Suspense>
  );
}

function RefundsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyOpen = searchParams.get("open");
  React.useEffect(() => {
    if (legacyOpen) router.replace(`/payments/refunds/${legacyOpen}`);
  }, [legacyOpen, router]);

  const list = useListState<{
    status?: string;
    gatewayStatus?: string;
    reasonCode?: string;
    orderId?: string;
    from?: string;
    to?: string;
  }>({
    status: undefined,
    gatewayStatus: undefined,
    reasonCode: undefined,
    orderId: undefined,
    from: undefined,
    to: undefined,
  });

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
        key: "next",
        header: "Next step",
        cell: (r) => {
          const next = (r.allowedActions ?? []).filter((a) => a !== "REJECT" && a !== "APPROVE_WITH_OVERRIDE");
          return next.length ? (
            <Badge tone="accent" className="text-[11px]">
              {next.map((a) => NEXT_LABEL[a]).join(" · ")}
            </Badge>
          ) : (
            <span className="text-[11px] text-[var(--text-3)]">—</span>
          );
        },
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
          <div className="space-y-0.5">
            <span className="tnum block text-[12px] text-[var(--text-3)]">
              {formatDateTime(r.processedAt)}
            </span>
            <GatewayStatusChip
              status={r.gatewayStatus}
              reason={r.gatewayFailureReason}
              processed={r.status === "PROCESSED"}
            />
          </div>
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
          <div className="overflow-x-auto border-b border-[var(--hairline)] px-3 py-2">
            <Segmented
              size="sm"
              value={list.filters.gatewayStatus === "FAILED" ? "STRIPE_FAILED" : list.filters.status ?? "ALL"}
              onChange={(v) => {
                if (v === "STRIPE_FAILED") {
                  list.setFilter("status", undefined);
                  list.setFilter("gatewayStatus", "FAILED");
                } else {
                  list.setFilter("gatewayStatus", undefined);
                  list.setFilter("status", v === "ALL" ? undefined : v);
                }
              }}
              options={TABS}
            />
          </div>
          <FilterRow onReset={list.reset} active={list.active}>
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
            <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
              From
              <input
                type="date"
                value={list.filters.from?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  list.setFilter("from", e.target.value || undefined)
                }
                className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 text-[12px] text-[var(--text-1)]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
              To
              <input
                type="date"
                value={list.filters.to?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  // Inclusive of the chosen day.
                  list.setFilter("to", e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined)
                }
                className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 text-[12px] text-[var(--text-1)]"
              />
            </label>
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
                onRowClick={(r) => router.push(`/payments/refunds/${r.id}`)}
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

    </>
  );
}
