"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  FolderPlus,
  GripVertical,
  LibraryBig,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useArchiveCollection,
  useMyArtistProfile,
  useMyCollections,
  useReorderCollections,
} from "@/lib/api/hooks";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Panel, Segmented, Skeleton, Tooltip } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/packing/packing-ui";
import { CollectionFormDialog, useRestoreFlow } from "./collection-dialogs";
import type { ArtistCollection } from "@/lib/types";

/**
 * My collections — the signed-in artist's collections (artist-collection-api.md).
 *
 * Live collections are cards in the order shown on the artist's page; drag a
 * card (or use Move up / down) to reorder, which sends the whole list.
 * Deleted collections sit under Archived with Restore. When HitBox has locked
 * the profile, everything is read-only.
 */

export const COLLECTION_LIMIT = 50;

export function useCollectionsLocked() {
  const profile = useMyArtistProfile();
  return profile.data ? !profile.data.editable : false;
}

export function blockedDeleteCopy(c: ArtistCollection): string | null {
  if (c.actions?.canArchive) return null;
  if (c.actions?.archiveBlockedReason === "HAS_DROPS") {
    const n = c.counts.liveDrops;
    const notOnSale = c.counts.liveDrops - c.counts.activeDrops;
    return (
      `This collection still has ${n} drop${n === 1 ? "" : "s"}.` +
      (c.counts.activeDrops > 0 ? " Remove your on-sale drops from it first." : "") +
      (notOnSale > 0 ? ` ${notOnSale} not yet on sale — your brand team or HitBox can move those.` : "")
    );
  }
  return "This collection can't be deleted right now.";
}

