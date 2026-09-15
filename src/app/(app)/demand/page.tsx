"use client";

import * as React from "react";
import { Info, TrendingUp } from "lucide-react";
import { useDemandSignals } from "@/lib/api/hooks";
import { formatNumber, formatPercent } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel, PanelHeader, Tooltip } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { RankedBarChart } from "@/components/charts/charts";
import type { DemandSignalRow } from "@/lib/types";

export default function DemandPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("drop")}
      what="Product demand"
      requires="drop:read"
    >
      <DemandView />
    </PageGuard>
  );
}

/** Watch -> waitlist conversion is not returned by the API — computed here. */
function conversionOf(row: DemandSignalRow): number {
  return row.follows > 0 ? (row.wishlists / row.follows) * 100 : 0;
}

function DemandView() {
  const query = useDemandSignals();
  const rows = query.data ?? [];

  usePageChrome({
    title: "Product demand",
    description: "Top 10 drops by wishlist count — no pagination on this endpoint.",
  });

  const columns: Column<DemandSignalRow>[] = [
    {
      key: "product",
      header: "Drop",
      cell: (r) => (
        <span className="text-[13px] font-medium text-[var(--text-1)]">{r.name}</span>
      ),
    },
    {
      key: "follows",
      header: (
        <Tooltip content="This counts follows of the drop's ARTIST, not the drop itself — that is what the underlying query does.">
          <span className="inline-flex cursor-help items-center gap-1">
            Artist follows
            <Info className="h-3 w-3" />
          </span>
        </Tooltip>
      ),
      numeric: true,
      cell: (r) => formatNumber(r.follows),
    },
    {
      key: "wishlists",
      header: "Wishlisted",
      numeric: true,
      cell: (r) => formatNumber(r.wishlists),
    },
    {
      key: "conversion",
      header: "Follow → wishlist",
      numeric: true,
      cell: (r) => {
        const pct = conversionOf(r);
        return (
          <span
            className={
              pct >= 25
                ? "font-medium text-[var(--positive)]"
                : "text-[var(--text-3)]"
            }
          >
            {formatPercent(pct)}
          </span>
        );
      },
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
          description="Signals appear once buyers start following artists or wishlisting upcoming drops."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-3)]">
        <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
        &ldquo;Artist follows&rdquo; is the API&rsquo;s <code className="font-mono text-[var(--accent-text)]">follows</code>{" "}
        field — it counts people following the product&rsquo;s artist, not
        people watching this specific product. Read it as artist reach, not
        per-product interest.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="overflow-hidden lg:col-span-2">
          <PanelHeader title="By drop" />
          <DataTable columns={columns} rows={rows} getRowKey={(r) => r.productId} />
        </Panel>

        <Panel>
          <PanelHeader title="Wishlisted" description="Ranked by wishlist count." />
          <div className="p-3">
            <RankedBarChart
              data={rows.map((r) => ({ name: r.name, value: r.wishlists }))}
              valueLabel="Wishlisted"
              height={Math.max(200, rows.length * 30)}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
