"use client";

import * as React from "react";
import { Boxes, Plus, ScanLine } from "lucide-react";
import { useProductSkuSummary, useProductSkus } from "@/lib/api/hooks";
import { formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Mono, Panel, Tooltip, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterSelect, SearchInput } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { BindTagsDialog } from "./bind-tags-dialog";
import { MintUnitsDialog } from "./mint-units-dialog";
import type { MintGate } from "@/lib/mint-gate";
import type { ProductVariantRef, SkuListParams, SkuUnit } from "@/lib/types";

/**
 * A drop's serialized edition.
 *
 * The one rule that shapes this whole component: **a block the caller may not
 * see is absent from the JSON, not null and not {}** (sku-api.md §6). So the
 * columns are built from what the rows actually carry — `"tag" in unit` — and
 * never from a role name. A console that infers columns from a role is wrong
 * the moment an operator defines a new one.
 *
 * Concretely, against the seeded catalog: a Brand Admin sees every unit of
 * their own drop and no tag column at all, because brands own the edition and
 * HitBox owns the anti-counterfeiting material. Support sees tag UIDs and
 * masked owner emails. Neither case is special-cased here.
 */

const CLAIMED_STATUSES = ["UNCLAIMED", "CLAIMED", "IN_TRANSFER", "FLAGGED"];
const TAG_STATES = [
  "UNPROVISIONED",
  "BOUND",
  "ACTIVE",
  "LOST",
  "REVOKED",
  "DISPUTED",
];

