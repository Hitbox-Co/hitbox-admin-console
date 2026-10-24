"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Heart,
  LibraryBig,
  Package,
  Pencil,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from "lucide-react";
import {
  useAdminArtist,
  useAdminCollections,
  useArtistDrops,
  useArtistStaffProfile,
} from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel, Segmented, Skeleton, Tooltip, toneForStatus } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/filters";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ArtistAvatar, ArtistStatusChips } from "@/components/artist/artist-bits";
import { HeroThumb, StatusChips } from "@/components/artist/collection-bits";
import { DropMonogram } from "@/components/artist/drop-tile";
import { ArtistStatsTab } from "@/components/artist/artist-stats";
import { ArtistAboutTab } from "@/components/artist/artist-about";
import { ArtistActionMenu, EditArtistDialog } from "@/components/artist/artist-admin-actions";
import { ResourceHistory } from "@/components/artist/collection-history";

/**
 * One artist (artist-admin-api.md). Staff with the platform-wide
 * brand-artist-record grant get the full profile, stats, edit and state
 * actions; a directory reader (drop:read) gets the directory row, drops and
 * collections.
 */
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

type Tab = "overview" | "drops" | "collections" | "about" | "activity";

/** What the header needs — from the staff profile, or the directory row. */
type HeaderArtist = {
  id: string;
  name: string;
  slug: string;
  genre: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isActive: boolean;
  isPublic: boolean;
  archivedAt: string | null;
  organizationName: string | null;
  counts: { drops: number; collections: number; followers?: number };
};

function ArtistView() {
  const { artistId } = useParams<{ artistId: string }>();
  const perms = usePermissions();
  const staff = perms.canReadArtistRecords();
  const canManage = perms.canManageArtists();
  const canCollections = perms.canOpen("/artist-collections");
  const canAudit = perms.canOpen("/activity");

  const profile = useArtistStaffProfile(artistId, staff);
  const row = useAdminArtist(staff ? undefined : artistId);
  const query = staff ? profile : row;
  const p = profile.data;

  const [tab, setTab] = React.useState<Tab>(staff ? "overview" : "drops");
  const [editing, setEditing] = React.useState(false);

  const a: HeaderArtist | undefined = p
    ? {
        ...p,
        organizationName: p.organization?.name ?? null,
        counts: p.counts,
      }
    : row.data
      ? {
          ...row.data,
          coverUrl: null,
          counts: {
            drops: row.data.counts.products,
            collections: row.data.counts.collections,
            followers: row.data.counts.followers,
          },
        }
      : undefined;

  usePageChrome({ title: a?.name ?? "Artist", description: a ? `@${a.slug}` : undefined });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-9 w-80 rounded-[8px]" />
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

  const tabs: { value: Tab; label: string }[] = [
    ...(staff ? [{ value: "overview" as const, label: "Overview" }] : []),
    { value: "drops", label: `Drops · ${formatNumber(a.counts.drops)}` },
    ...(canCollections ? [{ value: "collections" as const, label: `Collections · ${formatNumber(a.counts.collections)}` }] : []),
    ...(staff ? [{ value: "about" as const, label: "About" }] : []),
    ...(canAudit ? [{ value: "activity" as const, label: "Activity" }] : []),
  ];

  return (
    <div className="space-y-5">
      <BackLink />

      <Hero
        a={a}
        attested={p?.compliance.attested}
        actions={
          p && canManage ? (
            <>
              {!p.archivedAt ? (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              ) : null}
              <ArtistActionMenu profile={p} />
            </>
          ) : null
        }
        links={
          <>
            {canCollections ? (
              <QuickLink href={`/artist-collections?artistId=${a.id}`} icon={LibraryBig}>
                Collections
              </QuickLink>
            ) : null}
            {p?.account && canAudit ? (
              <QuickLink href={`/activity?actorId=${p.account.userId}`} icon={ScrollText}>
                What they did
              </QuickLink>
            ) : null}
          </>
        }
      />

      {p && <Alerts p={p} />}

      <Segmented value={tab} onChange={setTab} options={tabs} />

      {tab === "overview" && staff ? (
        <ArtistStatsTab artistId={a.id} />
      ) : tab === "collections" && canCollections ? (
        <CollectionsTab artistId={a.id} />
      ) : tab === "about" && p ? (
        <ArtistAboutTab p={p} />
      ) : tab === "activity" && canAudit ? (
        <Panel className="overflow-hidden">
          <ResourceHistory resourceType="Artist" resourceId={a.id} />
        </Panel>
      ) : (
        <DropsTab artistId={a.id} />
      )}

      {editing && p ? <EditArtistDialog key={p.updatedAt} profile={p} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Hero({
  a,
  attested,
  actions,
  links,
}: {
  a: HeaderArtist;
  attested?: boolean;
  actions: React.ReactNode;
  links: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)]">
      <div className="relative h-32 sm:h-40">
        {a.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a public S3 URL
          <img src={a.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[var(--accent)] via-[#8b5cf6] to-[#ec4899]">
            <div className="h-full w-full bg-[radial-gradient(circle_at_20%_120%,rgba(255,255,255,0.25),transparent_55%)]" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgba(0,0,0,0.35)] to-transparent" />
      </div>
      <div className="relative px-5 pb-5">
        {/* Only the avatar overlaps the cover; the name and chips sit below it. */}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="relative z-10 -mt-12 shrink-0 rounded-full ring-4 ring-[var(--surface-1)]">
            <ArtistAvatar artist={a} size={92} />
          </div>
          <div className="min-w-0 flex-1 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[21px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">{a.name}</h2>
              <ArtistStatusChips artist={a} />
              {attested === undefined ? null : attested ? (
                <Tooltip content="HitBox has attested this artist's compliance.">
                  <span>
                    <Badge tone="positive">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </Badge>
                  </span>
                </Tooltip>
              ) : null}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-3)]">
              <Mono className="text-[11.5px]">@{a.slug}</Mono>
              {a.genre ? <span>{humanize(a.genre)}</span> : null}
              {a.organizationName ? (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {a.organizationName}
                </span>
              ) : null}
              {a.counts.followers !== undefined ? (
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />
                  {formatNumber(a.counts.followers)} follower{a.counts.followers === 1 ? "" : "s"}
                </span>
              ) : null}
              {a.archivedAt ? <span>Archived {formatDate(a.archivedAt)}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            {links}
            {actions}
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
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-2)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text-1)]"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}

/** The few things on a profile that need someone to act. */
function Alerts({ p }: { p: NonNullable<ReturnType<typeof useArtistStaffProfile>["data"]> }) {
  const items: { tone: "warning" | "danger"; icon: typeof AlertTriangle; text: string }[] = [];
  if (p.archivedAt) items.push({ tone: "warning", icon: AlertTriangle, text: "Archived — restore from Actions to edit or change anything." });
  else if (!p.isActive) items.push({ tone: "warning", icon: AlertTriangle, text: "Inactive — selling is off and the artist can't edit their profile." });
  if (!p.compliance.attested && !p.archivedAt) items.push({ tone: "warning", icon: ShieldX, text: "Compliance hasn't been attested." });
  if (!p.account) items.push({ tone: "warning", icon: AlertTriangle, text: "The artist hasn't accepted their invitation yet." });
  if ((p.payouts?.failedBatches ?? 0) > 0) items.push({ tone: "danger", icon: AlertTriangle, text: `${p.payouts!.failedBatches} payout batch(es) failed — see About.` });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <span
          key={i.text}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]",
            i.tone === "danger" ? "bg-[var(--danger-dim)] text-[var(--danger)]" : "bg-[var(--warning-dim)] text-[var(--warning)]"
          )}
        >
          <i.icon className="h-3.5 w-3.5" />
          {i.text}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drops — every status (admin/dashboard/products?artistId=)           */
