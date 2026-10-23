"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Package } from "lucide-react";
import { useAdminCollection } from "@/lib/api/hooks";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import {
  Badge,
  Mono,
  Panel,
  Segmented,
  Skeleton,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ArtistFlags, HeroThumb, StatusChips } from "@/components/artist/collection-bits";
import { CollectionHistory } from "@/components/artist/collection-history";
import type { AdminArtistCollectionDetail } from "@/lib/types";

/** One artist collection, read-only: every drop filed under it and its change history. */
export default function AdminCollectionPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/artist-collections")}
      what="Artist collections"
      requires="brand-artist-record:read (platform-wide)"
    >
      <CollectionView />
    </PageGuard>
  );
}

function BackLink() {
  return (
    <Link
      href="/artist-collections"
      className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-1)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> All collections
    </Link>
  );
}

function CollectionView() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const query = useAdminCollection(collectionId);
  const c = query.data;
  const perms = usePermissions();
  const canHistory = perms.canRead("audit-log");
  const [tab, setTab] = React.useState<"drops" | "history">("drops");

  usePageChrome({
    title: c?.name ?? "Collection",
    description: c ? `By ${c.artist.name}` : undefined,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (query.isError || !c) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      </div>
    );
  }

  const otherArtist = c.drops.filter((d) => !d.sameArtist).length;

  return (
    <div className="space-y-4">
      <BackLink />
      <Header c={c} />

      {otherArtist > 0 ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-[var(--danger)] bg-[var(--danger-dim)] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <p className="text-[12.5px] text-[var(--text-1)]">
            <strong className="font-semibold text-[var(--danger)]">
              {otherArtist} drop{otherArtist === 1 ? " belongs" : "s belong"} to a different artist.
            </strong>{" "}
            This is legacy data — new drops can&rsquo;t be filed this way. Fix it from each drop&rsquo;s edit screen.
          </p>
        </div>
      ) : null}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-2.5">
          {canHistory ? (
            <Segmented
              value={tab}
              onChange={setTab}
              size="sm"
              options={[
                { value: "drops", label: `Drops (${c.drops.length})` },
                { value: "history", label: "History" },
              ]}
            />
          ) : (
            <p className="text-[13px] font-semibold text-[var(--text-1)]">Drops</p>
          )}
          {tab === "drops" ? (
            <p className="text-[11.5px] text-[var(--text-3)]">
              Every drop filed here, newest first — not only the ones the artist sees.
            </p>
          ) : null}
        </div>
        {tab === "history" && canHistory ? <CollectionHistory collectionId={c.id} /> : <DropsList c={c} />}
      </Panel>
    </div>
  );
}

function Header({ c }: { c: AdminArtistCollectionDetail }) {
  return (
    <Panel className="overflow-hidden">
      {c.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a public S3 URL
        <img src={c.heroImageUrl} alt="" className="h-36 w-full object-cover" />
      ) : null}
      <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
        {c.heroImageUrl ? null : <HeroThumb url={null} name={c.name} size={44} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">{c.name}</h2>
            <StatusChips row={c} />
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--text-3)]">
            <Mono className="text-[11px]">{c.slug}</Mono> · <Mono className="text-[11px]">{c.publicCode}</Mono>
          </p>
          {c.description ? (
            <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[12.5px] text-[var(--text-2)]">{c.description}</p>
          ) : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--hairline)] px-4 py-3 text-[12px] sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Artist">
          <span className="flex flex-wrap items-center gap-1.5">
            <Link href={`/artist-collections?artistId=${c.artist.id}`} className="text-[var(--text-1)] hover:underline">
              {c.artist.name}
            </Link>
            <ArtistFlags artist={c.artist} />
          </span>
        </Fact>
        <Fact label="Organization">{c.organization?.name ?? "—"}</Fact>
        <Fact label="Drops">
          <Tooltip content="Live = not archived, any status. Shown = on sale and the artist's own. Ever = every drop filed here.">
            <span className="tnum">
              {formatNumber(c.counts.liveDrops)} live · {formatNumber(c.counts.activeDrops)} shown ·{" "}
              {formatNumber(c.counts.drops)} ever
            </span>
          </Tooltip>
        </Fact>
        <Fact label="Position">{c.status === "LIVE" ? `#${c.position + 1} on the artist's page` : "—"}</Fact>
        <Fact label="Created">{formatDate(c.createdAt)}</Fact>
        <Fact label={c.archivedAt ? "Deleted" : "Updated"}>{formatDateTime(c.archivedAt ?? c.updatedAt)}</Fact>
      </dl>
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] uppercase tracking-wide text-[var(--text-3)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--text-1)]">{children}</dd>
    </div>
  );
}

function DropsList({ c }: { c: AdminArtistCollectionDetail }) {
  const perms = usePermissions();
  const canOpenDrop = perms.canOpenDropPage();

  if (c.drops.length === 0) {
    return <EmptyState icon={Package} title="No drops" description="Nothing has been filed under this collection." />;
  }
  return (
    <ul className="divide-y divide-[var(--hairline)]">
      {c.drops.map((d) => {
        const name = (
          <span className="truncate text-[12.5px] font-medium text-[var(--text-1)]">{d.name}</span>
        );
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              {canOpenDrop ? (
                <Link href={`/products/${d.id}`} className="hover:underline">
                  {name}
                </Link>
              ) : (
                name
              )}
              <p className="text-[11px] text-[var(--text-3)]">Filed {formatDate(d.createdAt)}</p>
            </div>
            {!d.sameArtist ? (
              <Tooltip content="This drop belongs to a different artist — legacy data. Fix it from the drop's edit screen.">
                <span>
                  <Badge tone="danger">Different artist</Badge>
                </span>
              </Tooltip>
            ) : null}
            {d.shownToArtist ? (
              <Badge tone="accent">Shown to artist</Badge>
            ) : (
              <Tooltip content="Not on sale (or archived), so the artist doesn't see it — but it still blocks deleting the collection unless archived.">
                <span>
                  <Badge tone="neutral" outline>
                    Hidden from artist
                  </Badge>
                </span>
              </Tooltip>
            )}
            {d.archivedAt ? (
              <Badge tone="neutral">Archived</Badge>
            ) : (
              <Badge tone={toneForStatus(d.status)} dot>
                {humanize(d.status)}
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
