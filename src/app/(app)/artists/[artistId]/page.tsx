"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, LibraryBig, Package, ScrollText, ShoppingBag, Sparkles } from "lucide-react";
import { useAdminArtist, useAdminCollections, useArtistDrops } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Mono, Panel, Segmented, Skeleton, toneForStatus } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ArtistAvatar, ArtistStatusChips } from "@/components/artist/artist-bits";
import { HeroThumb, StatusChips } from "@/components/artist/collection-bits";
import { DropMonogram } from "@/components/artist/drop-tile";
import type { AdminArtist } from "@/lib/types";

/** One artist: who they are, their numbers, their drops and collections. Read-only. */
export default function ArtistPage() {
  return (
    <PageGuard can={(p) => p.canOpen("/artists")} what="The artist directory" requires="drop:read (platform-wide)">
      <ArtistView />
    </PageGuard>
  );
}

function BackLink() {
  return (
    <Link href="/artists" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-1)]">
      <ArrowLeft className="h-3.5 w-3.5" /> All artists
    </Link>
  );
}

type Tab = "drops" | "collections";

function ArtistView() {
  const { artistId } = useParams<{ artistId: string }>();
  const perms = usePermissions();
  const query = useAdminArtist(artistId);
  const a = query.data;
  const canCollections = perms.canOpen("/artist-collections");
  const [tab, setTab] = React.useState<Tab>("drops");

  // Numbers the directory row doesn't carry — each a one-row read of a total.
  const onSale = useArtistDrops(artistId, { status: "ACTIVE", limit: 1 });
  // brand-artist-record:read (global) — not every directory reader has it.
  const liveCollections = useAdminCollections({ artistId, status: "live", limit: 1 }, canCollections);
  const publicCollections = useAdminCollections(
    { artistId, status: "live", isPublic: "true", limit: 1 },
    canCollections
  );

  usePageChrome({ title: a?.name ?? "Artist", description: a ? `@${a.slug}` : undefined });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (query.isError || !a) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      </div>
    );
  }

  // The artist's account id rides on their collections — the only way to
  // reach "everything they did" in the audit log today.
  const userId = liveCollections.data?.items[0]?.artist.userId ?? null;

  return (
    <div className="space-y-5">
      <BackLink />
      <Hero a={a} userId={userId} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Package} label="Drops" value={a.counts.products} hint="Every drop credited to them" />
        <Stat icon={ShoppingBag} label="On sale" value={onSale.data?.total} hint="Active in the catalog" />
        <Stat
          icon={LibraryBig}
          label="Collections"
          value={canCollections ? liveCollections.data?.total : a.counts.collections}
          hint={canCollections ? `${formatNumber(a.counts.collections)} ever created` : "Ever created"}
        />
        {canCollections ? (
          <Stat icon={Sparkles} label="Public collections" value={publicCollections.data?.total} hint="On their page" />
        ) : null}
      </div>

      <div className="space-y-3">
        {canCollections ? (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "drops", label: `Drops (${formatNumber(a.counts.products)})` },
              { value: "collections", label: `Collections (${formatNumber(a.counts.collections)})` },
            ]}
          />
        ) : null}
        {tab === "collections" && canCollections ? <CollectionsTab artistId={a.id} /> : <DropsTab artistId={a.id} />}
      </div>
    </div>
  );
}

