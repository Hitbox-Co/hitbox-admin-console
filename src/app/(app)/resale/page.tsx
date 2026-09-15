"use client";

import * as React from "react";
import { Info, Repeat } from "lucide-react";
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

  const columns = React.useMemo<Column<ResaleRow>[]>(() => {
    const cols: Column<ResaleRow>[] = [
      {
        key: "sku",
        header: "SKU",
        cell: (r) => <Mono className="text-[11px]">{r.skuId}</Mono>,
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
    cols.push({
      key: "listed",
      header: "Listed",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
    });
    return cols;
  }, [canMoney]);

  const counts = query.data?.counts;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-3)]">
        <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
        This endpoint returns a SKU id only — no product name and no seller
        id. Look the SKU up in Products if you need the item&rsquo;s name.
      </p>

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
          <TableSkeleton rows={10} cols={4} />
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
