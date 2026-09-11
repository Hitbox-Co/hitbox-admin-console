"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { useDashboardFinance } from "@/lib/api/hooks";
import { moneyEntries } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel, PanelHeader, Segmented, Tooltip } from "@/components/ui/primitives";
import { MoneyValue, currenciesIn } from "@/components/ui/money";
import { CardSkeleton, ErrorState } from "@/components/ui/states";
import { Meter } from "@/components/charts/charts";
import { SERIES, STATUS } from "@/components/charts/palette";
import type { FinanceSection, Period } from "@/lib/types";

export default function FinancePage() {
  return (
    <PageGuard
      can={(p) => p.canRead("payment-royalty")}
      what="Finance"
      requires="payment-royalty:read"
    >
      <FinanceView />
    </PageGuard>
  );
}

function FinanceView() {
  const [period, setPeriod] = React.useState<Period>("month");
  const query = useDashboardFinance(period);

  usePageChrome({
    title: "Finance",
    description: "Revenue, costs and margin — held apart by currency.",
  });

  const f = query.data;
  const currencies = React.useMemo(
    () => (f ? currenciesIn(f.grossRevenue, f.netRevenue, f.profit) : []),
    [f]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week" as Period, label: "7 days" },
            { value: "month" as Period, label: "30 days" },
            { value: "year" as Period, label: "12 months" },
          ]}
        />
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
          <Info className="h-3 w-3" aria-hidden />
          There is no FX rate in this system, so currencies are never combined.
        </p>
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !f ? (
        <Panel className="p-6">
          <p className="text-[13px] text-[var(--text-3)]">
            No finance data was returned for this period.
          </p>
        </Panel>
      ) : (
        <div className="animate-fade-rise space-y-4">
          {/* One column per currency — the honest layout for money with no FX */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {currencies.map((code) => (
              <CurrencyColumn key={code} finance={f} currency={code} />
            ))}
          </div>

          <Panel>
            <PanelHeader
              title="All figures, every currency"
              description="The raw values as the API returned them."
            />
            <div className="overflow-x-auto">
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
                        const raw = f[key][c];
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
          </Panel>
        </div>
      )}
    </div>
  );
}

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
    <Panel>
      <PanelHeader
        title={currency}
        description="Collection and margin within this currency."
      />
      <div className="space-y-4 px-4 py-4">
        <div>
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

        <div className="space-y-3 border-t border-[var(--hairline)] pt-3.5">
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

        <div className="border-t border-[var(--hairline)] pt-3.5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
            Deductions
          </p>
          <dl className="space-y-1.5">
            {(
              [
                ["Cost of goods", finance.costOfGoods],
                ["Gateway fees", finance.gatewayFees],
                ["Royalties", finance.royalties],
                ["Refunded", finance.refundedAmount],
              ] as const
            ).map(([label, money]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className="text-[12px] text-[var(--text-2)]">{label}</dt>
                <dd className="tnum text-[12px] font-medium text-[var(--text-1)]">
                  {money[currency]
                    ? moneyEntries({ [currency]: money[currency] })[0].formatted
                    : "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Panel>
  );
}