/* ------------------------------------------------------------------ */

const DROP_STATUSES = ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "ACTIVE", "ENDED", "REJECTED"];

function DropsTab({ artistId }: { artistId: string }) {
  const perms = usePermissions();
  const router = useRouter();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<string | undefined>();
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const drops = useArtistDrops(artistId, { page, limit: 12, status, q: q || undefined });
  const canOpen = perms.canOpenDropPage();
  const items = drops.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Name or group code" className="w-[220px]" />
        <div className="flex flex-wrap gap-1">
          {[undefined, ...DROP_STATUSES].map((s) => (
            <button
              key={s ?? "all"}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={cn(
                "h-7 rounded-full border px-2.5 text-[11.5px] transition-colors",
                status === s
                  ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent-text)]"
                  : "border-[var(--hairline)] text-[var(--text-2)] hover:border-[var(--hairline-strong)]"
              )}
            >
              {s ? humanize(s) : "All"}
            </button>
          ))}
        </div>
      </div>

      {drops.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
      ) : drops.isError ? (
        <Panel>
          <ErrorState error={drops.error} onRetry={() => drops.refetch()} />
        </Panel>
      ) : items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Package}
            title={status || q ? "No drops match" : "No drops yet"}
            description={status || q ? "Try another status or search." : "Drops credited to this artist appear here, drafts included."}
          />
        </Panel>
      ) : (
        <>
          <ul className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", drops.isFetching && "opacity-60")}>
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
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--text-3)]">
                      <Mono className="text-[10.5px]">{d.groupCode}</Mono>
                      <span className="tnum">{formatNumber(d.totalSupply)} made</span>
                      {d.collectionId ? (
                        <span className="inline-flex items-center gap-0.5">
                          <LibraryBig className="h-3 w-3" /> in a collection
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <Badge tone={toneForStatus(d.status)} dot>
                    {humanize(d.status)}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          {(drops.data?.total ?? 0) > 12 ? (
            <Panel className="overflow-hidden">
              <Pagination page={page} limit={12} total={drops.data?.total ?? 0} onPageChange={setPage} />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

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
  if (q.isError) {
    return (
      <Panel>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Panel>
    );
  }
  const items = q.data?.items ?? [];
  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState icon={Sparkles} title="No collections" description="This artist hasn't created a collection yet." />
      </Panel>
    );
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
