"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  CalendarPlus,
  Eye,
  EyeOff,
  FolderOpen,
  Inbox,
  LibraryBig,
  X,
} from "lucide-react";
import {
  useAdminCollectionSummary,
  useAdminCollections,
  useAdminOrganizations,
} from "@/lib/api/hooks";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Input, Mono, Panel, PanelHeader, Skeleton, Tooltip } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterPicker, FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ArtistFlags, HeroThumb, StatusChips } from "@/components/artist/collection-bits";
import type { AdminArtistCollection, AdminArtistCollectionFilters } from "@/lib/types";

/**
 * Artist collections — read-only oversight of every artist's collections
 * (admin-monitoring-api.md). Platform-wide only: brand-artist-record:read at
 * GLOBAL scope. Nothing here writes; the change history is the audit log,
 * shown on each collection's page.
 */
export default function ArtistCollectionsPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/artist-collections")}
      what="Artist collections"
      requires="brand-artist-record:read (platform-wide)"
    >
      <React.Suspense fallback={<TableSkeleton rows={10} cols={7} />}>
        <CollectionsView />
      </React.Suspense>
    </PageGuard>
  );
}

type Filters = {
  status?: string;
  artistId?: string;
  organizationId?: string;
  isPublic?: string;
  empty?: string;
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: string;
};

