"use client";

import * as React from "react";
import { PencilRuler, Plus } from "lucide-react";
import { useAdjustments } from "@/lib/api/hooks";
import { formatDateTime, humanize, shortId } from "@/lib/format";
import { usePageChrome, PageActions } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Mono, Panel } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ScopeNotice } from "@/components/finance/scope-notice";
import { AdjustmentDialog } from "@/components/finance/adjustment-dialog";
import type { Adjustment } from "@/lib/types";

const TARGET_TYPES = [
  "ROYALTY_LEDGER_ENTRY",
  "FINANCE_LEDGER_ENTRY",
  "ORDER",
  "PAYMENT_TRANSACTION",
  "ROYALTY_PAYOUT",
];

const REASON_CODES = [
  "REFUND_REVERSAL",
  "DISPUTE_LOSS",
  "CHARGEBACK_FEE",
  "CALCULATION_ERROR",
  "RULE_CORRECTION",
  "GOODWILL",
  "MANUAL_CORRECTION",
];

/**
 * Corrections, and nothing they corrected.
 *
 * Posting an adjustment writes the adjustment and a matching platform-ledger
 * line, and does NOT touch whatever it corrects. That is the immutability
 * principle in one endpoint — the original posting stays exactly as it was,
 * and the correction sits beside it with a name, a reason code and a written
 * reason on it. Reading this table top to bottom is reading every time
 * somebody decided the books were wrong.
 */
export default function AdjustmentsPage() {
  const perms = usePermissions();
  const list = useListState<{
    targetType?: string;
    reasonCode?: string;
    orderId?: string;
  }>({
    targetType: undefined,
    reasonCode: undefined,
    orderId: undefined,
  });

  const [posting, setPosting] = React.useState(false);
  const query = useAdjustments(list.params);
  const canManage = perms.canManageFinance();

  usePageChrome({
    title: "Adjustments",
    description: "Signed corrections posted beside the records they correct.",
  });

  const columns = React.useMemo<Column<Adjustment>[]>(
    () => [
      {
        key: "amount",
        header: "Adjustment",
        numeric: true,
        cell: (r) => (
          <Amount
            signed
            amount={r.amountAdjustment}
            currency={r.currency}
            className="text-[13px] font-medium"
          />
        ),
      },
      {
        key: "reason",
        header: "Why",
        cell: (r) => (
          <div className="min-w-0">
            <Badge tone="info" className="px-1 py-0 text-[10px]">
              {humanize(r.reasonCode)}
            </Badge>
            <p className="mt-1 truncate text-[12px] text-[var(--text-2)]" title={r.reason}>
              {r.reason}
            </p>
          </div>
        ),
      },
      {
        key: "target",
        header: "Corrects",
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--text-1)]">{humanize(r.targetType)}</p>
            <Mono className="mt-0.5 text-[10px]" title={r.targetId}>
              {shortId(r.targetId)}
            </Mono>
          </div>
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
            <span className="text-[var(--text-3)]">—</span>
          ),
      },
      {
        key: "result",
        header: "Resulting entry",
        cell: (r) =>
          r.resultingEntryId ? (
            <Mono className="text-[10px]" title={r.resultingEntryId}>
              {shortId(r.resultingEntryId)}
            </Mono>
          ) : (
            <span className="text-[var(--text-3)]">—</span>
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
    <>
      {canManage ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setPosting(true)}>
            <Plus className="h-3.5 w-3.5" />
            Post an adjustment
          </Button>
        </PageActions>
      ) : null}

      <div className="space-y-4">
        <ScopeNotice caveat="platform-books" />

        <Panel className="overflow-hidden">
          <FilterRow onReset={list.reset} active={list.active}>
            <FilterSelect
              label="Corrects"
              value={list.filters.targetType}
              onChange={(v) => list.setFilter("targetType", v)}
              options={TARGET_TYPES}
              allLabel="Anything"
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
            <TableSkeleton rows={10} cols={6} />
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
                    icon={PencilRuler}
                    title="No adjustments posted"
                    description="An empty adjustments table is a good sign: it means nothing has needed correcting."
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

      {posting ? <AdjustmentDialog onClose={() => setPosting(false)} /> : null}
    </>
  );
}
