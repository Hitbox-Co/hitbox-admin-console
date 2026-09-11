"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { useMarkets } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel, PanelHeader, Segmented } from "@/components/ui/primitives";
import { MoneyValue } from "@/components/ui/money";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { RankedBarChart } from "@/components/charts/charts";
import type { MarketRow, Period } from "@/lib/types";

export default function MarketsPage() {
  return (
    <PageGuard
      can={(p) =>
        p.canRead("reports-dashboards") &&
        (p.canRead("order") || p.canRead("buyer-profile"))
      }
      what="Market reporting"
      requires="reports-dashboards:read"
    >
      <MarketsView />
    </PageGuard>
  );
}

function MarketsView() {
  const [period, setPeriod] = React.useState<Period>("month");
  const perms = usePermissions();
  const query = useMarkets(period);

  usePageChrome({
    title: "Markets",
    description: "The same data you already hold, re-sliced by market.",
  });

  const canMoney = perms.canRead("payment-royalty");
  const canOrders = perms.canRead("order");
  const canUsers = perms.canRead("buyer-profile");
  const rows = query.data ?? [];

  const columns = React.useMemo<Column<MarketRow>[]>(() => {
    const cols: Column<MarketRow>[] = [
      {
        key: "market",
        header: "Market",
        cell: (r) => (
          <div className="flex items-center gap-2.5">
            <span className="rounded-[4px] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-2)]">
              {r.code}
            </span>
            <span className="text-[13px] font-medium text-[var(--text-1)]">
              {r.name}
            </span>
          </div>
        ),
      },
      {
        key: "currency",
        header: "Currency",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[var(--text-3)]">
            {r.currency}
          </span>
        ),
      },
    ];

    if (canUsers) {
      cols.push(
        {
          key: "users",
          header: "Buyers",
          numeric: true,
          cell: (r) => formatNumber(r.users),
        },
        {
          key: "newUsers",
          header: "New buyers",
          numeric: true,
          cell: (r) => (
            <span className="text-[var(--text-3)]">{formatNumber(r.newUsers)}</span>
          ),
        }
      );
    }
    if (canOrders) {
      cols.push(
        {
          key: "orders",
          header: "Orders",
          numeric: true,
          cell: (r) => formatNumber(r.orders),
        },
        {
          key: "newOrders",
          header: "New orders",
          numeric: true,
          cell: (r) => (
            <span className="text-[var(--text-3)]">{formatNumber(r.newOrders)}</span>
          ),
        }
      );
    }
    if (canMoney) {
      cols.push({
        key: "revenue",
        header: "Revenue",
        numeric: true,
        cell: (r) => <MoneyValue money={r.revenue} size="sm" />,
      });
    }
    return cols;
  }, [canMoney, canOrders, canUsers]);

  const chartData = rows.map((m) => ({
    name: m.name,
    value: canOrders ? m.orders : m.users,
  }));

  return (
    <div className="space-y-4">
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { value: "week" as Period, label: "7 days" },
          { value: "month" as Period, label: "30 days" },
          { value: "year" as Period, label: "12 months" },
        ]}
      />

      {query.isLoading ? (
        <Panel>
          <TableSkeleton rows={5} cols={6} />
        </Panel>
      ) : query.isError ? (
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Globe}
            title="No market activity in this window"
            description="Widen the period, or check back once orders land."
          />
        </Panel>
      ) : (
        <div className="animate-fade-rise grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2 overflow-hidden">
            <PanelHeader title="By market" />
            <DataTable columns={columns} rows={rows} getRowKey={(r) => r.marketId} />
          </Panel>

          <Panel>
            <PanelHeader title={canOrders ? "Orders" : "Buyers"} />
            <div className="p-3">
              <RankedBarChart
                data={chartData}
                valueLabel={canOrders ? "Orders" : "Buyers"}
                height={Math.max(160, chartData.length * 38)}
              />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
