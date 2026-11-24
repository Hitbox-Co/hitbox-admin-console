"use client";

import * as React from "react";
import { toast } from "sonner";
import { Crown, Lock, Minus, Plus } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAdminDropContent, useAdminDropUnits, useChangeExclusiveUnits } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { formatNumber, humanize } from "@/lib/format";
import { describeSerials, serialLabel } from "@/lib/serials";
import { Badge, Button, Input, Mono, Panel, PanelHeader } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { AdminDropUnit, DropContentClaimedUnit, ProductVariantRef } from "@/lib/types";

/**
 * HitBox choosing WHICH SKUs open an exclusive tier (drop-content.md §4A):
 * "out of these 100, #042 gets the signed video". The artist creates the
 * tier and its files; staff pick units here, one by one.
 *
 * A unit can be put on or taken off a tier only while it is UNCLAIMED with no
 * owner — once a buyer owns it, what it opens is settled. The server checks
 * that on locked rows, so a claim racing the change can't slip through; the
 * checkbox here only mirrors `selectable`. Both writes are all-or-nothing and
 * idempotent, so a refusal saves nothing.
 *
 * Needs content-unlock:manage at GLOBAL scope.
 */
export function ExclusiveUnitsPanel({
  productId,
  totalSupply,
  variants,
}: {
  productId: string;
  totalSupply: number;
  variants: ProductVariantRef[];
}) {
  const content = useAdminDropContent(productId);
  const change = useChangeExclusiveUnits(productId);

  const tiers = React.useMemo(
    () => (content.data?.tiers ?? []).filter((t) => t.tier === "EXCLUSIVE" && !t.removed),
    [content.data]
  );
  const [bundleId, setBundleId] = React.useState<string>("");
  const tier = tiers.find((t) => t.bundleId === bundleId) ?? tiers[0];

  const [variantId, setVariantId] = React.useState("");
  const [serialFrom, setSerialFrom] = React.useState("");
  const [serialTo, setSerialTo] = React.useState("");
  const [onlySelectable, setOnlySelectable] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(50);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [refused, setRefused] = React.useState<{ title: string; lines: string[] } | null>(null);

  const units = useAdminDropUnits(
    productId,
    {
      claimed: onlySelectable ? false : undefined,
      variantId: variantId || undefined,
      serialFrom: serialFrom ? Number(serialFrom) : undefined,
      serialTo: serialTo ? Number(serialTo) : undefined,
      page,
      limit,
    },
    tiers.length > 0
  );

  const rows = units.data?.data ?? [];
  const selectableOnPage = rows.filter((r) => r.selectable);
  const allOnPage = selectableOnPage.length > 0 && selectableOnPage.every((r) => selected.has(r.skuId));

  const resetPage = () => {
    setPage(1);
    setSelected(new Set());
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (action: "add" | "remove") => {
    if (!tier || selected.size === 0 || change.isPending) return;
    setRefused(null);
    change.mutate(
      { bundleId: tier.bundleId, skuIds: [...selected], action },
      {
        onSuccess: (r) => {
          toast.success(
            r.changed === 0
              ? `Nothing changed — ${action === "add" ? "already on" : "not on"} “${r.name}”`
              : `${formatNumber(r.changed)} unit${r.changed === 1 ? "" : "s"} updated on “${r.name}”`
          );
          setSelected(new Set());
        },
        onError: (err) => {
          if (!(err instanceof ApiError)) {
            toast.error("Could not change the tier.");
            return;
          }
          if (err.code === "DROP_CONTENT_UNIT_CLAIMED") {
            const blocked = ((err.details as { units?: DropContentClaimedUnit[] })?.units ?? []).sort(
              (a, b) => a.serialNumber - b.serialNumber
            );
            setRefused({
              title: "Some units are already claimed or owned — nothing was saved",
              lines: blocked.map(
                (u) =>
                  `${serialLabel(u.serialNumber, totalSupply)}: ${humanize(u.claimedStatus).toLowerCase()}${
                    u.owned ? ", owned" : ""
                  }`
              ),
            });
            // The table has been refreshed; drop the ones that can no longer change.
            setSelected((s) => {
              const next = new Set(s);
              for (const u of blocked) next.delete(u.skuId);
              return next;
            });
          } else if (err.code === "DROP_CONTENT_UNIT_NOT_IN_DROP") {
            const ids = (err.details as { skuIds?: string[] })?.skuIds ?? [];
            setRefused({ title: "Not units of this drop — nothing was saved", lines: ids });
          } else {
            setRefused({ title: err.friendly, lines: [] });
          }
          toast.error(err.friendly);
        },
      }
    );
  };

  const header = (
    <PanelHeader
      title="Exclusive units"
      description="Pick the SKUs that open an exclusive tier. Only unclaimed units with no owner can change."
    />
  );

  if (content.isLoading) {
    return (
      <Panel>
        {header}
        <TableSkeleton rows={3} cols={4} />
      </Panel>
    );
  }
  if (content.isError) {
    return (
      <Panel>
        {header}
        <ErrorState error={content.error} onRetry={() => content.refetch()} />
      </Panel>
    );
  }
  if (!tier) {
    return (
      <Panel>
        {header}
        <EmptyState
          icon={Crown}
          title="No exclusive tiers on this drop"
          description="The artist creates exclusive tiers and their files; once one exists, its units can be chosen here."
        />
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      {header}

      <div className="space-y-3 border-b border-[var(--hairline)] px-4 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
            Tier
            <select
              value={tier.bundleId}
              onChange={(e) => {
                setBundleId(e.target.value);
                setSelected(new Set());
                setRefused(null);
              }}
              className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)]"
            >
              {tiers.map((t) => (
                <option key={t.bundleId} value={t.bundleId}>
                  {t.name}
                  {t.isActive ? "" : " (off)"}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[11.5px] text-[var(--text-2)]">
            Opens for {describeSerials(tier.serialNumbers, totalSupply, 8)} ·{" "}
            {formatNumber(tier.serialNumbers.length)} unit{tier.serialNumbers.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {variants.length > 0 ? (
            <select
              aria-label="Variant"
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                resetPage();
              }}
              className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)]"
            >
              <option value="">All variants</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          ) : null}
          <span className="flex items-center gap-1 text-[12px] text-[var(--text-3)]">
            Serial
            <Input
              aria-label="Serial from"
              inputMode="numeric"
              value={serialFrom}
              onChange={(e) => {
                setSerialFrom(e.target.value.replace(/\D/g, ""));
                resetPage();
              }}
              placeholder="1"
              className="h-7 w-16 text-[12px]"
            />
            –
            <Input
              aria-label="Serial to"
              inputMode="numeric"
              value={serialTo}
              onChange={(e) => {
                setSerialTo(e.target.value.replace(/\D/g, ""));
                resetPage();
              }}
              placeholder={String(totalSupply)}
              className="h-7 w-16 text-[12px]"
            />
          </span>
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
            <input
              type="checkbox"
              checked={onlySelectable}
              onChange={(e) => {
                setOnlySelectable(e.target.checked);
                resetPage();
              }}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Only selectable
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--text-2)]">
            {formatNumber(selected.size)} selected
          </span>
          <Button
            variant="primary"
            size="sm"
            loading={change.isPending}
            disabled={selected.size === 0 || change.isPending}
            onClick={() => run("add")}
          >
            <Plus className="h-3.5 w-3.5" /> Add to “{tier.name}”
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={change.isPending}
            disabled={selected.size === 0 || change.isPending}
            onClick={() => run("remove")}
          >
            <Minus className="h-3.5 w-3.5" /> Remove
          </Button>
          {selected.size > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          ) : null}
        </div>

        {refused ? (
          <div
            role="alert"
            className="rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2 text-[12px] text-[var(--danger)]"
          >
            <p className="font-medium">{refused.title}</p>
            {refused.lines.length ? (
              <ul className="mt-1 space-y-0.5 text-[11.5px] text-[var(--text-2)]">
                {refused.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {units.isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : units.isError ? (
        <ErrorState error={units.error} onRetry={() => units.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Crown}
          title="No units match"
          description="Only minted units are listed. Unminted serials can be set by the artist on the tier itself."
        />
      ) : (
        <>
          <div className={cn("overflow-x-auto", units.isFetching && "opacity-70")}>
            <table className="w-full min-w-[560px] text-[12px]">
              <thead>
                <tr className="border-b border-[var(--hairline)] text-left text-[10.5px] uppercase tracking-wide text-[var(--text-3)]">
                  <th className="w-9 px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select every selectable unit on this page"
                      checked={allOnPage}
                      disabled={selectableOnPage.length === 0}
                      onChange={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          for (const r of selectableOnPage) {
                            if (allOnPage) next.delete(r.skuId);
                            else next.add(r.skuId);
                          }
                          return next;
                        })
                      }
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                  </th>
                  <th className="py-2 pr-3 font-medium">Unit</th>
                  <th className="py-2 pr-3 font-medium">Variant</th>
                  <th className="py-2 pr-3 font-medium">Claim</th>
                  <th className="py-2 pr-4 font-medium">Exclusive tiers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {rows.map((r) => (
                  <UnitRow
                    key={r.skuId}
                    unit={r}
                    totalSupply={totalSupply}
                    checked={selected.has(r.skuId)}
                    onToggle={() => toggle(r.skuId)}
                    activeTierId={tier.bundleId}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {units.data?.meta ? (
            <Pagination
              page={units.data.meta.page}
              limit={units.data.meta.limit}
              total={units.data.meta.total}
              onPageChange={(p) => setPage(p)}
              onLimitChange={(n) => {
                // The API caps the page at 100.
                setLimit(Math.min(n, 100));
                setPage(1);
              }}
            />
          ) : null}
        </>
      )}
    </Panel>
  );
}

function UnitRow({
  unit: u,
  totalSupply,
  checked,
  onToggle,
  activeTierId,
}: {
  unit: AdminDropUnit;
  totalSupply: number;
  checked: boolean;
  onToggle: () => void;
  activeTierId: string;
}) {
  // Why it can't change: claimed (tapped), or owned (sold, not tapped yet).
  const reason = u.selectable ? null : u.claimedStatus !== "UNCLAIMED" ? "Claimed" : "Owned";
  return (
    <tr className={cn(!u.selectable && "text-[var(--text-3)]", checked && "bg-[var(--accent-dim)]")}>
      <td className="px-4 py-1.5">
        {u.selectable ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            aria-label={`Select ${serialLabel(u.serialNumber, totalSupply)}`}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
        ) : (
          <span title={`${reason} — its exclusive content is settled`}>
            <Lock className="h-3.5 w-3.5 text-[var(--text-3)]" aria-label={`${reason}, locked`} />
          </span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        <span className={cn("tnum font-medium", u.selectable && "text-[var(--text-1)]")}>
          {serialLabel(u.serialNumber, totalSupply)}
        </span>{" "}
        <Mono className="text-[10px]">{u.skuCode}</Mono>
      </td>
      <td className="py-1.5 pr-3">{u.variant ? u.variant.label : "—"}</td>
      <td className="py-1.5 pr-3">
        {reason ? (
          <Badge tone="neutral">{reason}</Badge>
        ) : (
          <span className="text-[var(--text-2)]">Unclaimed</span>
        )}
      </td>
      <td className="py-1.5 pr-4">
        <div className="flex flex-wrap gap-1">
          {u.exclusiveTiers.map((t) => (
            <Badge key={t.bundleId} tone={t.bundleId === activeTierId ? "warning" : "neutral"}>
              <Crown className="h-2.5 w-2.5" /> {t.name}
            </Badge>
          ))}
        </div>
      </td>
    </tr>
  );
}