const EMPTY_FILTERS: Filters = {
  status: undefined,
  artistId: undefined,
  organizationId: undefined,
  isPublic: undefined,
  empty: undefined,
  q: undefined,
  createdFrom: undefined,
  createdTo: undefined,
  sort: undefined,
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function CollectionsView() {
  usePageChrome({
    title: "Artist collections",
    description: "Every artist's collections — what's public, what's empty, what was deleted.",
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const perms = usePermissions();

  const list = useListState<Filters>({
    ...EMPTY_FILTERS,
    artistId: searchParams.get("artistId") ?? undefined,
    organizationId: searchParams.get("organizationId") ?? undefined,
  });
  // The artist's name for the filter chip — remembered from the row clicked.
  const [artistName, setArtistName] = React.useState<string | null>(null);

  // Search is sent after a short pause, not on every keystroke.
  const [search, setSearch] = React.useState("");
  const { setFilter } = list;
  React.useEffect(() => {
    const t = setTimeout(() => setFilter("q", search.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [search, setFilter]);

  const query = useAdminCollections(list.params as AdminArtistCollectionFilters);
  const summary = useAdminCollectionSummary();
  // The organization directory takes drop:read — offered only when it loads.
  const orgs = useAdminOrganizations(perms.canRead("drop"));

  /** A tile sets exactly its own filters and clears the rest. */
  const applyTile = (patch: Filters) => {
    setSearch("");
    (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).forEach((k) => {
      if (k === "sort") return;
      list.setFilter(k, patch[k]);
    });
  };
  const f = list.filters;
  const tileActive = (patch: Filters) =>
    (Object.keys(EMPTY_FILTERS) as (keyof Filters)[])
      .filter((k) => k !== "sort" && k !== "q")
      .every((k) => (patch[k] ?? undefined) === (f[k] ?? undefined));

  const monthAgo = daysAgo(30);
  const s = summary.data;
  const tiles: { label: string; value?: number; hint: string; icon: typeof Eye; patch: Filters; tone?: string }[] = [
    { label: "Live", value: s?.live, hint: `${formatNumber(s?.artistsWithCollections)} artists`, icon: LibraryBig, patch: { status: "live" } },
    { label: "Public", value: s?.public, hint: "On the storefront", icon: Eye, patch: { status: "live", isPublic: "true" } },
    { label: "Drafts", value: s?.private, hint: "Live but not public", icon: EyeOff, patch: { status: "live", isPublic: "false" } },
    { label: "Empty", value: s?.empty, hint: "No live drops", icon: Inbox, patch: { status: "live", empty: "true" }, tone: "warning" },
    { label: "Archived", value: s?.archived, hint: "Deleted by the artist", icon: Archive, patch: { status: "archived" } },
    { label: "New this month", value: s?.createdLast30Days, hint: "Created in 30 days", icon: CalendarPlus, patch: { createdFrom: monthAgo } },
  ];

  const filterByArtist = (row: AdminArtistCollection) => {
    setArtistName(row.artist.name);
    list.setFilter("artistId", row.artist.id);
  };

  const columns: Column<AdminArtistCollection>[] = [
    {
      key: "name",
      header: "Collection",
      cell: (r) => (
        <div className="flex min-w-[200px] items-center gap-2.5">
          <HeroThumb url={r.heroImageUrl} name={r.name} />
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--text-1)]">{r.name}</p>
            <Mono className="text-[10.5px]">{r.slug}</Mono>
          </div>
        </div>
      ),
    },
    {
      key: "artist",
      header: "Artist",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              filterByArtist(r);
            }}
            className="text-left text-[12.5px] text-[var(--text-1)] underline-offset-2 hover:underline"
            title={`Only ${r.artist.name}'s collections`}
          >
            {r.artist.name}
          </button>
          <ArtistFlags artist={r.artist} />
        </div>
      ),
    },
    {
      key: "org",
      header: "Organization",
      cell: (r) => <span className="text-[12.5px] text-[var(--text-2)]">{r.organization?.name ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusChips row={r} />,
    },
    {
      key: "drops",
      header: "Live drops",
      numeric: true,
      cell: (r) =>
        r.status === "LIVE" && r.counts.liveDrops === 0 ? (
          <Tooltip content="No live drops — abandoned or not started yet.">
            <span>
              <Badge tone="warning">Empty</Badge>
            </span>
          </Tooltip>
        ) : (
          <Tooltip content={`${r.counts.activeDrops} shown to the artist · ${r.counts.drops} ever filed`}>
            <span className="tnum">{formatNumber(r.counts.liveDrops)}</span>
          </Tooltip>
        ),
    },
    {
      key: "created",
      header: "Created",
      cell: (r) => <span className="tnum text-[12px] text-[var(--text-3)]">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      cell: (r) => <span className="tnum text-[12px] text-[var(--text-3)]">{formatDate(r.updatedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Headline tiles — each one a pre-filtered view of the list below */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => {
          const active = tileActive(t.patch);
          return (
            <button
              key={t.label}
              type="button"
              aria-pressed={active}
              onClick={() => applyTile(active ? {} : t.patch)}
              className={cn(
                "pressable rounded-xl border px-3.5 py-3 text-left transition-colors",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                  : "border-[var(--hairline)] bg-[var(--surface-1)] hover:border-[var(--hairline-strong)]"
              )}
            >
              <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
                <t.icon className="h-3.5 w-3.5" aria-hidden />
                {t.label}
              </p>
              {summary.isLoading ? (
                <Skeleton className="mt-1.5 h-7 w-12" />
              ) : (
                <p
                  className={cn(
                    "tnum mt-1 text-[26px] font-semibold leading-none",
                    t.tone === "warning" && (t.value ?? 0) > 0 ? "text-[var(--warning)]" : "text-[var(--text-1)]"
                  )}
                >
                  {t.value === undefined ? "—" : formatNumber(t.value)}
                </p>
              )}
              <p className="mt-1.5 truncate text-[11px] text-[var(--text-3)]">{t.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_260px]">
        <Panel className="min-w-0 overflow-hidden">
          <FilterRow
            active={list.active || Boolean(search)}
            onReset={() => {
              setSearch("");
              setArtistName(null);
              list.reset();
              list.setFilter("artistId", undefined);
              list.setFilter("organizationId", undefined);
            }}
          >
            <SearchInput value={search} onChange={setSearch} placeholder="Name or slug" className="w-[200px]" />
            <FilterSelect
              label="Status"
              value={f.status}
              onChange={(v) => list.setFilter("status", v)}
              options={["live", "archived"]}
              allLabel="All"
            />
            <FilterPicker
              label="Visibility"
              value={f.isPublic}
              onChange={(v) => list.setFilter("isPublic", v)}
              options={[
                { value: "true", label: "Public" },
                { value: "false", label: "Draft" },
              ]}
            />
            <FilterPicker
              label="Drops"
              value={f.empty}
              onChange={(v) => list.setFilter("empty", v)}
              options={[
                { value: "true", label: "Empty" },
                { value: "false", label: "Has drops" },
              ]}
            />
            {orgs.data ? (
              <FilterPicker
                label="Organization"
                value={f.organizationId}
                onChange={(v) => list.setFilter("organizationId", v)}
                options={orgs.data.map((o) => ({ value: o.id, label: o.name }))}
              />
            ) : null}
            <label className="flex items-center gap-1.5">
              <span className="text-[12px] text-[var(--text-3)]">Created</span>
              <Input
                type="date"
                value={f.createdFrom ?? ""}
                onChange={(e) => list.setFilter("createdFrom", e.target.value || undefined)}
                className="h-7 w-[132px] text-[12px]"
                aria-label="Created from"
              />
              <span className="text-[12px] text-[var(--text-3)]">to</span>
              <Input
                type="date"
                value={f.createdTo ?? ""}
                onChange={(e) => list.setFilter("createdTo", e.target.value || undefined)}
                className="h-7 w-[132px] text-[12px]"
                aria-label="Created before"
              />
            </label>
            <FilterPicker
              label="Sort"
              value={f.sort}
              onChange={(v) => list.setFilter("sort", v)}
              allLabel="Newest"
              options={[
                { value: "oldest", label: "Oldest" },
                { value: "updated", label: "Recently updated" },
                { value: "name", label: "Name" },
              ]}
            />
          </FilterRow>

          {f.artistId ? (
            <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-2 text-[12px] text-[var(--text-2)]">
              Showing collections by
              <Badge tone="accent">
                {artistName ?? query.data?.items[0]?.artist.name ?? "one artist"}
                <button
                  type="button"
                  aria-label="Show every artist"
                  onClick={() => {
                    setArtistName(null);
                    list.setFilter("artistId", undefined);
                  }}
                  className="-mr-0.5 rounded-[3px] hover:text-[var(--text-1)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
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
                onRowClick={(r) => router.push(`/artist-collections/${r.id}`)}
                rowClassName={(r) => (r.status === "ARCHIVED" ? "opacity-70" : undefined)}
                emptyState={
                  <EmptyState
                    icon={FolderOpen}
                    title="No collections match"
                    description={list.active ? "Try clearing a filter." : "No artist has created a collection yet."}
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
          <PanelHeader title="Most collections" description="Artists by live collections" />
          {summary.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : !s?.topArtists.length ? (
            <p className="px-4 py-3 text-[12px] text-[var(--text-3)]">No artist has a live collection.</p>
          ) : (
            <ul className="divide-y divide-[var(--hairline)]">
              {s.topArtists.map((a) => (
                <li key={a.artistId}>
                  <button
                    type="button"
                    onClick={() => {
                      setArtistName(a.name);
                      list.setFilter("artistId", a.artistId);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[12.5px] transition-colors hover:bg-[var(--surface-2)]",
                      f.artistId === a.artistId ? "text-[var(--accent-text)]" : "text-[var(--text-1)]"
                    )}
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="tnum text-[var(--text-3)]">{formatNumber(a.liveCollections)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list.active ? (
            <div className="border-t border-[var(--hairline)] px-4 py-2">
              <Button variant="ghost" size="sm" onClick={() => applyTile({})}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
