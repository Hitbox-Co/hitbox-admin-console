"use client";

import * as React from "react";
import { Info, Plus, Truck } from "lucide-react";
import { useVendors } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Mono, Panel, Tooltip } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { VendorDrawer } from "@/components/supply/vendor-drawer";
import { VENDOR_TYPES, type Vendor } from "@/lib/types";

/**
 * The vendor directory is PLATFORM-level, and reading it needs `drop:read` at
 * GLOBAL reach rather than merely a consignment grant. A brand may see the
 * consignments ordered for their own drops — that is their supply — but who
 * HitBox buys chips from, on what terms and at which contact address is a
 * commercial relationship of the platform's.
 */
export default function VendorsPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/supply/vendors")}
      what="The vendor directory"
      requires="drop:read:global"
    >
      <VendorsView />
    </PageGuard>
  );
}

function VendorsView() {
  const perms = usePermissions();
  const list = useListState<{ vendorType?: string; country?: string }>({
    vendorType: undefined,
    country: undefined,
  });
  const [q, setQ] = React.useState("");
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<Vendor | null>(null);
  const [creating, setCreating] = React.useState(false);

  /* Every write in this module is globalOnly — supply intake is platform custody. */
  const canWrite = perms.can("nfc-tag-claim", "manage", "global");

  const query = useVendors({
    ...list.params,
    search: q || undefined,
    includeArchived,
  });

  usePageChrome({
    title: "Vendors",
    description: "Who makes the chips and the merchandise.",
  });

  const columns: Column<Vendor>[] = [
    {
      key: "vendor",
      header: "Vendor",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
            {r.name}
          </p>
          {r.legalName ? (
            <p className="truncate text-[11px] text-[var(--text-3)]">{r.legalName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "type",
      header: "Makes",
      cell: (r) => <Badge tone="neutral">{humanize(r.vendorType)}</Badge>,
    },
    {
      key: "country",
      header: "Country",
      cell: (r) =>
        r.country ? (
          <Mono className="text-[11px]">{r.country}</Mono>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (r) =>
        r.contactEmail || r.contactName ? (
          <div className="min-w-0">
            {r.contactName ? (
              <p className="truncate text-[12px] text-[var(--text-2)]">{r.contactName}</p>
            ) : null}
            {r.contactEmail ? (
              <p className="truncate text-[11px] text-[var(--text-3)]">
                {r.contactEmail}
              </p>
            ) : null}
          </div>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
    {
      key: "counts",
      header: "In use",
      numeric: true,
      cell: (r) => (
        <Tooltip content="Live counts. A vendor with consignments against it cannot be deleted — retiring is the only exit, because removing it would remove the record that those consignments arrived.">
          <span className="tnum cursor-help text-[12px] text-[var(--text-2)]">
            {formatNumber(r.counts.batches)} / {formatNumber(r.counts.units)}
          </span>
        </Tooltip>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        r.archivedAt ? (
          <Badge tone="neutral">Retired</Badge>
        ) : (
          <Badge tone={r.isActive ? "positive" : "neutral"} dot>
            {r.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
    },
    {
      key: "created",
      header: "Registered",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
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
            Register vendor
          </Button>
        </PageActions>
      ) : null}

      <Panel>
        <FilterRow onReset={list.active || q ? () => { list.reset(); setQ(""); } : undefined}>
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              list.setPage(1);
            }}
            placeholder="Name or legal name"
            className="w-60"
          />
          <FilterSelect
            label="Makes"
            value={list.filters.vendorType}
            onChange={(v) => list.setFilter("vendorType", v)}
            options={VENDOR_TYPES}
          />
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => {
                setIncludeArchived(e.target.checked);
                list.setPage(1);
              }}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Include retired
          </label>
          {!canWrite ? (
            <p className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
              <Info className="h-3 w-3" aria-hidden />
              Read-only — registering needs nfc-tag-claim:manage
            </p>
          ) : null}
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton cols={7} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No vendors"
            description="Register the manufacturer before booking its first consignment."
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.id}
              onRowClick={canWrite ? (r) => setEditing(r) : undefined}
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

      {creating ? <VendorDrawer onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <VendorDrawer vendor={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
