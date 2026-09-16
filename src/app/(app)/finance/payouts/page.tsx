"use client";

import * as React from "react";
import { Banknote, Play } from "lucide-react";
import { usePayouts, usePrefetchPayout } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { usePageChrome, PageActions } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { PayoutDrawer } from "@/components/finance/payout-drawer";
import { SchedulePayoutsDialog } from "@/components/finance/schedule-payouts-dialog";
import { FINANCE_CURRENCIES, type Payout } from "@/lib/types";

const STATUSES = ["SCHEDULED", "APPROVED", "PAID", "FAILED", "CANCELLED"];

/**
 * Payout batches: scheduled, approved, executed or failed.
 *
 * Four separate endpoints stand behind the four verbs because they are four
 * separate acts with different actors and different failure modes. The one
 * worth understanding is `fail`: it releases the batch's entries back to
 * ACCRUED so the next sweep picks them up, because a failed payout must not
 * strand an artist's earnings in a state no job looks at.
 */
export default function PayoutsPage() {
  const perms = usePermissions();
  const list = useListState<{ status?: string; currency?: string }>({
    status: undefined,
    currency: undefined,
  });

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [scheduling, setScheduling] = React.useState(false);
  const prefetch = usePrefetchPayout();
  const query = usePayouts(list.params);

  const canManage = perms.canManageFinance();

  usePageChrome({
    title: "Payouts",
    description: "Batches of accrued royalties, from scheduled to paid.",
  });

  const columns = React.useMemo<Column<Payout>[]>(
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
          <span className="font-medium text-[var(--text-1)]">
            {formatCurrency(r.amount, r.currency)}
          </span>
        ),
      },
      {
        key: "entries",
        header: "Entries",
        numeric: true,
        cell: (r) => formatNumber(r.entryCount),
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
        key: "scheduled",
        header: "Scheduled",
        cell: (r) => (
          <span className="tnum text-[12px]">{formatDateTime(r.scheduledAt)}</span>
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
      {
        key: "ref",
        header: "Provider ref",
        cell: (r) =>
          r.gatewayPayoutRef ? (
            <span className="font-mono text-[11px] text-[var(--text-2)]">
              {r.gatewayPayoutRef}
            </span>
          ) : r.failureReason ? (
            <span className="text-[11px] text-[var(--danger)]" title={r.failureReason}>
              {r.failureReason.slice(0, 40)}
              {r.failureReason.length > 40 ? "…" : ""}
            </span>
          ) : (
            <span className="text-[var(--text-3)]">—</span>
          ),
      },
    ],
    []
  );

  return (
    <>
      {canManage ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setScheduling(true)}>
            <Play className="h-3.5 w-3.5" />
            Run a sweep
          </Button>
        </PageActions>
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
          <FilterSelect
            label="Currency"
            value={list.filters.currency}
            onChange={(v) => list.setFilter("currency", v)}
            options={[...FINANCE_CURRENCIES]}
            allLabel="Any"
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
                  icon={Banknote}
                  title="No payout batches yet"
                  description={
                    canManage
                      ? "A sweep batches every payee whose accrued balance has reached their own threshold. Run one as a dry run first to see what it would do."
                      : "Batches appear here once finance runs a payout sweep."
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
        <PayoutDrawer payoutId={openId} onClose={() => setOpenId(null)} />
      ) : null}
      {scheduling ? (
        <SchedulePayoutsDialog onClose={() => setScheduling(false)} />
      ) : null}
    </>
  );
}
