"use client";

import * as React from "react";
import { Package, ShieldAlert } from "lucide-react";
import { usePrefetchProduct, useProducts } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import {
  Badge,
  Button,
  Mono,
  Panel,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ProductDrawer } from "@/components/products/product-drawer";
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
  const [openId, setOpenId] = React.useState<string | null>(null);
  const prefetchProduct = usePrefetchProduct();

  usePageChrome({
    title: "Products",
    description:
      "Every drop in your scope, across all nine lifecycle states. Open one for its units and sales.",
  });

  /*
   * No Sold / Available / Sell-through columns here: this endpoint returns
   * the catalog record only. Those counts come from
   * GET /admin/products/:id -> performance, which is per-product, so they
   * live in the drawer. Rendering them here would mean showing zeroes for
   * fields the API never sent.
   */
  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{r.name}</p>
          <Mono className="mt-0.5 text-[10px]">{r.groupCode}</Mono>
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
      key: "compliance",
      header: "Compliance",
      cell: (r) =>
        r.complianceStatus ? (
          <Badge tone={toneForStatus(r.complianceStatus)}>
            {humanize(r.complianceStatus)}
          </Badge>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
    {
      key: "supply",
      header: "Supply",
      numeric: true,
      cell: (r) => formatNumber(r.totalSupply),
    },
    {
      key: "age",
      header: "Age restriction",
      cell: (r) =>
        r.isAgeSpecific ? (
          <Tooltip content="Age-restricted. A release cannot be approved without a minimum age.">
            <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--warning-dim)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warning)]">
              <ShieldAlert className="h-3 w-3" aria-hidden />
              {r.minimumAge ? `${r.minimumAge}+` : "No minimum"}
            </span>
          </Tooltip>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">None</span>
        ),
    },
    {
      key: "published",
      header: "Published",
      cell: (r) => (
        <span className="tnum text-[12px] text-[var(--text-3)]">
          {formatDate(r.publishedAt)}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setOpenId(r.id);
          }}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <>
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
          <TableSkeleton rows={10} cols={8} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data?.items ?? []}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setOpenId(r.id)}
              // Mirrors the drawer's own first-page params — a prefetch under
              // any other key is a request the drawer will never read.
              onRowIntent={(r) => prefetchProduct(r.id, { skuPage: 1, skuLimit: 50 })}
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

      {openId ? (
        <ProductDrawer productId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
