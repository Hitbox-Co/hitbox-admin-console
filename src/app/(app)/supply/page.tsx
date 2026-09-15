"use client";

import * as React from "react";
import { Info, Truck } from "lucide-react";
import { useSupply } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Mono, Panel } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { SupplyRow } from "@/lib/types";

export default function SupplyPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("drop")}
      what="Vendors"
      /* Gated on drop:read, not an ops-infra permission — supply is
         business-domain data about products. */
      requires="drop:read"
    >
      <SupplyView />
    </PageGuard>
  );
}

function SupplyView() {
  const list = useListState<{ vendorId?: string }>({ vendorId: undefined });
  const query = useSupply(list.params);

  usePageChrome({
    title: "Vendors",
    description: "Intake batches by vendor.",
  });

  const columns: Column<SupplyRow>[] = [
    {
      key: "vendor",
      header: "Vendor",
      cell: (r) => (
        <div>
          <p className="text-[13px] font-medium text-[var(--text-1)]">
            {r.vendor.name}
          </p>
          <p className="text-[11px] text-[var(--text-3)]">
            {humanize(r.vendor.vendorType)}
          </p>
        </div>
      ),
    },
    {
      key: "item",
      header: "Item type",
      cell: (r) => <Badge tone="neutral">{humanize(r.itemType)}</Badge>,
    },
    {
      key: "quantity",
      header: "Quantity",
      numeric: true,
      cell: (r) => formatNumber(r.quantity),
    },
    {
      key: "batch",
      header: "Batch ref",
      cell: (r) =>
        r.batchRef ? <Mono className="text-[11px]">{r.batchRef}</Mono> : "—",
    },
    {
      key: "received",
      header: "Received",
      cell: (r) =>
        r.receivedAt ? (
          <span className="tnum text-[12px] text-[var(--positive)]">
            {formatDate(r.receivedAt)}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">Not yet</span>
        ),
    },
    {
      key: "notes",
      header: "Notes",
      cell: (r) =>
        r.notes ? (
          <span className="max-w-[220px] truncate text-[12px] text-[var(--text-2)]">
            {r.notes}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-3)]">
        <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
        This endpoint has no product name, no status enum, and no
        ordered-vs-received split — it returns an item type and quantity per
        vendor batch, nothing more.
      </p>

      <Panel className="overflow-hidden">
        <FilterRow>
          <p className="text-[12px] text-[var(--text-3)]">
            {query.data
              ? `${formatNumber(query.data.activeVendors)} active vendors`
              : "Loading vendors…"}
          </p>
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
                  icon={Truck}
                  title="No supply batches"
                  description="Nothing is on intake for your scope right now."
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
  );
}