export function SkuUnitsPanel({
  productId,
  totalSupply,
  variants,
  mintGate,
}: {
  productId: string;
  totalSupply: number;
  /**
   * Whether the owner has cleared minting (drop-approval-lifecycle.md §10).
   * Blocked disables Add SKUs with the reason; unknown leaves it to the
   * server's SKUS_NOT_APPROVED.
   */
  mintGate?: MintGate;
  /** Read-only on this API — offered as a mint target, never authored here. */
  variants: ProductVariantRef[];
}) {
  const perms = usePermissions();
  const [params, setParams] = React.useState<SkuListParams>({
    page: 1,
    limit: 50,
    sort: "serial_asc",
  });
  const [minting, setMinting] = React.useState(false);
  const [binding, setBinding] = React.useState(false);

  const list = useProductSkus(productId, params);
  const summary = useProductSkuSummary(productId);

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  // Block presence is a property of the RESPONSE, not of the viewer. An empty
  // page tells us nothing, so those columns simply do not render.
  const hasTag = rows.some((u) => "tag" in u);
  const hasOwner = rows.some((u) => "owner" in u);
  const hasTrust = rows.some((u) => "trust" in u);

  const set = (patch: Partial<SkuListParams>) =>
    setParams((p) => ({ ...p, ...patch, page: patch.page ?? 1 }));

  const columns = React.useMemo<Column<SkuUnit>[]>(() => {
    const cols: Column<SkuUnit>[] = [
      {
        key: "unit",
        header: "Unit",
        cell: (u) => (
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-[var(--text-1)]">
              #{u.serialNumber}
              {!u.isActive ? (
                <span className="ml-1.5 text-[10px] text-[var(--text-3)]">staged</span>
              ) : null}
            </p>
            <Mono className="mt-0.5 text-[10px]">{u.skuCode}</Mono>
          </div>
        ),
      },
      {
        key: "claimed",
        header: "Claimed",
        cell: (u) => (
          <Badge tone={toneForStatus(u.claimedStatus)} dot>
            {humanize(u.claimedStatus)}
          </Badge>
        ),
      },
    ];

    if (hasTag) {
      cols.push({
        key: "tag",
        header: "NFC tag",
        cell: (u) =>
          u.tag?.tagId ? (
            <div className="min-w-0">
              <Mono className="text-[10px]">{u.tag.tagId}</Mono>
              {u.tag.tagLifecycleState ? (
                <div className="mt-0.5">
                  <Badge
                    tone={toneForStatus(u.tag.tagLifecycleState)}
                    className="px-1 py-0 text-[10px]"
                  >
                    {humanize(u.tag.tagLifecycleState)}
                  </Badge>
                </div>
              ) : null}
            </div>
          ) : (
            <span className="text-[12px] text-[var(--text-3)]">Untagged</span>
          ),
      });
    }

    if (hasOwner) {
      cols.push({
        key: "owner",
        header: "Owner",
        cell: (u) =>
          u.owner?.email ? (
            <div className="min-w-0">
              <p className="truncate text-[12px] text-[var(--text-1)]">{u.owner.email}</p>
              {u.owner.handle ? (
                <p className="truncate text-[10.5px] text-[var(--text-3)]">
                  @{u.owner.handle}
                </p>
              ) : null}
            </div>
          ) : (
            // Key present with null values is a genuinely unowned unit —
            // different from the block being absent, which renders no column.
            <span className="text-[12px] text-[var(--text-3)]">Unowned</span>
          ),
      });
    }

    if (hasTrust) {
      cols.push({
        key: "trust",
        header: "Trust",
        cell: (u) => (
          <div className="flex flex-wrap gap-1">
            {u.trust?.resaleBlocked ? (
              <Tooltip content={u.trust.resaleBlockedReason ?? "Resale is blocked."}>
                <span>
                  <Badge tone="danger" className="px-1 py-0 text-[10px]">
                    Resale blocked
                  </Badge>
                </span>
              </Tooltip>
            ) : null}
            {u.trust?.tamperStatus ? (
              <Badge tone="warning" className="px-1 py-0 text-[10px]">
                {humanize(u.trust.tamperStatus)}
              </Badge>
            ) : null}
            {!u.trust?.resaleBlocked && !u.trust?.tamperStatus ? (
              <span className="text-[12px] text-[var(--text-3)]">—</span>
            ) : null}
          </div>
        ),
      });
    }

    return cols;
  }, [hasTag, hasOwner, hasTrust]);

  const s = summary.data;

  return (
    <>
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
            Serialized units
          </p>
          <div className="flex items-center gap-2">
            {/*
              Binding is a different capability from minting — a Drop Manager
              mints the edition, whoever holds tag custody binds the tags — so
              the two actions are gated separately rather than as one "manage
              units" button.
            */}
            {perms.canBindTags() ? (
              <Button variant="ghost" size="sm" onClick={() => setBinding(true)}>
                <ScanLine className="h-3.5 w-3.5" />
                Bind tags
              </Button>
            ) : null}
            {perms.canMintUnits() ? (
              mintGate?.state === "blocked" ? (
                <Tooltip content={mintGate.reason ?? "Waiting on the owner's approval."}>
                  <span>
                    <Button variant="secondary" size="sm" disabled>
                      <Plus className="h-3.5 w-3.5" />
                      Add SKUs
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setMinting(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Add SKUs
                </Button>
              )
            ) : null}
          </div>
        </div>

        {/* Summary is one grouped query — cheaper and more correct than
            counting a paged list client-side. */}
        {s ? (
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--hairline)] px-3 py-2.5">
            <Badge tone="neutral">Minted {formatNumber(s.total)}</Badge>
            {Object.entries(s.byClaimedStatus).map(([k, n]) => (
              <Badge key={k} tone={toneForStatus(k)}>
                {humanize(k)} {formatNumber(n)}
              </Badge>
            ))}
            {/* tagged/untagged are omitted for a caller without nfc-tag-claim. */}
            {s.tagged !== undefined ? (
              <Badge tone="info">Tagged {formatNumber(s.tagged)}</Badge>
            ) : null}
            {s.untagged !== undefined ? (
              <Badge tone="neutral">Untagged {formatNumber(s.untagged)}</Badge>
            ) : null}
            <Tooltip
              content={
                s.remainingSupply === null
                  ? "This edition declares no size, so there is no cap to be short of."
                  : `Declared supply ${formatNumber(totalSupply)}.`
              }
            >
              <span>
                <Badge tone={s.remainingSupply ? "warning" : "positive"}>
                  {s.remainingSupply === null
                    ? "No cap declared"
                    : s.remainingSupply === 0
                      ? "Edition complete"
                      : `${formatNumber(s.remainingSupply)} left to mint`}
                </Badge>
              </span>
            </Tooltip>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--hairline)] px-3 py-2.5">
          <SearchInput
            value={params.search ?? ""}
            onChange={(v) => set({ search: v || undefined })}
            placeholder="Serial, code or tag"
            className="w-[190px]"
          />
          <FilterSelect
            label="Claimed"
            value={params.claimedStatus}
            onChange={(v) => set({ claimedStatus: v })}
            options={CLAIMED_STATUSES}
            allLabel="Any"
          />
          {/* Only offer a tag filter to someone who can see tags at all. */}
          {hasTag ? (
            <FilterSelect
              label="Tag"
              value={params.tagLifecycleState}
              onChange={(v) => set({ tagLifecycleState: v })}
              options={TAG_STATES}
              allLabel="Any"
            />
          ) : null}
          <FilterSelect
            label="Sort"
            value={params.sort}
            onChange={(v) => set({ sort: (v as SkuListParams["sort"]) ?? "serial_asc" })}
            options={["serial_asc", "serial_desc", "newest"]}
            allLabel="Serial ascending"
          />
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={!!params.includeArchived}
              onChange={(e) => set({ includeArchived: e.target.checked || undefined })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Include archived
          </label>
        </div>

        {list.isLoading ? (
          <TableSkeleton rows={8} cols={4} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(u) => u.skuId}
              dimmed={list.isFetching}
              emptyState={
                <EmptyState
                  icon={Boxes}
                  title="No units match"
                  description={
                    params.search || params.claimedStatus
                      ? "Try clearing the filters."
                      : "This drop has no serialized units yet."
                  }
                  action={
                    perms.canMintUnits() && !params.search ? (
                      <Button variant="primary" size="sm" onClick={() => setMinting(true)}>
                        Add the first SKUs
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
            {meta ? (
              <Pagination
                page={meta.page}
                limit={meta.limit}
                total={meta.total}
                onPageChange={(page) => setParams((p) => ({ ...p, page }))}
                onLimitChange={(limit) => setParams((p) => ({ ...p, limit, page: 1 }))}
              />
            ) : null}
          </>
        )}
      </Panel>

      {binding ? (
        <BindTagsDialog
          productId={productId}
          untagged={s?.untagged}
          onClose={() => setBinding(false)}
        />
      ) : null}

      {minting ? (
        <MintUnitsDialog
          productId={productId}
          remaining={s?.remainingSupply ?? null}
          variants={variants}
          onClose={() => setMinting(false)}
        />
      ) : null}
    </>
  );
}
