"use client";

import * as React from "react";
import { Repeat } from "lucide-react";
import { useResale } from "@/lib/api/hooks";
import { formatCurrency, formatDate, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { ResaleRow } from "@/lib/types";

export default function ResalePage() {
  return (
    <PageGuard
      can={(p) => p.canRead("order")}
      what="The resale market"
      requires="order:read"
    >
      <ResaleView />
    </PageGuard>
  );
}

function ResaleView() {
  const list = useListState<{ status?: string }>({ status: undefined });
  const perms = usePermissions();
  const query = useResale(list.params);

  usePageChrome({
    title: "Resale",
    description: "Secondary-market listings and blocked resales.",
  });

  const canMoney = perms.canRead("payment-royalty");
  const canBuyer = perms.canRead("buyer-profile");

  const columns = React.useMemo<Column<ResaleRow>[]>(() => {
    const cols: Column<ResaleRow>[] = [
      {
        key: "product",
        header: "Product",
        cell: (r) => (
          <div>
            <p className="text-[13px] font-medium text-[var(--text-1)]">
              {r.productName}
            </p>
            <Mono className="mt-0.5 text-[10px]">{r.skuId}</Mono>
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
    ];

    if (canMoney) {
      cols.push({
        key: "price",
        header: "Ask",
        numeric: true,
        cell: (r) =>
          r.price && r.currency ? (
            <span className="font-medium text-[var(--text-1)]">
              {formatCurrency(r.price, r.currency)}
            </span>
          ) : (
            "—"
          ),
      });
    }
    if (canBuyer) {
      cols.push({
        key: "seller",
        header: "Seller",
        cell: (r) => (r.sellerId ? <Mono className="text-[11px]">{r.sellerId}</Mono> : "—"),
      });
    }
    cols.push({
      key: "listed",
      header: "Listed",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.listedAt)}</span>,
    });
    return cols;
  }, [canMoney, canBuyer]);

  const counts = query.data?.counts;

  return (
    <div className="space-y-4">
      {counts ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(counts).map(([status, count]) => (
            <Panel key={status} className="px-4 py-3">
              <p className="text-[11px] text-[var(--text-3)]">{humanize(status)}</p>
              <p className="tnum mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                {formatNumber(count)}
              </p>
            </Panel>
          ))}
        </div>
      ) : null}

      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.active}>
          <FilterSelect
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={["ACTIVE", "SOLD", "WITHDRAWN", "BLOCKED"]}
            allLabel="All statuses"
          />
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={5} />
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
                  icon={Repeat}
                  title="No resale listings"
                  description="Nothing is listed on the secondary market for this selection."
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
