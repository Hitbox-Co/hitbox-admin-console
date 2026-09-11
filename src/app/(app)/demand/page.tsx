"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { useDemandSignals } from "@/lib/api/hooks";
import { formatNumber, formatPercent } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { RankedBarChart } from "@/components/charts/charts";
import type { DemandSignalRow } from "@/lib/types";

export default function DemandPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("drop")}
      what="Demand signals"
      requires="drop:read"
    >
      <DemandView />
    </PageGuard>
  );
}

function DemandView() {
  const query = useDemandSignals();
  const rows = query.data ?? [];

  usePageChrome({
    title: "Demand signals",
    description: "Watchers and waitlists ahead of a drop.",
  });

  const columns: Column<DemandSignalRow>[] = [
    {
      key: "product",
      header: "Product",
      cell: (r) => (
        <span className="text-[13px] font-medium text-[var(--text-1)]">
          {r.productName}
        </span>
      ),
    },
    {
      key: "watchers",
      header: "Watchers",
      numeric: true,
      cell: (r) => formatNumber(r.watchers),
    },
    {
      key: "waitlisted",
      header: "Waitlisted",
      numeric: true,
      cell: (r) => formatNumber(r.waitlisted),
    },
    {
      key: "conversion",
      header: "Watch → waitlist",
      numeric: true,
      cell: (r) => (
        <span
          className={
            r.conversionRate >= 30
              ? "font-medium text-[var(--positive)]"
              : r.conversionRate < 15
                ? "text-[var(--text-3)]"
                : undefined
          }
        >
          {formatPercent(r.conversionRate)}
        </span>
      ),
    },
  ];

  if (query.isLoading) {
    return (
      <Panel>
        <TableSkeleton rows={10} cols={4} />
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Panel>
    );
  }
  if (rows.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={TrendingUp}
          title="No demand signals yet"
          description="Signals appear once buyers start watching upcoming drops."
        />
      </Panel>
    );
  }

  return (
    <div className="animate-fade-rise grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel className="overflow-hidden lg:col-span-2">
        <PanelHeader title="By product" />
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.productId} />
      </Panel>

      <Panel>
        <PanelHeader title="Watchers" description="Ranked interest ahead of release." />
        <div className="p-3">
          <RankedBarChart
            data={rows.map((r) => ({ name: r.productName, value: r.watchers }))}
            valueLabel="Watchers"
            height={Math.max(200, rows.length * 30)}
          />
        </div>
      </Panel>
    </div>
  );
}
