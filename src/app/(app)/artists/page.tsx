"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarPlus,
  Eye,
  EyeOff,
  ImageOff,
  MicVocal,
  ShieldAlert,
  Trophy,
  UserCheck,
  UserX,
  Users,
  UserRoundX,
  FileText,
} from "lucide-react";
import {
  useAdminOrganizations,
  useArtistCount,
  useArtistDirectory,
  useArtistDirectorySummary,
} from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Mono, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterPicker, FilterRow, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ArtistAvatar, ArtistStatusChips, MoneyMap } from "@/components/artist/artist-bits";
import type { AdminArtist, AdminArtistFilters, ArtistDirectorySummary } from "@/lib/types";

/**
 * Artists — the directory of every artist (GET /admin/artists), its headline
 * numbers (GET /admin/artists/summary) and a page per artist.
 * Collections have their own section; this one is about the artist.
 */
export default function ArtistsPage() {
  return (
    <PageGuard can={(p) => p.canOpen("/artists")} what="The artist directory" requires="drop:read (platform-wide)">
      <ArtistsView />
    </PageGuard>
  );
}

type Filters = {
  search?: string;
  organizationId?: string;
  isActive?: string;
  isPublic?: string;
  includeArchived?: string;
  sort?: string;
};

const FILTER_KEYS: (keyof Filters)[] = ["search", "organizationId", "isActive", "isPublic", "includeArchived"];

