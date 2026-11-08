"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, PackageCheck, RefreshCw, ScanLine } from "lucide-react";
import { useFulfilmentQueue, useProductVariants } from "@/lib/api/hooks";
import { formatDateTime, formatRelative, humanize } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel, PanelHeader, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { DropPicker } from "@/components/finance/entity-pickers";
import { UnitStateChip } from "@/components/packing/packing-ui";
import type { OrderPackingState } from "@/lib/types";

/**
 * Packing queue — paid orders waiting for their physical unit, oldest first
 * (order-unit-assignment-api.md §4). Live: re-read every 30 s and when the
 * station's window regains focus.
 *
 * Narrow to one drop and variant so a packer standing at the "M / Black" bin
 * clears exactly those orders.
 */
export default function PackingQueuePage() {
  return (
    <PageGuard can={(p) => p.canOpen("/packing")} what="Packing" requires="order:read">
      <QueueView />
    </PageGuard>
  );
}

function QueueView() {
  const router = useRouter();
  const perms = usePermissions();
  const canScan = perms.can("order", "manage");
  const canPickDrop = perms.reaches("drop");

  const [productId, setProductId] = React.useState<string | undefined>();
  const [variantId, setVariantId] = React.useState<string | undefined>();
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const queue = useFulfilmentQueue({ productId, variantId, page, limit });
  const variants = useProductVariants(productId, false, !!productId);

  usePageChrome({
    title: "Packing",
    description: "Paid orders waiting for their physical unit, oldest first.",
  });

  const columns = React.useMemo<Column<OrderPackingState>[]>(
    () => [
      {
        key: "order",
        header: "Order",
        cell: (r) => <Mono className="text-[11px]">{r.publicCode}</Mono>,
      },
      {
        key: "product",
        header: "Drop",
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{r.productName}</p>
            <p className="truncate font-mono text-[10.5px] text-[var(--text-3)]">{r.productCode}</p>
          </div>
        ),
      },
      {
        key: "pick",
        header: "Pick",
        cell: (r) =>
          r.variantLabel ? (
            <Badge tone="accent" className="text-[12px]">
              {r.variantLabel}
            </Badge>
          ) : (
            <span className="text-[12px] text-[var(--text-3)]">No variant</span>
          ),
      },
      {
        key: "state",
        header: "State",
        cell: (r) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <UnitStateChip state={r.unitState} />
            <Badge tone={toneForStatus(r.status)}>{humanize(r.status)}</Badge>
          </span>
        ),
      },
      {
        key: "placed",
        header: "Placed",
        cell: (r) => (
          <span className="tnum text-[12px]" title={formatDateTime(r.placedAt)}>
            {formatRelative(r.placedAt)}
          </span>
        ),
      },
      {
        key: "go",
        header: "",
        cell: (r) => (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/packing/${r.orderId}`} onClick={(e) => e.stopPropagation()}>
              {canScan ? "Pack" : "View"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ),
      },
    ],
    [canScan]
  );

  return (
    <div className="space-y-4">
      {canScan ? (
        <PageActions>
          <Button asChild variant="primary" size="sm">
            <Link href="/packing/scan">
              <ScanLine className="h-3.5 w-3.5" />
              Scan item
            </Link>
          </Button>
        </PageActions>
      ) : null}

      <Panel className="overflow-hidden">
        <PanelHeader
          title="To pack"
          description={
            queue.data
              ? `${queue.data.total} order${queue.data.total === 1 ? "" : "s"} waiting · updates every 30 seconds`
              : undefined
          }
          action={
            <Button variant="ghost" size="sm" onClick={() => queue.refetch()} loading={queue.isFetching && !queue.isLoading}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />
        {canPickDrop ? (
          <FilterRow
            active={!!productId}
            onReset={() => {
              setProductId(undefined);
              setVariantId(undefined);
              setPage(1);
            }}
          >
            <div className="w-[240px]">
              <DropPicker
                value={productId}
                onChange={(v) => {
                  setProductId(v);
                  setVariantId(undefined);
                  setPage(1);
                }}
                size="sm"
                placeholder="All drops"
                aria-label="Filter by drop"
              />
            </div>
            {productId && (variants.data?.length ?? 0) > 0 ? (
              <select
                value={variantId ?? ""}
                onChange={(e) => {
                  setVariantId(e.target.value || undefined);
                  setPage(1);
                }}
                aria-label="Filter by variant"
                className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text-1)]"
              >
                <option value="">All variants</option>
                {variants.data!.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="text-[11px] text-[var(--text-3)]">Narrow to the bin you&rsquo;re standing at.</span>
          </FilterRow>
        ) : null}

        {queue.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : queue.isError ? (
          <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={queue.data?.items ?? []}
              getRowKey={(r) => r.orderId}
              onRowClick={(r) => router.push(`/packing/${r.orderId}`)}
              dimmed={queue.isFetching}
              emptyState={
                <EmptyState
                  icon={PackageCheck}
                  title="Nothing to pack"
                  description={
                    productId
                      ? "No paid order is waiting for this drop or variant."
                      : "Every paid order has its unit scanned."
                  }
                />
              }
            />
            <Pagination
              page={queue.data?.page ?? 1}
              limit={queue.data?.limit ?? limit}
              total={queue.data?.total ?? 0}
              onPageChange={setPage}
              onLimitChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
