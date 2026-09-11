"use client";

import * as React from "react";
import { Package } from "lucide-react";
import { useProducts } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { ProductRow } from "@/lib/types";

const DROP_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "ACTIVE",
  "ENDED",
  "ARCHIVED",
];

export default function ProductsPage() {
  return (
    <PageGuard can={(p) => p.canRead("drop")} what="The catalog" requires="drop:read">
      <ProductsView />
    </PageGuard>
  );
}

function ProductsView() {
  const list = useListState<{ status?: string }>({ status: undefined });
  const query = useProducts(list.params);

  usePageChrome({
    title: "Products",
    description: "Every drop in your scope, across all nine lifecycle states.",
  });

  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (r) => (
        <div>
          <p className="text-[13px] font-medium text-[var(--text-1)]">{r.name}</p>
          <Mono className="mt-0.5 text-[10px]">{r.id.slice(0, 12)}…</Mono>
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
      key: "supply",
      header: "Supply",
      numeric: true,
      cell: (r) => formatNumber(r.totalSupply),
    },
    { key: "sold", header: "Sold", numeric: true, cell: (r) => formatNumber(r.sold) },
    {
      key: "available",
      header: "Available",
      numeric: true,
      cell: (r) => {
        const tight = r.available / Math.max(r.totalSupply, 1) < 0.1;
        return (
          <span className={tight ? "font-medium text-[var(--warning)]" : undefined}>
            {formatNumber(r.available)}
          </span>
        );
      },
    },
    {
      key: "sell-through",
      header: "Sell-through",
      numeric: true,
      cell: (r) =>
        r.totalSupply > 0 ? `${((r.sold / r.totalSupply) * 100).toFixed(0)}%` : "—",
    },
    {
      key: "created",
      header: "Created",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <Panel className="overflow-hidden">
      <FilterRow onReset={list.reset} active={list.active}>
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          options={DROP_STATUSES}
          allLabel="All states"
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
            dimmed={query.isFetching}
            emptyState={
              <EmptyState
                icon={Package}
                title="No products match these filters"
                description={
                  list.active
                    ? "Try a different lifecycle state."
                    : "No drops exist in your scope yet."
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
  );
}
