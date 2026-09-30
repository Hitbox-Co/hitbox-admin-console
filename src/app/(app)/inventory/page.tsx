"use client";

import * as React from "react";
import { Boxes, Lock, Pencil, ShieldAlert } from "lucide-react";
import { useInventory } from "@/lib/api/hooks";
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
import { BatchEditDrawer } from "@/components/inventory/batch-edit-drawer";
import type { SkuUnit } from "@/lib/types";

/**
 * The cross-drop unit list.
 *
 * `/admin/skus` admits GLOBAL grants only — a router with no product in its
 * path has no organization to check a grant against. An organization-scoped
 * caller works through a drop's own units panel instead, which is the same
 * data reached by a route that has a product to scope against.
 */
export default function InventoryPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/inventory")}
      what="Cross-drop inventory"
      requires="collectible-instance:read (platform-wide)"
    >
      <InventoryView />
    </PageGuard>
  );
}

function InventoryView() {
  const perms = usePermissions();
  const list = useListState<{
    claimedStatus?: string;
    tagLifecycleState?: string;
    tagged?: string;
    resaleBlocked?: string;
  }>({
    claimedStatus: undefined,
    tagLifecycleState: undefined,
    tagged: undefined,
    resaleBlocked: undefined,
  });
  const [q, setQ] = React.useState("");
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState(false);

  const canEdit = perms.can("collectible-instance", "manage");
  /*
   * 🔒 A FILTER IS A READ OF THE COLUMN IT NAMES. The trust filters name
   * columns a caller without collectible-instance at full scope is not shown,
   * and the server refuses them with SKUS_FILTER_FORBIDDEN. Offering a control
   * that is guaranteed to 403 is worse than not offering it.
   *
   * `tagged` and `tagLifecycleState` stay offered to everyone: they are
   * population facts, not identifying ones — "how many units still need a
   * tag" is how a partial rollout is driven, and no amount of asking it
   * yields a UID.
   */
  const canFilterTrust = perms.can("collectible-instance", "read", "global");

  const query = useInventory({
    ...list.params,
    // Booleans mean what they say: the API used to parse these with
    // Boolean(input), which made "false" true. Send real booleans.
    tagged: list.filters.tagged ? list.filters.tagged === "true" : undefined,
    resaleBlocked: list.filters.resaleBlocked
      ? list.filters.resaleBlocked === "true"
      : undefined,
    includeArchived,
    search: q || undefined,
  });

  usePageChrome({
    title: "Inventory",
    description: "Every serialized unit on the platform, and what can still change about it.",
  });

  const rows = (query.data?.data ?? []) as SkuUnit[];
  const meta = query.data?.meta;

  const allOnPage = rows.map((r) => r.skuId);
  const allSelected = allOnPage.length > 0 && allOnPage.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: Column<SkuUnit>[] = [
    ...(canEdit
      ? [
          {
            key: "select",
            header: (
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={allSelected}
                onChange={(e) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const id of allOnPage) {
                      if (e.target.checked) next.add(id);
                      else next.delete(id);
                    }
                    return next;
                  })
                }
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
            ),
            width: "36px",
            cell: (r: SkuUnit) => (
              <input
                type="checkbox"
                aria-label={`Select ${r.skuCode}`}
                checked={selected.has(r.skuId)}
                onChange={() => toggle(r.skuId)}
                onClick={(e) => e.stopPropagation()}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
            ),
          } satisfies Column<SkuUnit>,
        ]
      : []),
    {
      key: "unit",
      header: "Unit",
      cell: (r) => (
        <div className="min-w-0">
          <Mono className="text-[11px] text-[var(--text-1)]">{r.skuCode}</Mono>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">#{r.serialNumber}</p>
        </div>
      ),
    },
    {
      key: "claimed",
      header: "Claimed",
      cell: (r) => (
        <Badge tone={toneForStatus(r.claimedStatus)} dot>
          {humanize(r.claimedStatus)}
        </Badge>
      ),
    },
    {
      key: "tag",
      header: "Tag",
      cell: (r) =>
        /* A bound tag with no state, and no tag block at all, are different
           facts — but both read as "nothing to show" in one cell. */
        r.tag?.tagLifecycleState ? (
          <Badge tone={toneForStatus(r.tag.tagLifecycleState)}>
            {humanize(r.tag.tagLifecycleState)}
          </Badge>
        ) : (
          <Tooltip content="No tag block for your grants, or no tag bound. Units awaiting a chip are how a partial rollout is driven.">
            <span className="cursor-help text-[12px] text-[var(--text-3)]">—</span>
          </Tooltip>
        ),
    },
    {
      key: "trust",
      header: "Trust",
      cell: (r) => {
        if (!r.trust) {
          return <span className="text-[12px] text-[var(--text-3)]">—</span>;
        }
        const flags: React.ReactNode[] = [];
        if (r.trust.resaleBlocked) {
          flags.push(
            <Tooltip key="resale" content={r.trust.resaleBlockedReason ?? "Resale blocked"}>
              <span className="inline-flex cursor-help items-center gap-1 rounded-[6px] bg-[var(--danger-dim)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--danger)]">
                <Lock className="h-3 w-3" aria-hidden />
                Resale
              </span>
            </Tooltip>
          );
        }
        if (r.trust.tamperStatus) {
          flags.push(
            <span
              key="tamper"
              className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--warning-dim)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--warning)]"
            >
              <ShieldAlert className="h-3 w-3" aria-hidden />
              {r.trust.tamperStatus}
            </span>
          );
        }
        return flags.length ? (
          <div className="flex flex-wrap gap-1">{flags}</div>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">Clear</span>
        );
      },
    },
    {
      key: "listed",
      header: "Listed",
      cell: (r) =>
        r.archivedAt ? (
          <Badge tone="neutral">Archived</Badge>
        ) : (
          <Badge tone={r.isActive ? "positive" : "neutral"}>
            {r.isActive ? "Active" : "Staged"}
          </Badge>
        ),
    },
    {
      key: "updated",
      header: "Updated",
      cell: (r) => (
        <span className="tnum text-[12px]">
          {formatDate(r.updatedAt ?? r.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <>
      {canEdit && selected.size > 0 ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit {formatNumber(selected.size)} selected
          </Button>
        </PageActions>
      ) : null}

      <Panel>
        <FilterRow
          active={list.active || !!q || includeArchived}
          onReset={() => {
            list.reset();
            setQ("");
            setIncludeArchived(false);
          }}
        >
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              list.setPage(1);
            }}
            placeholder="Serial or code fragment"
            className="w-56"
          />
          <FilterSelect
            label="Claimed"
            value={list.filters.claimedStatus}
            onChange={(v) => list.setFilter("claimedStatus", v)}
            options={["UNCLAIMED", "CLAIMED", "IN_TRANSFER", "FLAGGED"]}
          />
          <FilterSelect
            label="Tag"
            value={list.filters.tagLifecycleState}
            onChange={(v) => list.setFilter("tagLifecycleState", v)}
            options={[
              "UNPROVISIONED",
              "BOUND",
              "ACTIVE",
              "LOST",
              "REVOKED",
              "DISPUTED",
            ]}
          />
          <FilterSelect
            label="Tagged"
            value={list.filters.tagged}
            onChange={(v) => list.setFilter("tagged", v)}
            options={["true", "false"]}
            allLabel="Any"
          />
          {canFilterTrust ? (
            <FilterSelect
              label="Resale"
              value={list.filters.resaleBlocked}
              onChange={(v) => list.setFilter("resaleBlocked", v)}
              options={["true", "false"]}
              allLabel="Any"
            />
          ) : null}
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
            Include archived
          </label>
        </FilterRow>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-2">
            <span className="text-[12px] text-[var(--text-2)]">
              {formatNumber(selected.size)} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
            >
              Clear
            </button>
            <span className="ml-auto text-[11px] text-[var(--text-3)]">
              A batch is one transaction: if one unit refuses, nothing is
              written.
            </span>
          </div>
        ) : null}

        {query.isLoading ? (
          <TableSkeleton cols={7} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No units"
            description="Nothing on the platform matches these filters."
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.skuId}
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

      {editing ? (
        <BatchEditDrawer
          skuIds={[...selected]}
          onClose={() => setEditing(false)}
          onApplied={() => {
            setSelected(new Set());
            setEditing(false);
          }}
        />
      ) : null}
    </>
  );
}
