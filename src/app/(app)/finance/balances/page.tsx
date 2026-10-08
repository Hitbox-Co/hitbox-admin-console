"use client";

import * as React from "react";
import { Wallet } from "lucide-react";
import { useRoyaltyBalances } from "@/lib/api/hooks";
import { formatCurrency, formatNumber, humanize, shortId } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePayeeNames } from "@/components/finance/entity-pickers";
import { Badge, Mono, Panel, PanelHeader, Tooltip } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Meter } from "@/components/charts/charts";
import { STATUS } from "@/components/charts/palette";
import { FINANCE_CURRENCIES, type RoyaltyBalance } from "@/lib/types";

/**
 * What each payee has earned, is owed and has been paid — per currency.
 *
 * This is one grouped aggregate, not a paginated list: there is no `page`
 * parameter on `GET /admin/finance/balances` and counting rows client-side
 * would be both slower and wrong. The only query parameter is `currency`.
 *
 * A payee appears once PER CURRENCY, so the same artist can hold three rows.
 * They are never merged, because merging would require an exchange rate this
 * system does not have.
 */
export default function BalancesPage() {
  const [currency, setCurrency] = React.useState<string | undefined>(undefined);
  const query = useRoyaltyBalances(currency);
  /*
   * GET /admin/finance/balances returns `payeeName: null` on every row — the
   * balance is a groupBy over ledger entries, which cannot join the artist or
   * organization, and the service never fills the name in afterwards
   * (finance/src/service/royalty-payout.service.ts, balances()). So names are
   * resolved here from the same directories the finance pickers use. The
   * server's name still wins the moment it starts sending one.
   */
  const payeeName = usePayeeNames();

  usePageChrome({
    title: "Balances",
    description: "Earned, owed and paid, per payee and per currency.",
  });

  // `?? []` produces a fresh array each render, which would make every memo
  // downstream of it recompute — so the fallback is memoised, not the reads.
  const rows = React.useMemo(() => query.data ?? [], [query.data]);

  /**
   * Who is ready to be paid. `thresholdMet` is computed server-side against
   * the threshold in force on that payee's own rule — it is a term they
   * negotiated, not a platform constant, so it is not re-derived here.
   */
  const ready = React.useMemo(() => rows.filter((r) => r.thresholdMet), [rows]);

  const columns = React.useMemo<Column<RoyaltyBalance>[]>(
    () => [
      {
        key: "payee",
        header: "Payee",
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
              {r.payeeName ??
                (r.payeeId ? payeeName(r.payeeId) : undefined) ??
                (r.payeeType === "ORGANIZATION" ? "Unnamed organization" : "Unnamed artist")}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5">
              <Badge tone="neutral" className="px-1 py-0 text-[10px]">
                {humanize(r.payeeType)}
              </Badge>
              {r.payeeId ? (
                <Mono className="text-[10px]" title={r.payeeId}>
                  {shortId(r.payeeId)}
                </Mono>
              ) : null}
            </p>
          </div>
        ),
      },
      {
        key: "currency",
        header: "Currency",
        cell: (r) => <span className="font-mono text-[11px]">{r.currency}</span>,
      },
      {
        key: "outstanding",
        header: "Outstanding",
        numeric: true,
        cell: (r) => (
          <Tooltip content="Accrued plus already-batched — what is owed but not yet in the bank.">
            <span className="cursor-help font-medium text-[var(--text-1)]">
              {formatCurrency(r.outstanding, r.currency)}
            </span>
          </Tooltip>
        ),
      },
      {
        key: "accrued",
        header: "Accrued",
        numeric: true,
        cell: (r) => formatCurrency(r.accrued, r.currency),
      },
      {
        key: "pending",
        header: "In a batch",
        numeric: true,
        cell: (r) => formatCurrency(r.pendingPayout, r.currency),
      },
      {
        key: "paid",
        header: "Paid",
        numeric: true,
        cell: (r) => (
          <span className="text-[var(--text-3)]">
            {formatCurrency(r.paid, r.currency)}
          </span>
        ),
      },
      {
        key: "reversed",
        header: "Reversed",
        numeric: true,
        cell: (r) =>
          Number.parseFloat(r.reversed) > 0 ? (
            <span className="text-[var(--danger)]">
              {formatCurrency(r.reversed, r.currency)}
            </span>
          ) : (
            <span className="text-[var(--text-3)]">—</span>
          ),
      },
      {
        key: "entries",
        header: "Entries",
        numeric: true,
        cell: (r) => formatNumber(r.entryCount),
      },
      {
        key: "threshold",
        header: "Threshold",
        cell: (r) => (
          <div className="min-w-[130px]">
            <Meter
              label={r.thresholdMet ? "Ready" : "Below"}
              value={Math.round(Number.parseFloat(r.accrued) || 0)}
              max={Math.round(Number.parseFloat(r.threshold) || 1)}
              color={r.thresholdMet ? STATUS.good : STATUS.neutral}
            />
          </div>
        ),
      },
    ],
    [payeeName]
  );

  return (
    <div className="space-y-4">
      {ready.length ? (
        <Panel>
          <PanelHeader
            title={`${ready.length} ${ready.length === 1 ? "payee has" : "payees have"} reached their threshold`}
            description="Scheduling a sweep on the Payouts tab batches these. A payee below their bar is skipped with a reason rather than silently dropped."
          />
        </Panel>
      ) : null}

      <Panel className="overflow-hidden">
        <FilterRow
          onReset={() => setCurrency(undefined)}
          active={currency !== undefined}
        >
          <FilterSelect
            label="Currency"
            value={currency}
            onChange={setCurrency}
            options={[...FINANCE_CURRENCIES]}
            allLabel="All currencies"
          />
          <span className="text-[11px] text-[var(--text-3)]">
            One row per payee per currency — never combined.
          </span>
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={8} cols={9} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r, i) => `${r.payeeType}-${r.payeeId ?? i}-${r.currency}`}
            dimmed={query.isFetching}
            emptyState={
              <EmptyState
                icon={Wallet}
                title="No balances in scope"
                description={
                  currency
                    ? `Nothing has accrued in ${currency}.`
                    : "Royalties accrue when a buyer claims a unit, not when the order is placed."
                }
              />
            }
          />
        )}
      </Panel>
    </div>
  );
}
