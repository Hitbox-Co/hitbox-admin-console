"use client";

import * as React from "react";
import { Info, Receipt } from "lucide-react";
import { useDashboardFinance, useRevenueSummary } from "@/lib/api/hooks";
import { formatCurrency, formatNumber, moneyEntries } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { Panel, PanelHeader, Segmented, Tooltip } from "@/components/ui/primitives";
import { MoneyValue, currenciesIn } from "@/components/ui/money";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ui/states";
import { Meter } from "@/components/charts/charts";
import { SERIES, STATUS } from "@/components/charts/palette";
import type { FinanceSection, Period, RevenueSummaryRow } from "@/lib/types";

/**
 * Two different answers to "how did we do", side by side, on purpose.
 *
 * `GET /admin/finance/revenue-summary` reads the PLATFORM LEDGER: every line
 * that was actually posted — sale revenue, cost of goods, gateway fees,
 * refunds, chargebacks, royalty expense — and returns one row per currency.
 * That is the book of record.
 *
 * `GET /admin/dashboard/finance` is the reporting re-slice over orders and
 * payments for a chosen window. It moves faster (an order counts the moment
 * it is placed) and it is the one to read for a trend.
 *
 * They will not always agree, and the honest thing is to show both and say
 * which is which rather than pick one and call it revenue.
 */
