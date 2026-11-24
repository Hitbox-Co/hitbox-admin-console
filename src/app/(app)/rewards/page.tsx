"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Gift, Lock, Power, PowerOff, Trash2, Trophy, Unlock, Users, X } from "lucide-react";
import { useAdminArtists, useAdminRewardSummary, useAdminRewards } from "@/lib/api/hooks";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Panel, PanelHeader, Skeleton, Tooltip } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterPicker, FilterRow, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { StatusBadge, rewardContentsSummary } from "@/components/artist/collection-reward-tab";
import type { AdminReward, AdminRewardFilters } from "@/lib/types";

/**
 * Rewards — every artist's collection reward, for monitoring and moderation
 * (content/admin-rewards-api.md). content-unlock:manage platform-wide only.
 */
export default function RewardsPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/rewards")}
      what="Collection rewards"
      requires="content-unlock:manage (platform-wide)"
    >
      <React.Suspense fallback={<TableSkeleton rows={10} cols={7} />}>
        <RewardsView />
      </React.Suspense>
    </PageGuard>
  );
}

type Filters = { status?: string; artistId?: string; collectionId?: string; q?: string };

function RewardsView() {
  usePageChrome({
    title: "Rewards",
    description: "Exclusive content artists attach to their collections — what's live, who unlocked it, and what HitBox has locked.",
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const perms = usePermissions();

  const list = useListState<Filters>({
    status: searchParams.get("status") ?? undefined,
    artistId: searchParams.get("artistId") ?? undefined,
    collectionId: searchParams.get("collectionId") ?? undefined,
    q: undefined,
  });
  const [search, setSearch] = React.useState("");
  const { setFilter } = list;
  React.useEffect(() => {
    const t = setTimeout(() => setFilter("q", search.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [search, setFilter]);

  const query = useAdminRewards(list.params as AdminRewardFilters);
  const summary = useAdminRewardSummary();
  // The artist directory takes drop:read — offered only when it's readable.
  const artists = useAdminArtists(undefined, perms.canRead("drop"));
  const s = summary.data;
  const f = list.filters;

  const setStatus = (status?: string) => list.setFilter("status", f.status === status ? undefined : status);

  const tiles: { label: string; value?: number; hint: string; icon: typeof Gift; status?: string; tone?: "danger" }[] = [
    { label: "Rewards", value: s?.rewards.total, hint: `${formatNumber(s?.rewards.on)} on`, icon: Gift },
    { label: "On", value: s?.rewards.on, hint: "Fans can open them", icon: Power, status: "ON" },
    { label: "Off", value: s?.rewards.off, hint: "Paused", icon: PowerOff, status: "OFF" },
    { label: "Removed", value: s?.rewards.removed, hint: "Taken down", icon: Trash2, status: "REMOVED" },
    { label: "Locked by HitBox", value: s?.rewards.lockedByHitbox, hint: "Moderated", icon: Lock, status: "LOCKED", tone: "danger" },
    { label: "Live unlocks", value: s?.unlocks.live, hint: `${formatNumber(s?.unlocks.buyersWithRewards)} fans hold one`, icon: Unlock },
    { label: "Unlocked this month", value: s?.unlocks.thisMonth, hint: "Since the 1st", icon: CalendarPlus },
  ];

  const columns: Column<AdminReward>[] = [
    {
      key: "name",
      header: "Reward",
      cell: (r) => (
        <div className="flex min-w-[200px] items-center gap-2">
          {r.moderation.locked ? (
            <Tooltip content={`Locked by HitBox: ${r.moderation.reason ?? "no reason"}`}>
              <span>
                <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--danger)]" aria-label="Locked by HitBox" />
              </span>
            </Tooltip>
          ) : null}
          <span className="truncate font-medium text-[var(--text-1)]">{r.name}</span>
        </div>
      ),
    },
    {
      key: "artist",
      header: "Artist",
      cell: (r) => <span className="text-[12.5px] text-[var(--text-2)]">{r.collection.artist.name}</span>,
    },
    {
      key: "collection",
      header: "Collection",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--text-2)]">
          {r.collection.name}
          {r.collection.deleted ? <Badge tone="danger">Collection deleted</Badge> : null}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "files",
      header: "Files",
      cell: (r) => (
        <span className="text-[12px] text-[var(--text-3)]">{rewardContentsSummary(r.itemCounts) || "No files"}</span>
      ),
    },
    {
      key: "unlocked",
      header: "Unlocked",
      numeric: true,
      cell: (r) => <span className="tnum">{formatNumber(r.unlockedCount)}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      cell: (r) => <span className="tnum text-[12px] text-[var(--text-3)]">{formatDate(r.updatedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => {
          const on = t.status ? f.status === t.status : false;
          const Comp = t.status ? "button" : "div";
          return (
            <Comp
              key={t.label}
              {...(t.status ? { type: "button" as const, "aria-pressed": on, onClick: () => setStatus(t.status) } : {})}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition-colors",
                t.status && "pressable",
                on ? "border-[var(--accent)] bg-[var(--accent-dim)]" : "border-[var(--hairline)] bg-[var(--surface-1)]",
                t.status && !on && "hover:border-[var(--hairline-strong)]"
              )}
            >
              <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                {t.label}
              </p>
              {summary.isLoading || t.value === undefined ? (
                <Skeleton className="mt-1.5 h-7 w-12" />
              ) : (
                <p
                  className={cn(
                    "tnum mt-1 text-[26px] font-semibold leading-none",
                    t.tone === "danger" && t.value > 0 ? "text-[var(--danger)]" : "text-[var(--text-1)]"
                  )}
                >
                  {formatNumber(t.value)}
                </p>
              )}
              <p className="mt-1.5 truncate text-[11px] text-[var(--text-3)]">{t.hint}</p>
            </Comp>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Panel className="min-w-0 overflow-hidden">
          <FilterRow
            active={list.active || Boolean(search)}
            onReset={() => {
              setSearch("");
              list.reset();
              list.setFilter("artistId", undefined);
              list.setFilter("collectionId", undefined);
              list.setFilter("status", undefined);
            }}
          >
            <SearchInput value={search} onChange={setSearch} placeholder="Reward, collection or artist" className="w-[230px]" />
            <FilterPicker
              label="Status"
              value={f.status}
              onChange={(v) => list.setFilter("status", v)}
              options={[
                { value: "ON", label: "On" },
                { value: "OFF", label: "Off" },
                { value: "REMOVED", label: "Removed" },
                { value: "LOCKED", label: "Locked by HitBox" },
              ]}
            />
            {artists.data ? (
              <FilterPicker
                label="Artist"
                value={f.artistId}
                onChange={(v) => list.setFilter("artistId", v)}
                options={artists.data.map((a) => ({ value: a.id, label: a.name }))}
              />
            ) : null}
          </FilterRow>

          {f.collectionId ? (
            <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-2 text-[12px] text-[var(--text-2)]">
              Showing one collection&rsquo;s reward
              <button
                type="button"
                onClick={() => list.setFilter("collectionId", undefined)}
                className="inline-flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text-1)]"
              >
                <X className="h-3 w-3" /> Show all
              </button>
            </div>
          ) : null}

          {query.isLoading ? (
            <TableSkeleton rows={10} cols={7} />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={query.data?.items ?? []}
                getRowKey={(r) => r.id}
                dimmed={query.isFetching}
                onRowClick={(r) => router.push(`/rewards/${r.id}`)}
                rowClassName={(r) =>
                  r.moderation.locked ? "bg-[var(--danger-dim)]" : r.status === "REMOVED" ? "opacity-60" : undefined
                }
                emptyState={
                  <EmptyState
                    icon={Gift}
                    title="No rewards match"
                    description={list.active ? "Try clearing a filter." : "Rewards appear once artists add them to a collection."}
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

        <Panel className="h-fit overflow-hidden">
          <PanelHeader title="Most unlocked" description="Live unlocks right now" />
          {summary.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-[8px]" />
              ))}
            </div>
          ) : !s?.topRewards.length ? (
            <p className="px-4 py-3 text-[12px] text-[var(--text-3)]">Nobody has unlocked a reward yet.</p>
          ) : (
            <ol className="divide-y divide-[var(--hairline)]">
              {s.topRewards.map((t, i) => (
                <li key={t.id}>
                  <Link href={`/rewards/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]">
                    <span className={cn("tnum w-4 text-center text-[12px] font-semibold", i === 0 ? "text-[#f5b942]" : "text-[var(--text-3)]")}>
                      {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-[var(--text-1)]">{t.name}</span>
                      <span className="block truncate text-[11px] text-[var(--text-3)]">
                        {t.artist.name} · {t.collection.name}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[12px] text-[var(--text-2)]">
                      <Users className="h-3 w-3" />
                      <span className="tnum">{formatNumber(t.unlockedCount)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
