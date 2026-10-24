"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, Eye, MicVocal, UserCheck, Users } from "lucide-react";
import { useAdminOrganizations, useArtistCount, useArtistDirectory } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Mono, Panel, Skeleton } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterPicker, FilterRow, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ArtistAvatar, ArtistStatusChips } from "@/components/artist/artist-bits";
import type { AdminArtist, AdminArtistFilters } from "@/lib/types";

/**
 * Artists — the directory of every artist on the platform (GET /admin/artists),
 * with headline numbers and a page per artist. Collections have their own
 * section; this one is about the artist.
 */
export default function ArtistsPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/artists")}
      what="The artist directory"
      requires="drop:read (platform-wide)"
    >
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
};

function ArtistsView() {
  usePageChrome({
    title: "Artists",
    description: "Everyone creating on HitBox — who they are, where they belong, and what they've made.",
  });
  const router = useRouter();
  const list = useListState<Filters>({
    search: undefined,
    organizationId: undefined,
    isActive: undefined,
    isPublic: undefined,
    includeArchived: undefined,
  });

  const [search, setSearch] = React.useState("");
  const { setFilter } = list;
  React.useEffect(() => {
    const t = setTimeout(() => setFilter("search", search.trim() || undefined), 300);
    return () => clearTimeout(t);
  }, [search, setFilter]);

  const query = useArtistDirectory(list.params as AdminArtistFilters);
  const orgs = useAdminOrganizations();

  // Headline numbers — each is one row asked for, total read.
  const live = useArtistCount({});
  const active = useArtistCount({ isActive: "true" });
  const pub = useArtistCount({ isPublic: "true" });
  const everyone = useArtistCount({ includeArchived: "true" });
  const archived = everyone.data !== undefined && live.data !== undefined ? everyone.data - live.data : undefined;

  const f = list.filters;
  const setOnly = (patch: Filters) => {
    setSearch("");
    (["search", "organizationId", "isActive", "isPublic", "includeArchived"] as (keyof Filters)[]).forEach((k) =>
      list.setFilter(k, patch[k])
    );
  };

  const tiles = [
    { label: "Artists", value: live.data, hint: "Live on the platform", icon: Users, on: !f.isActive && !f.isPublic && !f.includeArchived, patch: {} },
    { label: "Active", value: active.data, hint: "Switched on", icon: UserCheck, on: f.isActive === "true", patch: { isActive: "true" } },
    { label: "Public", value: pub.data, hint: "Profile listed", icon: Eye, on: f.isPublic === "true", patch: { isPublic: "true" } },
    { label: "Archived", value: archived, hint: "Retired by HitBox", icon: Archive, on: f.includeArchived === "true", patch: { includeArchived: "true" } },
  ];

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
    {
      key: "genre",
      header: "Genre",
      cell: (a) => <span className="text-[12.5px] text-[var(--text-2)]">{a.genre ?? "—"}</span>,
    },
    {
      key: "org",
      header: "Organization",
      cell: (a) => <span className="text-[12.5px] text-[var(--text-2)]">{a.organizationName ?? "—"}</span>,
    },
    { key: "status", header: "Status", cell: (a) => <ArtistStatusChips artist={a} /> },
    {
      key: "drops",
      header: "Drops",
      numeric: true,
      cell: (a) => <span className="tnum">{formatNumber(a.counts.products)}</span>,
    },
    {
      key: "collections",
      header: "Collections",
      numeric: true,
      cell: (a) => <span className="tnum">{formatNumber(a.counts.collections)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            aria-pressed={t.on}
            onClick={() => setOnly(t.patch)}
            className={cn(
              "pressable rounded-xl border px-4 py-3 text-left transition-colors",
              t.on
                ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                : "border-[var(--hairline)] bg-[var(--surface-1)] hover:border-[var(--hairline-strong)]"
            )}
          >
            <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
              <t.icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </p>
            {t.value === undefined ? (
              <Skeleton className="mt-1.5 h-7 w-14" />
            ) : (
              <p className="tnum mt-1 text-[26px] font-semibold leading-none text-[var(--text-1)]">{formatNumber(t.value)}</p>
            )}
            <p className="mt-1.5 text-[11px] text-[var(--text-3)]">{t.hint}</p>
          </button>
        ))}
      </div>

      <Panel className="overflow-hidden">
        <FilterRow
          active={list.active || Boolean(search)}
          onReset={() => {
            setSearch("");
            list.reset();
          }}
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Name or handle" className="w-[220px]" />
          {orgs.data ? (
            <FilterPicker
              label="Organization"
              value={f.organizationId}
              onChange={(v) => list.setFilter("organizationId", v)}
              options={orgs.data.map((o) => ({ value: o.id, label: o.name }))}
            />
          ) : null}
          <Chip on={f.isActive === "true"} onClick={() => list.setFilter("isActive", f.isActive ? undefined : "true")}>
            Active only
          </Chip>
          <Chip on={f.isPublic === "true"} onClick={() => list.setFilter("isPublic", f.isPublic ? undefined : "true")}>
            Public only
          </Chip>
          <Chip
            on={f.includeArchived === "true"}
            onClick={() => list.setFilter("includeArchived", f.includeArchived ? undefined : "true")}
          >
            Include archived
          </Chip>
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={6} />
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
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-7 rounded-full border px-3 text-[12px] transition-colors",
        on
          ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent-text)]"
          : "border-[var(--hairline)] text-[var(--text-2)] hover:border-[var(--hairline-strong)]"
      )}
    >
      {children}
    </button>
  );
}