function ArtistsView() {
  usePageChrome({
    title: "Artists",
    description: "Everyone creating on HitBox — who they are, how they're doing, and what needs a look.",
  });
  const router = useRouter();
  const perms = usePermissions();
  const staff = perms.canReadArtistRecords();

  const list = useListState<Filters>({
    search: undefined,
    organizationId: undefined,
    isActive: undefined,
    isPublic: undefined,
    includeArchived: undefined,
    sort: undefined,
  });
  const [search, setSearch] = React.useState("");
  const { setFilter } = list;
  React.useEffect(() => {
    const t = setTimeout(() => setFilter("search", search.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [search, setFilter]);

  const query = useArtistDirectory(list.params as AdminArtistFilters);
  const orgs = useAdminOrganizations();
  const summary = useArtistDirectorySummary(staff);
  const f = list.filters;

  /** A tile sets exactly its filters and clears the rest (sort stays). */
  const setOnly = (patch: Filters) => {
    setSearch("");
    FILTER_KEYS.forEach((k) => list.setFilter(k, patch[k]));
  };
  const isOnly = (patch: Filters) =>
    FILTER_KEYS.filter((k) => k !== "search").every((k) => (patch[k] ?? undefined) === (f[k] ?? undefined));

  const columns: Column<AdminArtist>[] = [
    {
      key: "name",
      header: "Artist",
      cell: (a) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <ArtistAvatar artist={a} size={36} />
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--text-1)]">{a.name}</p>
            <Mono className="text-[10.5px]">@{a.slug}</Mono>
          </div>
        </div>
      ),
    },
    { key: "genre", header: "Genre", cell: (a) => <span className="text-[12.5px] text-[var(--text-2)]">{a.genre ?? "—"}</span> },
    {
      key: "org",
      header: "Organization",
      cell: (a) => <span className="text-[12.5px] text-[var(--text-2)]">{a.organizationName ?? "—"}</span>,
    },
    { key: "status", header: "Status", cell: (a) => <ArtistStatusChips artist={a} /> },
    { key: "drops", header: "Drops", numeric: true, cell: (a) => <span className="tnum">{formatNumber(a.counts.products)}</span> },
    {
      key: "collections",
      header: "Collections",
      numeric: true,
      cell: (a) => <span className="tnum">{formatNumber(a.counts.collections)}</span>,
    },
    {
      key: "followers",
      header: "Followers",
      numeric: true,
      cell: (a) => <span className="tnum">{a.counts.followers === undefined ? "—" : formatNumber(a.counts.followers)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {staff ? (
        <SummaryTiles summary={summary.data} loading={summary.isLoading} isOnly={isOnly} setOnly={setOnly} />
      ) : (
        <CountTiles isOnly={isOnly} setOnly={setOnly} />
      )}

      <div className={cn("grid grid-cols-1 gap-4", staff && "xl:grid-cols-[minmax(0,1fr)_280px]")}>
        <Panel className="min-w-0 overflow-hidden">
          <FilterRow
            active={list.active || Boolean(search)}
            onReset={() => {
              setSearch("");
              list.reset();
            }}
          >
            <SearchInput value={search} onChange={setSearch} placeholder="Name or handle" className="w-[200px]" />
            <FilterPicker
              label="Status"
              value={f.isActive}
              onChange={(v) => list.setFilter("isActive", v)}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
            <FilterPicker
              label="Profile"
              value={f.isPublic}
              onChange={(v) => list.setFilter("isPublic", v)}
              options={[
                { value: "true", label: "Public" },
                { value: "false", label: "Unlisted" },
              ]}
            />
            <FilterPicker
              label="Archived"
              value={f.includeArchived}
              onChange={(v) => list.setFilter("includeArchived", v)}
              allLabel="Hidden"
              options={[{ value: "true", label: "Included" }]}
            />
            {orgs.data ? (
              <FilterPicker
                label="Organization"
                value={f.organizationId}
                onChange={(v) => list.setFilter("organizationId", v)}
                options={orgs.data.map((o) => ({ value: o.id, label: o.name }))}
              />
            ) : null}
            <FilterPicker
              label="Sort"
              value={f.sort}
              onChange={(v) => list.setFilter("sort", v)}
              allLabel="Name A–Z"
              options={[
                { value: "newest", label: "Newest" },
                { value: "oldest", label: "Oldest" },
                { value: "drops", label: "Most drops" },
                { value: "collections", label: "Most collections" },
                { value: "followers", label: "Most followers" },
              ]}
            />
          </FilterRow>

          {query.isLoading ? (
            <TableSkeleton rows={10} cols={7} />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={query.data?.items ?? []}
                getRowKey={(a) => a.id}
                dimmed={query.isFetching}
                onRowClick={(a) => router.push(`/artists/${a.id}`)}
                rowClassName={(a) => (a.archivedAt ? "opacity-60" : undefined)}
                emptyState={
                  <EmptyState
                    icon={MicVocal}
                    title="No artists match"
                    description={list.active ? "Try clearing a filter." : "Artists appear here once they're invited."}
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

        {staff ? (
          <div className="space-y-4">
            <BestSellers summary={summary.data} loading={summary.isLoading} />
            <NeedsAttention summary={summary.data} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tiles                                                               */
/* ------------------------------------------------------------------ */

type TileDef = { label: string; value?: number; hint: string; icon: typeof Users; patch: Filters | null; tone?: "warning" };

function TileGrid({
  tiles,
  isOnly,
  setOnly,
  className,
}: {
  tiles: TileDef[];
  isOnly: (p: Filters) => boolean;
  setOnly: (p: Filters) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", className)}>
      {tiles.map((t) => {
        const on = t.patch ? isOnly(t.patch) : false;
        const Comp = t.patch ? "button" : "div";
        return (
          <Comp
            key={t.label}
            {...(t.patch
              ? { type: "button" as const, "aria-pressed": on, onClick: () => setOnly(on ? {} : t.patch!) }
              : {})}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition-colors",
              t.patch && "pressable",
              on
                ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                : "border-[var(--hairline)] bg-[var(--surface-1)]",
              t.patch && !on && "hover:border-[var(--hairline-strong)]"
            )}
          >
            <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
              <t.icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </p>
            {t.value === undefined ? (
              <Skeleton className="mt-1.5 h-7 w-14" />
            ) : (
              <p
                className={cn(
                  "tnum mt-1 text-[26px] font-semibold leading-none",
                  t.tone === "warning" && t.value > 0 ? "text-[var(--warning)]" : "text-[var(--text-1)]"
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
  );
}

function SummaryTiles({
  summary: s,
  loading,
  isOnly,
  setOnly,
}: {
  summary?: ArtistDirectorySummary;
  loading: boolean;
  isOnly: (p: Filters) => boolean;
  setOnly: (p: Filters) => void;
}) {
  const v = (n: number | undefined) => (loading ? undefined : n);
  return (
    <TileGrid
      isOnly={isOnly}
      setOnly={setOnly}
      className="xl:grid-cols-7"
      tiles={[
        { label: "Artists", value: v(s?.total), hint: "Live on the platform", icon: Users, patch: {} },
        { label: "Active", value: v(s?.active), hint: "Can sell", icon: UserCheck, patch: { isActive: "true" } },
        { label: "Inactive", value: v(s?.inactive), hint: "Switched off", icon: UserX, patch: { isActive: "false" }, tone: "warning" },
        { label: "Public", value: v(s?.public), hint: "On the storefront", icon: Eye, patch: { isPublic: "true" } },
        { label: "Unlisted", value: v(s?.unlisted), hint: "Hidden profile", icon: EyeOff, patch: { isPublic: "false" } },
        { label: "Archived", value: v(s?.archived), hint: "Retired", icon: Archive, patch: { includeArchived: "true" } },
        { label: "New this month", value: v(s?.newThisMonth), hint: "Since the 1st", icon: CalendarPlus, patch: null },
      ]}
    />
  );
}

/** For directory readers without the staff grant — totals read off the list. */
function CountTiles({ isOnly, setOnly }: { isOnly: (p: Filters) => boolean; setOnly: (p: Filters) => void }) {
  const live = useArtistCount({});
  const active = useArtistCount({ isActive: "true" });
  const inactive = useArtistCount({ isActive: "false" });
  const pub = useArtistCount({ isPublic: "true" });
  return (
    <TileGrid
      isOnly={isOnly}
      setOnly={setOnly}
      tiles={[
        { label: "Artists", value: live.data, hint: "Live on the platform", icon: Users, patch: {} },
        { label: "Active", value: active.data, hint: "Can sell", icon: UserCheck, patch: { isActive: "true" } },
        { label: "Inactive", value: inactive.data, hint: "Switched off", icon: UserX, patch: { isActive: "false" }, tone: "warning" },
        { label: "Public", value: pub.data, hint: "On the storefront", icon: Eye, patch: { isPublic: "true" } },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Side panels                                                         */
/* ------------------------------------------------------------------ */

function BestSellers({ summary: s, loading }: { summary?: ArtistDirectorySummary; loading: boolean }) {
  const rows = s?.topBySales ?? [];
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Best sellers" description="By units sold, all time" />
      {loading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-[8px]" />
          ))}
        </div>
      ) : s?.topBySales === null ? (
        <p className="px-4 py-3 text-[12px] text-[var(--text-3)]">Sales reporting isn&rsquo;t available on this server.</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-[var(--text-3)]">No sales yet.</p>
      ) : (
        <ol className="divide-y divide-[var(--hairline)]">
          {rows.map((r, i) => (
            <li key={r.artistId}>
              <Link
                href={`/artists/${r.artistId}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span
                  className={cn(
                    "tnum w-4 text-center text-[12px] font-semibold",
                    i === 0 ? "text-[#f5b942]" : "text-[var(--text-3)]"
                  )}
                >
                  {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <ArtistAvatar artist={r} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-[var(--text-1)]">{r.name}</span>
                  {r.revenue ? (
                    <MoneyMap value={r.revenue} className="text-[11px] text-[var(--text-3)]" />
                  ) : (
                    <span className="block text-[11px] text-[var(--text-3)]">{formatNumber(r.orders)} orders</span>
                  )}
                </span>
                <span className="tnum text-[12px] text-[var(--text-2)]">{formatNumber(r.unitsSold)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function NeedsAttention({ summary: s }: { summary?: ArtistDirectorySummary }) {
  if (!s) return null;
  const rows = [
    { icon: ShieldAlert, label: "Compliance not attested", n: s.withoutCompliance },
    { icon: UserRoundX, label: "Haven't signed up yet", n: s.withoutAccount },
    { icon: ImageOff, label: "No profile photo", n: s.withoutAvatar },
    { icon: FileText, label: "No bio", n: s.withoutBio },
  ];
  const any = rows.some((r) => r.n > 0);
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Needs a look" description="Live artists with gaps in their record" />
      {!any ? (
        <p className="px-4 py-3 text-[12px] text-[var(--text-3)]">Every live artist&rsquo;s record is complete.</p>
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5 px-4 py-2.5 text-[12.5px]">
              <r.icon className={cn("h-3.5 w-3.5", r.n > 0 ? "text-[var(--warning)]" : "text-[var(--text-3)]")} />
              <span className="flex-1 text-[var(--text-2)]">{r.label}</span>
              <span className={cn("tnum font-medium", r.n > 0 ? "text-[var(--text-1)]" : "text-[var(--text-3)]")}>
                {formatNumber(r.n)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
