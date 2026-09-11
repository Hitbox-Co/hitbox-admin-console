"use client";

import * as React from "react";
import { Truck } from "lucide-react";
import { useSupply } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Panel, Tooltip, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { SupplyRow } from "@/lib/types";

export default function SupplyPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("drop")}
      what="Supply"
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
    title: "Supply",
    description: "Purchase orders against vendors, and what has landed.",
  });

  const columns: Column<SupplyRow>[] = [
    {
      key: "vendor",
      header: "Vendor",
      cell: (r) => (
        <span className="text-[13px] font-medium text-[var(--text-1)]">
          {r.vendorName}
        </span>
      ),
    },
    {
      key: "product",
      header: "Product",
      cell: (r) => <span className="text-[13px]">{r.productName}</span>,
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
      key: "ordered",
      header: "Ordered",
      numeric: true,
      cell: (r) => formatNumber(r.quantityOrdered),
    },
    {
      key: "received",
      header: "Received",
      numeric: true,
      cell: (r) => {
        const short = r.quantityReceived < r.quantityOrdered;
        return (
          <Tooltip
            content={
              short
                ? `${formatNumber(r.quantityOrdered - r.quantityReceived)} units outstanding`
                : "Fully received"
            }
          >
            <span
              className={
                short ? "cursor-help text-[var(--warning)]" : "cursor-help text-[var(--positive)]"
              }
            >
              {formatNumber(r.quantityReceived)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "expected",
      header: "Expected",
      cell: (r) => (
        <span className="tnum text-[12px] text-[var(--text-3)]">
          {formatDate(r.expectedAt)}
        </span>
      ),
    },
  ];

  return (
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
                title="No purchase orders"
                description="Nothing is on order for your scope right now."
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