export default function FinanceOverviewPage() {
  const [period, setPeriod] = React.useState<Period>("month");
  const summary = useRevenueSummary();
  const dashboard = useDashboardFinance(period);

  usePageChrome({
    title: "Finance",
    description: "Revenue, costs and margin — held apart by currency.",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[var(--text-3)]">
          Posted to the platform ledger, all time.
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
          <Info className="h-3 w-3" aria-hidden />
          There is no FX rate in this system, so currencies are never combined.
        </p>
      </div>

      {summary.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : !summary.data?.length ? (
        <Panel>
          <EmptyState
            icon={Receipt}
            title="Nothing posted to the ledger yet"
            description="Revenue appears here once an order settles and the sale is booked."
          />
        </Panel>
      ) : (
        <div className="animate-fade-rise grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summary.data.map((row) => (
            <RevenueCard key={row.currency} row={row} />
          ))}
        </div>
      )}

      <Panel>
        <PanelHeader
          title="Reporting view"
          description="Orders and payments over a window, from the dashboard service. Faster-moving than the ledger and not expected to match it line for line."
          action={
            <Segmented
              value={period}
              onChange={setPeriod}
              size="sm"
              options={[
                { value: "week" as Period, label: "7d" },
                { value: "month" as Period, label: "30d" },
                { value: "year" as Period, label: "12m" },
              ]}
            />
          }
        />
        {dashboard.isLoading ? (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : dashboard.isError ? (
          <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
        ) : dashboard.data ? (
          <DashboardFinance finance={dashboard.data} />
        ) : (
          <p className="px-4 py-6 text-[13px] text-[var(--text-3)]">
            No finance data was returned for this period.
          </p>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The ledger's own numbers                                            */
/* ------------------------------------------------------------------ */

/**
 * One card per currency, and no grand total anywhere on the screen.
 *
 * `netMargin` is computed server-side as gross less cost of goods, gateway
 * fees, refunds, chargebacks and royalties — it is not recomputed here from
 * the parts, because the strings would have to be parsed to floats to do it
 * and two of those added together stop being money.
 */
function RevenueCard({ row }: { row: RevenueSummaryRow }) {
  const gross = Number.parseFloat(row.grossRevenue) || 0;
  const margin = Number.parseFloat(row.netMargin) || 0;
  const marginPct = gross > 0 ? (margin / gross) * 100 : null;

  const deductions: [string, string][] = [
    ["Cost of goods", row.costOfGoods],
    ["Gateway fees", row.gatewayFees],
    ["Refunds", row.refunds],
    ["Chargebacks", row.chargebacks],
    ["Royalty expense", row.royaltyExpense],
  ];

  return (
    <Panel>
      <PanelHeader
        title={row.currency}
        description={`${formatNumber(row.orderCount)} ${row.orderCount === 1 ? "order" : "orders"} booked`}
      />
      <div className="space-y-4 px-4 py-4">
        <div>
          <p className="text-[11px] text-[var(--text-3)]">Net margin</p>
          <p className="tnum mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]">
            {formatCurrency(row.netMargin, row.currency)}
          </p>
          {marginPct !== null ? (
            <Tooltip content="Net margin as a share of gross revenue, within this currency only.">
              <p className="mt-1 cursor-help text-[12px] text-[var(--text-3)]">
                {marginPct.toFixed(1)}% of gross
              </p>
            </Tooltip>
          ) : null}
        </div>

        <div className="border-t border-[var(--hairline)] pt-3.5">
          <Meter
            label="Margin of gross"
            value={Math.round(Math.max(margin, 0))}
            max={Math.round(gross) || 1}
            color={margin >= 0 ? STATUS.good : STATUS.serious}
          />
        </div>

        <dl className="space-y-1.5 border-t border-[var(--hairline)] pt-3.5">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[12px] text-[var(--text-2)]">Gross revenue</dt>
            <dd className="tnum text-[12px] font-medium text-[var(--text-1)]">
              {formatCurrency(row.grossRevenue, row.currency)}
            </dd>
          </div>
          {deductions.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-[var(--text-3)]">{label}</dt>
              <dd className="tnum text-[12px] text-[var(--text-2)]">
                −{formatCurrency(value, row.currency)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* The dashboard re-slice                                              */
/* ------------------------------------------------------------------ */

const LINES: { key: keyof FinanceSection; label: string; note?: string }[] = [
  { key: "grossRevenue", label: "Gross revenue", note: "Order amount" },
  { key: "collectedRevenue", label: "Collected", note: "Succeeded payments" },
  { key: "refundedAmount", label: "Refunded", note: "Processed refunds only" },
  { key: "netRevenue", label: "Net revenue", note: "Collected less refunded" },
  { key: "costOfGoods", label: "Cost of goods" },
  { key: "gatewayFees", label: "Gateway fees" },
  { key: "royalties", label: "Royalties" },
  { key: "profit", label: "Profit", note: "Net less COGS, fees and royalties" },
];

function DashboardFinance({ finance }: { finance: FinanceSection }) {
  const currencies = React.useMemo(
    () => currenciesIn(finance.grossRevenue, finance.netRevenue, finance.profit),
    [finance]
  );

  if (!currencies.length) {
    return (
      <p className="px-4 py-6 text-[13px] text-[var(--text-3)]">
        No orders in this window.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {currencies.map((code) => (
          <CurrencyColumn key={code} finance={finance} currency={code} />
        ))}
      </div>

      <div className="overflow-x-auto rounded-[8px] border border-[var(--hairline)]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
                Line
              </th>
              {currencies.map((c) => (
                <th
                  key={c}
                  className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {LINES.map(({ key, label, note }) => (
              <tr key={key}>
                <td className="px-4 py-2.5">
                  <p className="text-[var(--text-1)]">{label}</p>
                  {note ? (
                    <p className="text-[11px] text-[var(--text-3)]">{note}</p>
                  ) : null}
                </td>
                {currencies.map((c) => {
                  const raw = finance[key][c];
                  return (
                    <td
                      key={c}
                      className="tnum px-4 py-2.5 text-right text-[var(--text-2)]"
                    >
                      {raw ? (
                        moneyEntries({ [c]: raw })[0].formatted
                      ) : (
                        <span className="text-[var(--text-3)]">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CurrencyColumn({
  finance,
  currency,
}: {
  finance: FinanceSection;
  currency: string;
}) {
  const num = (m: Record<string, string>) => Number.parseFloat(m[currency] ?? "0") || 0;

  const gross = num(finance.grossRevenue);
  const collected = num(finance.collectedRevenue);
  const net = num(finance.netRevenue);
  const profit = num(finance.profit);
  const one = (m: Record<string, string>) =>
    m[currency] !== undefined ? { [currency]: m[currency] } : undefined;

  const margin = net > 0 ? (profit / net) * 100 : null;

  return (
    <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3.5 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
        {currency}
      </p>
      <div className="mt-2.5">
        <p className="text-[11px] text-[var(--text-3)]">Profit</p>
        <MoneyValue money={one(finance.profit)} size="lg" />
        {margin !== null ? (
          <Tooltip content="Profit as a share of net revenue, within this currency only.">
            <p className="mt-1 cursor-help text-[12px] text-[var(--text-3)]">
              {margin.toFixed(1)}% of net revenue
            </p>
          </Tooltip>
        ) : null}
      </div>

      <div className="mt-3.5 space-y-3 border-t border-[var(--hairline)] pt-3.5">
        <Meter
          label="Collected of gross"
          value={Math.round(collected)}
          max={Math.round(gross) || 1}
          color={SERIES[0]}
        />
        <Meter
          label="Profit of net"
          value={Math.round(Math.max(profit, 0))}
          max={Math.round(net) || 1}
          color={STATUS.good}
        />
      </div>
    </div>
  );
}