function Hero({ a, userId }: { a: AdminArtist; userId: string | null }) {
  const perms = usePermissions();
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)]">
      <div className="relative h-28 bg-gradient-to-br from-[var(--accent)] via-[#8b5cf6] to-[#ec4899] sm:h-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_120%,rgba(255,255,255,0.25),transparent_55%)]" />
      </div>
      <div className="relative px-5 pb-5">
        <div className="-mt-10 flex flex-wrap items-end gap-4">
          <div className="relative z-10 rounded-full ring-4 ring-[var(--surface-1)]">
            <ArtistAvatar artist={a} size={84} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">{a.name}</h2>
              <ArtistStatusChips artist={a} />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-3)]">
              <Mono className="text-[11.5px]">@{a.slug}</Mono>
              {a.genre ? <span>{a.genre}</span> : null}
              {a.organizationName ? (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {a.organizationName}
                </span>
              ) : null}
              {a.archivedAt ? <span>Archived {formatDate(a.archivedAt)}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            {perms.canOpen("/artist-collections") ? (
              <QuickLink href={`/artist-collections?artistId=${a.id}`} icon={LibraryBig}>
                Collections
              </QuickLink>
            ) : null}
            {userId && perms.canOpen("/activity") ? (
              <QuickLink href={`/activity?actorId=${userId}`} icon={ScrollText}>
                Activity
              </QuickLink>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, icon: Icon, children }: { href: string; icon: typeof ScrollText; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-2)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text-1)]"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Package;
  label: string;
  value: number | undefined;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      {value === undefined ? (
        <Skeleton className="mt-1.5 h-7 w-12" />
      ) : (
        <p className="tnum mt-1 text-[26px] font-semibold leading-none text-[var(--text-1)]">{formatNumber(value)}</p>
      )}
      <p className="mt-1.5 truncate text-[11px] text-[var(--text-3)]">{hint}</p>
    </div>
  );
}

function DropsTab({ artistId }: { artistId: string }) {
  const perms = usePermissions();
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const q = useArtistDrops(artistId, { page, limit: 12 });
  const canOpen = perms.canOpenDropPage();

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
    );
  }
  if (q.isError) return <Panel><ErrorState error={q.error} onRetry={() => q.refetch()} /></Panel>;
  const items = q.data?.items ?? [];
  if (items.length === 0) {
    return <Panel><EmptyState icon={Package} title="No drops yet" description="Drops credited to this artist appear here." /></Panel>;
  }
  return (
    <div className="space-y-3">
      <ul className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", q.isFetching && "opacity-60")}>
        {items.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              disabled={!canOpen}
              onClick={() => router.push(`/products/${d.id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] p-3 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--hairline-strong)] enabled:hover:shadow-[var(--shadow-2)]"
            >
              <DropMonogram id={d.id} name={d.name} className="h-12 w-12 rounded-[10px] text-[14px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--text-1)]">{d.name}</span>
                <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[var(--text-3)]">
                  <Mono className="text-[10.5px]">{d.groupCode}</Mono>
                  <span className="tnum">{formatNumber(d.totalSupply)} made</span>
                </span>
              </span>
              <Badge tone={toneForStatus(d.status)} dot>
                {humanize(d.status)}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
      {(q.data?.total ?? 0) > 12 ? (
        <Panel className="overflow-hidden">
          <Pagination page={page} limit={12} total={q.data?.total ?? 0} onPageChange={setPage} />
        </Panel>
      ) : null}
    </div>
  );
}

function CollectionsTab({ artistId }: { artistId: string }) {
  const router = useRouter();
  const q = useAdminCollections({ artistId, status: "all", sort: "updated", limit: 12 });
  if (q.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
    );
  }
  if (q.isError) return <Panel><ErrorState error={q.error} onRetry={() => q.refetch()} /></Panel>;
  const items = q.data?.items ?? [];
  if (items.length === 0) {
    return <Panel><EmptyState icon={LibraryBig} title="No collections" description="This artist hasn't created a collection yet." /></Panel>;
  }
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => router.push(`/artist-collections/${c.id}`)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--hairline-strong)] hover:shadow-[var(--shadow-2)]",
                c.status === "ARCHIVED" && "opacity-70"
              )}
            >
              <HeroThumb url={c.heroImageUrl} name={c.name} size={52} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--text-1)]">{c.name}</span>
                <span className="mt-0.5 block text-[11.5px] text-[var(--text-3)]">
                  {formatNumber(c.counts.liveDrops)} live drop{c.counts.liveDrops === 1 ? "" : "s"} · updated {formatDate(c.updatedAt)}
                </span>
                <span className="mt-1 block">
                  <StatusChips row={c} />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {(q.data?.total ?? 0) > items.length ? (
        <Link
          href={`/artist-collections?artistId=${artistId}`}
          className="inline-flex items-center gap-1 text-[12.5px] text-[var(--text-2)] hover:text-[var(--text-1)]"
        >
          All {formatNumber(q.data?.total)} collections <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