export function MyCollectionsView() {
  const router = useRouter();
  const profile = useMyArtistProfile();
  const locked = useCollectionsLocked();
  const [tab, setTab] = React.useState<"live" | "archived">("live");
  const live = useMyCollections("live");
  const archived = useMyCollections("archived", tab === "archived");
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ArtistCollection | null>(null);
  const [deleting, setDeleting] = React.useState<ArtistCollection | null>(null);
  const archive = useArchiveCollection();
  const restoreFlow = useRestoreFlow();

  const liveCount = live.data?.length ?? 0;
  const atLimit = liveCount >= COLLECTION_LIMIT;
  const query = tab === "live" ? live : archived;

  const confirmDelete = () => {
    if (!deleting) return;
    archive.mutate(deleting.id, {
      onSuccess: (c) => {
        toast.success(`${c.name} deleted — restore it any time from Archived`);
        setDeleting(null);
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.friendly : "Could not delete the collection.");
        setDeleting(null);
      },
    });
  };

  return (
    <div className="space-y-4">
      {locked ? <LockedBanner /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "live", label: live.data ? `Live (${liveCount})` : "Live" },
            { value: "archived", label: "Archived" },
          ]}
        />
        {!locked && tab === "live" ? (
          atLimit ? (
            <p className="text-[12px] text-[var(--text-3)]">
              You have {COLLECTION_LIMIT} collections — the most allowed. Delete one to add another.
            </p>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <FolderPlus className="h-3.5 w-3.5" /> New collection
            </Button>
          )
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      ) : tab === "live" ? (
        <LiveGrid
          items={live.data ?? []}
          locked={locked}
          onOpen={(c) => router.push(`/artist/collections/${c.id}`)}
          onEdit={setEditing}
          onDelete={setDeleting}
          onCreate={() => setCreating(true)}
        />
      ) : (archived.data ?? []).length === 0 ? (
        <Panel>
          <EmptyState icon={LibraryBig} title="Nothing archived" description="Collections you delete land here, ready to restore." />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(archived.data ?? []).map((c) => (
            <CollectionCard
              key={c.id}
              c={c}
              onOpen={() => router.push(`/artist/collections/${c.id}`)}
              footer={
                c.actions?.canRestore && !locked ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={restoreFlow.busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (atLimit) {
                        toast.error(`You already have ${COLLECTION_LIMIT} live collections. Delete one first.`);
                        return;
                      }
                      restoreFlow.restore(c);
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                  </Button>
                ) : null
              }
            />
          ))}
        </div>
      )}

      {tab === "archived" && (archived.data ?? []).length > 0 ? (
        <p className="text-[11.5px] text-[var(--text-3)]">
          A restored collection comes back as a draft at the end of your list, with the same web address.
        </p>
      ) : null}

      {creating ? (
        <CollectionFormDialog
          handle={profile.data?.slug}
          onClose={() => setCreating(false)}
          onSaved={(c) => router.push(`/artist/collections/${c.id}`)}
        />
      ) : null}
      {editing ? <CollectionFormDialog collection={editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? "collection"}?`}
        body="This removes the collection from your page. You can restore it later from Archived."
        confirmLabel="Delete"
        busy={archive.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
      {restoreFlow.dialog}
    </div>
  );
}

function LockedBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)] bg-[var(--warning-dim)] px-4 py-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" />
      <p className="text-[12.5px] text-[var(--text-1)]">
        HitBox has archived or deactivated your profile, so your collections are read-only. Contact support to change them.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live grid with drag-and-drop reorder                                */
/* ------------------------------------------------------------------ */

function LiveGrid({
  items,
  locked,
  onOpen,
  onEdit,
  onDelete,
  onCreate,
}: {
  items: ArtistCollection[];
  locked: boolean;
  onOpen: (c: ArtistCollection) => void;
  onEdit: (c: ArtistCollection) => void;
  onDelete: (c: ArtistCollection) => void;
  onCreate: () => void;
}) {
  const qc = useQueryClient();
  const reorder = useReorderCollections();
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const previous = items;
    // Show the new order at once; the response replaces it.
    qc.setQueryData(["artist-collections", "live"], next.map((c, i) => ({ ...c, position: i })));
    reorder.mutate(
      next.map((c) => c.id),
      {
        onError: (err) => {
          if (err instanceof ApiError && err.code === "ARTIST_COLLECTION_ORDER_MISMATCH") {
            qc.invalidateQueries({ queryKey: ["artist-collections"] });
          } else {
            qc.setQueryData(["artist-collections", "live"], previous);
          }
          toast.error(err instanceof ApiError ? err.friendly : "Could not save the new order.");
        },
      }
    );
  };

  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={LibraryBig}
          title="No collections yet"
          description="Group your drops into collections — a season, a tour, a series."
          action={
            locked ? undefined : (
              <Button variant="primary" size="sm" onClick={onCreate}>
                <FolderPlus className="h-3.5 w-3.5" /> New collection
              </Button>
            )
          }
        />
      </Panel>
    );
  }

  const canReorder = !locked && items.length > 1;

  return (
    <>
      {canReorder ? (
        <p className="text-[11.5px] text-[var(--text-3)]">Drag cards to change the order on your page.</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((c, i) => (
          <div
            key={c.id}
            draggable={canReorder}
            onDragStart={(e) => {
              setDragId(c.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(c.id);
            }}
            onDragLeave={() => setOverId((o) => (o === c.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const from = items.findIndex((x) => x.id === dragId);
              setDragId(null);
              setOverId(null);
              if (from >= 0) move(from, i);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={cn(
              "rounded-xl transition-opacity",
              dragId === c.id && "opacity-40",
              overId === c.id && dragId !== c.id && "ring-2 ring-[var(--accent)]"
            )}
          >
            <CollectionCard
              c={c}
              onOpen={() => onOpen(c)}
              grip={canReorder}
              menu={
                locked ? null : (
                  <CardMenu
                    c={c}
                    first={i === 0}
                    last={i === items.length - 1}
                    onEdit={() => onEdit(c)}
                    onDelete={() => onDelete(c)}
                    onMove={(d) => move(i, i + d)}
                  />
                )
              }
            />
          </div>
        ))}
      </div>
    </>
  );
}

function CardMenu({
  c,
  first,
  last,
  onEdit,
  onDelete,
  onMove,
}: {
  c: ArtistCollection;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  const blocked = blockedDeleteCopy(c);
  const item =
    "flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12.5px] text-[var(--text-1)] outline-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--surface-2)]";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${c.name}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-[6px] bg-[rgba(0,0,0,0.45)] p-1 text-white backdrop-blur transition-colors hover:bg-[rgba(0,0,0,0.65)]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-[70] min-w-[180px] rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] p-1 shadow-[var(--shadow-3)]"
        >
          <DropdownMenu.Item className={item} onSelect={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} disabled={first} onSelect={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" /> Move up
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} disabled={last} onSelect={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" /> Move down
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--hairline)]" />
          <DropdownMenu.Item
            className={cn(item, "text-[var(--danger)]")}
            disabled={Boolean(blocked)}
            onSelect={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </DropdownMenu.Item>
          {blocked ? <p className="max-w-[220px] px-2 pb-1.5 text-[11px] leading-snug text-[var(--text-3)]">{blocked}</p> : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ------------------------------------------------------------------ */

function CollectionCard({
  c,
  onOpen,
  menu,
  footer,
  grip,
}: {
  c: ArtistCollection;
  onOpen: () => void;
  menu?: React.ReactNode;
  footer?: React.ReactNode;
  grip?: boolean;
}) {
  const archived = c.status === "ARCHIVED";
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] transition-colors hover:border-[var(--hairline-strong)]",
        archived && "opacity-75"
      )}
    >
      <div className="relative aspect-[16/7] w-full bg-[var(--surface-3)]">
        {c.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a public S3 URL
          <img src={c.heroImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[28px] font-semibold text-[var(--text-3)]">
            {c.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        {grip ? (
          <span className="absolute left-2 top-2 rounded-[6px] bg-[rgba(0,0,0,0.45)] p-1 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            <GripVertical className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
        {menu ? <div className="absolute right-2 top-2">{menu}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--text-1)]">{c.name}</p>
          {archived ? (
            <Badge tone="neutral">Deleted {formatDate(c.archivedAt)}</Badge>
          ) : c.isPublic ? (
            <Badge tone="accent">Public</Badge>
          ) : (
            <Tooltip content="Not on your page yet. Edit it and turn on Show on my page.">
              <span>
                <Badge tone="neutral">Draft</Badge>
              </span>
            </Tooltip>
          )}
        </div>
        {c.description ? (
          <p className="line-clamp-2 text-[12px] text-[var(--text-3)]">{c.description}</p>
        ) : null}
        <p className="mt-auto text-[11.5px] text-[var(--text-3)]">
          {formatNumber(c.counts.activeDrops)} on sale
          {c.counts.liveDrops > c.counts.activeDrops
            ? ` · ${formatNumber(c.counts.liveDrops - c.counts.activeDrops)} being prepared`
            : ""}
        </p>
        {footer ? <div className="pt-1">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Used by the detail page's back link. */
export function BackToCollections() {
  return (
    <Link href="/artist/collections" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-1)]">
      ← My collections
    </Link>
  );
}
