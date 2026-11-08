"use client";

import * as React from "react";
import { Gavel, Plus } from "lucide-react";
import { useDisputes, usePrefetchDispute } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize, shortId } from "@/lib/format";
import { usePageChrome, PageActions } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { DisputeDrawer } from "@/components/payments/dispute-drawer";
import { OpenDisputeDialog } from "@/components/payments/open-dispute-dialog";
import { Countdown } from "@/components/payments/countdown";
import type { Dispute } from "@/lib/types";

const STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "EVIDENCE_SUBMITTED",
  "WON",
  "LOST",
  "ACCEPTED",
  "WITHDRAWN",
];

/**
 * The chargeback queue, ordered by the clock.
 *
 * `GET /disputes` is ordered server-side by soonest evidence deadline,
 * because the queue is a countdown: a case whose deadline passes without
 * evidence is lost by default, and no amount of being right afterwards
 * changes that. The deadline column is therefore first among the dates and
 * renders as time remaining rather than as a date to be mentally subtracted.
 */
export default function DisputesPage() {
  const perms = usePermissions();
  const list = useListState<{ status?: string; dueBefore?: string }>({
    status: undefined,
    dueBefore: undefined,
  });

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [opening, setOpening] = React.useState(false);
  const prefetch = usePrefetchDispute();
  const query = useDisputes(list.params);

  const canManage = perms.canManageFinance();

  usePageChrome({
    title: "Disputes",
    description: "Chargebacks, ordered by how long is left to answer them.",
  });

  const columns = React.useMemo<Column<Dispute>[]>(
    () => [
      {
        key: "due",
        header: "Evidence due",
        cell: (r) => <Countdown iso={r.evidenceDueBy} settled={!!r.resolvedAt} />,
      },
      {
        key: "amount",
        header: "Amount",
        numeric: true,
        cell: (r) => (
          <div>
            <p className="font-medium text-[var(--text-1)]">
              {formatCurrency(r.amount, r.currency)}
            </p>
            {r.feeAmount ? (
              <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                + {formatCurrency(r.feeAmount, r.currency)} fee
              </p>
            ) : null}
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
      {
        key: "reason",
        header: "Reason",
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--text-1)]">{humanize(r.reasonCode)}</p>
            {r.reason ? (
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]" title={r.reason}>
                {r.reason}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "evidence",
        header: "Evidence",
        cell: (r) =>
          r.evidenceSubmittedAt ? (
            <Badge tone="positive" className="px-1 py-0 text-[10px]">
              Submitted
            </Badge>
          ) : r.resolvedAt ? (
            <span className="text-[11px] text-[var(--text-3)]">—</span>
          ) : (
            <Badge tone="warning" className="px-1 py-0 text-[10px]">
              Not sent
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
        key: "opened",
        header: "Opened",
        cell: (r) => (
          <span className="tnum text-[12px] text-[var(--text-3)]">
            {formatDateTime(r.openedAt)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <>
      {canManage ? (
        <PageActions>
          <Button variant="secondary" size="sm" onClick={() => setOpening(true)}>
            <Plus className="h-3.5 w-3.5" />
            Record a dispute
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
          <label className="flex items-center gap-1.5">
            <span className="text-[12px] text-[var(--text-3)]">Due before</span>
            <input
              type="date"
              value={list.filters.dueBefore?.slice(0, 10) ?? ""}
              onChange={(e) =>
                list.setFilter(
                  "dueBefore",
                  e.target.value
                    ? new Date(`${e.target.value}T23:59:59Z`).toISOString()
                    : undefined
                )
              }
              className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
            />
          </label>
          <span className="text-[11px] text-[var(--text-3)]">
            Sorted by soonest deadline.
          </span>
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
                  icon={Gavel}
                  title="No open disputes"
                  description="Cases normally arrive by webhook from the provider. Recording one by hand is for a case that came in another way."
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
        <DisputeDrawer disputeId={openId} onClose={() => setOpenId(null)} />
      ) : null}
      {opening ? <OpenDisputeDialog onClose={() => setOpening(false)} /> : null}
    </>
  );
}
