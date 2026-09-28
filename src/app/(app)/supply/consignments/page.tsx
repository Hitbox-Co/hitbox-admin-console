"use client";

import * as React from "react";
import { AlertTriangle, PackageCheck, Plus } from "lucide-react";
import { useSupplyBatches } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Mono, Panel, Tooltip, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import {
  FilterRow,
  FilterSelect,
  SearchInput,
  useListState,
} from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ConsignmentDrawer } from "@/components/supply/consignment-drawer";
import { NewConsignmentDrawer } from "@/components/supply/new-consignment-drawer";
import { SUPPLY_ITEM_TYPES, type SupplyBatch } from "@/lib/types";

/**
 * Consignment headers are gated on `drop:read`, not on tag custody.
 *
 * A header is planning data for whoever runs the drop, and HITBOX_DROP_MANAGER
 * holds no nfc-tag-claim grant at all — gating this on tag custody would lock
 * that role out of a screen it cannot do its job without. The consequence,
 * stated out loud: a Drop Manager sees every carton on the platform and not
 * one chip. Whoever plans the drop needs to know 5,000 chips arrived; they do
 * not need to know which 5,000.
 */
export default function ConsignmentsPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("drop")}
      what="Consignments"
      requires="drop:read"
    >
      <ConsignmentsView />
    </PageGuard>
  );
}

function ConsignmentsView() {
  const perms = usePermissions();
  const list = useListState<{ status?: string; itemType?: string }>({
    status: undefined,
    itemType: undefined,
  });
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<SupplyBatch | null>(null);
  const [creating, setCreating] = React.useState(false);

  const canWrite = perms.can("nfc-tag-claim", "manage", "global");

  const query = useSupplyBatches({ ...list.params, search: q || undefined });

  usePageChrome({
    title: "Consignments",
    description: "What arrived, from whom, and whether it matched the paperwork.",
  });

  const columns: Column<SupplyBatch>[] = [
    {
      key: "batch",
      header: "Consignment",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
            {r.batchRef ?? "—"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">
            {r.vendor?.name ?? "Unknown vendor"}
            {r.vendorInvoiceRef ? ` · ${r.vendorInvoiceRef}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "drop",
      header: "Drop",
      cell: (r) =>
        r.drop ? (
          <div className="min-w-0">
            <p className="truncate text-[12px] text-[var(--text-2)]">{r.drop.name}</p>
            <Mono className="text-[10px]">{r.drop.groupCode}</Mono>
          </div>
        ) : (
          <Tooltip content="Platform chip stock, bought ahead of any particular drop. A consignment with no drop is invisible to a brand — how much stock HitBox holds is not a brand's business.">
            <span className="cursor-help text-[12px] text-[var(--text-3)]">
              Platform stock
            </span>
          </Tooltip>
        ),
    },
    {
      key: "type",
      header: "Contains",
      cell: (r) => <Badge tone="neutral">{humanize(r.itemType)}</Badge>,
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
      key: "counts",
      header: "Declared / registered",
      numeric: true,
      cell: (r) => (
        <span className="tnum text-[12px] text-[var(--text-2)]">
          {formatNumber(r.reconciliation.registered)} /{" "}
          {formatNumber(r.reconciliation.declared)}
        </span>
      ),
    },
    {
      key: "shortfall",
      header: "Shortfall",
      numeric: true,
      cell: (r) =>
        r.reconciliation.shortfall > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--warning-dim)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warning)]">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {formatNumber(r.reconciliation.shortfall)}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
    {
      key: "received",
      header: "Received",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.receivedAt)}</span>,
    },
  ];

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <>
      {canWrite ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Book in
          </Button>
        </PageActions>
      ) : null}

      <Panel>
        <FilterRow
          active={list.active || !!q}
          onReset={() => {
            list.reset();
            setQ("");
          }}
        >
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              list.setPage(1);
            }}
            placeholder="Batch or invoice reference"
            className="w-60"
          />
          <FilterSelect
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={["UPLOADED", "VALIDATED", "ACCEPTED", "REJECTED"]}
          />
          <FilterSelect
            label="Contains"
            value={list.filters.itemType}
            onChange={(v) => list.setFilter("itemType", v)}
            options={SUPPLY_ITEM_TYPES}
          />
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton cols={7} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="No consignments"
            description="Nothing has been booked in against these filters."
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setOpen(r)}
              dimmed={query.isFetching}
            />
            {meta ? (
              <Pagination
                page={meta.page}
                limit={meta.limit}
                total={meta.total}
                onPageChange={list.setPage}
                onLimitChange={list.setLimit}
              />
            ) : null}
          </>
        )}
      </Panel>

      {creating ? <NewConsignmentDrawer onClose={() => setCreating(false)} /> : null}
      {open ? (
        <ConsignmentDrawer batch={open} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}
