"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import {
  ArchiveRestore,
  Eye,
  EyeOff,
  ImagePlus,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  X,
  Trash2,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useArchiveCollection,
  useMyCollection,
  useRemoveCollectionDrop,
  useRemoveCollectionHero,
  useUpdateCollection,
  useUploadCollectionHero,
} from "@/lib/api/hooks";
import { ARTIST_IMAGE_MAX_BYTES, ARTIST_IMAGE_TYPES, prepareImage } from "@/lib/image-prep";
import { formatDate, formatNumber } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { Badge, Button, Mono, Panel, Skeleton, Tooltip } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/packing/packing-ui";
import { CollectionFormDialog, useRestoreFlow } from "./collection-dialogs";
import { AddDropsDialog } from "./add-drops-dialog";
import { DropMonogram } from "./drop-tile";
import { BackToCollections, blockedDeleteCopy, useCollectionsLocked } from "./my-collections";
import type { ArtistCollectionDetail, ArtistCollectionDrop } from "@/lib/types";

const HERO_TARGET = { width: 1920, height: 840 };

export function MyCollectionDetailView({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const query = useMyCollection(collectionId);
  const c = query.data;
  const profileLocked = useCollectionsLocked();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const archive = useArchiveCollection();
  const update = useUpdateCollection(collectionId);
  const restoreFlow = useRestoreFlow();

  usePageChrome({
    title: c?.name ?? "Collection",
    description: c ? (c.status === "ARCHIVED" ? "Deleted — restore it to change it." : c.isPublic ? "On your page" : "Draft — only you can see it") : undefined,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <BackToCollections />
        <Skeleton className="aspect-[16/5] w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
  if (query.isError || !c) {
    return (
      <div className="space-y-4">
        <BackToCollections />
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      </div>
    );
  }

  const archived = c.status === "ARCHIVED";
  const canEdit = !profileLocked && (c.actions?.canEdit ?? !archived);
  const blocked = blockedDeleteCopy(c);

  const togglePublic = () =>
    update.mutate(
      { isPublic: !c.isPublic },
      {
        onSuccess: (r) => toast.success(r.isPublic ? "Now on your page" : "Hidden from your page — it's a draft again"),
        onError: (err) => toast.error(err instanceof ApiError ? err.friendly : "Could not change visibility."),
      }
    );

  return (
    <div className="space-y-4">
      <BackToCollections />

      {archived ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-4 py-3">
          <p className="flex-1 text-[12.5px] text-[var(--text-2)]">
            You deleted this collection on {formatDate(c.archivedAt)}. It&rsquo;s read-only until you restore it — it comes back as a draft.
          </p>
          {c.actions?.canRestore && !profileLocked ? (
            <Button variant="primary" size="sm" loading={restoreFlow.busy} onClick={() => restoreFlow.restore(c)}>
              <ArchiveRestore className="h-3.5 w-3.5" /> Restore
            </Button>
          ) : null}
        </div>
      ) : null}

      <Panel className="overflow-hidden">
        <Hero c={c} editable={canEdit} />
        <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">{c.name}</h2>
              {archived ? (
                <Badge tone="neutral">Deleted</Badge>
              ) : c.isPublic ? (
                <Badge tone="accent">Public</Badge>
              ) : (
                <Badge tone="neutral">Draft</Badge>
              )}
            </div>
            <Mono className="mt-0.5 text-[11px]">{c.slug}</Mono>
            {c.description ? (
              <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[12.5px] text-[var(--text-2)]">{c.description}</p>
            ) : canEdit ? (
              <button type="button" onClick={() => setEditing(true)} className="mt-2 text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)]">
                + Add a description
              </button>
            ) : null}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant={c.isPublic ? "secondary" : "primary"} size="sm" loading={update.isPending} onClick={togglePublic}>
                {c.isPublic ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {c.isPublic ? "Hide from my page" : "Show on my page"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Tooltip content={blocked ?? "Remove it from your page. You can restore it later."}>
                <span>
                  <Button variant="danger" size="sm" disabled={Boolean(blocked)} onClick={() => setDeleting(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </span>
              </Tooltip>
            </div>
          ) : null}
        </div>
      </Panel>

      <DropsSection c={c} editable={canEdit} />

      {editing ? <CollectionFormDialog collection={c} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={deleting}
        title={`Delete ${c.name}?`}
        body="This removes the collection from your page. You can restore it later from Archived."
        confirmLabel="Delete"
        busy={archive.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() =>
          archive.mutate(c.id, {
            onSuccess: () => {
              toast.success(`${c.name} deleted — restore it any time from Archived`);
              setDeleting(false);
              router.push("/artist/collections");
            },
            onError: (err) => {
              toast.error(err instanceof ApiError ? err.friendly : "Could not delete the collection.");
              setDeleting(false);
            },
          })
        }
      />
      {restoreFlow.dialog}
    </div>
  );
}

/** The hero banner, with a hover ⋯ menu to upload or remove the image. */
function Hero({ c, editable }: { c: ArtistCollectionDetail; editable: boolean }) {
  const upload = useUploadCollectionHero(c.id);
  const remove = useRemoveCollectionHero(c.id);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = React.useState(false);
  const busy = preparing || upload.isPending || remove.isPending;

  const onFile = async (original: File | undefined) => {
    if (!original) return;
    if (!ARTIST_IMAGE_TYPES.includes(original.type)) {
      toast.error("Use a JPEG, PNG, WebP or GIF image.");
      return;
    }
    setPreparing(true);
    let file: File;
    try {
      file = await prepareImage(original, HERO_TARGET);
    } catch {
      file = original;
    } finally {
      setPreparing(false);
    }
    if (file.size > ARTIST_IMAGE_MAX_BYTES) {
      toast.error("That image is over 15 MB.");
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success("Hero image updated"),
      onError: (err) => toast.error(err instanceof ApiError ? err.friendly : "Upload failed."),
    });
  };

  const item =
    "flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12.5px] text-[var(--text-1)] outline-none data-[highlighted]:bg-[var(--surface-2)]";

  return (
    <div className="group relative aspect-[16/5] w-full bg-[var(--surface-3)]">
      {c.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a public S3 URL
        <img src={c.heroImageUrl} alt="" className="h-full w-full object-cover" />
      ) : editable ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-1)]"
        >
          <ImagePlus className="h-6 w-6" />
          Add a hero image
        </button>
      ) : null}

      {busy ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.4)]">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
      ) : null}

      {editable && c.heroImageUrl ? (
        <div className="absolute right-3 top-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="Hero image options"
                className="rounded-[6px] bg-[rgba(0,0,0,0.5)] p-1.5 text-white backdrop-blur hover:bg-[rgba(0,0,0,0.7)]"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-[70] min-w-[170px] rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] p-1 shadow-[var(--shadow-3)]"
              >
                <DropdownMenu.Item className={item} onSelect={() => inputRef.current?.click()}>
                  <ImagePlus className="h-3.5 w-3.5" /> Replace image
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={`${item} text-[var(--danger)]`}
                  onSelect={() =>
                    remove.mutate(undefined, {
                      onSuccess: () => toast.success("Hero image removed"),
                      onError: (err) => toast.error(err instanceof ApiError ? err.friendly : "Could not remove it."),
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove image
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ARTIST_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drops in this collection — routes 3, 10–12                          */
/* ------------------------------------------------------------------ */

function DropsSection({ c, editable }: { c: ArtistCollectionDetail; editable: boolean }) {
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<ArtistCollectionDrop | null>(null);
  const remove = useRemoveCollectionDrop(c.id);
  const preparing = c.counts.liveDrops - c.counts.activeDrops;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">Drops</h3>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-3)]">
            <span className="tnum font-medium text-[var(--text-2)]">{formatNumber(c.counts.activeDrops)}</span> on sale
            {preparing > 0 ? (
              <>
                {" · "}
                <span className="tnum">{formatNumber(preparing)}</span> being prepared
              </>
            ) : null}
          </p>
        </div>
        {editable ? (
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add drops
          </Button>
        ) : null}
      </div>

      {preparing > 0 ? (
        <p className="flex items-start gap-2 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[12px] text-[var(--text-2)]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
          <span>
            {preparing} more drop{preparing === 1 ? " is" : "s are"} being prepared (drafts or in review). They show here
            once on sale
            {c.actions?.archiveBlockedReason === "HAS_DROPS"
              ? " — your brand team or HitBox can move them if you want to delete this collection"
              : ""}
            .
          </span>
        </p>
      ) : null}

      {c.drops.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--hairline-strong)] px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)]">
            <Sparkles className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[14px] font-medium text-[var(--text-1)]">No drops in this collection yet</p>
          <p className="mt-1 max-w-[42ch] text-[12.5px] text-[var(--text-3)]">
            Pick from your drops that are on sale. You can move one here from another collection too.
          </p>
          {editable ? (
            <Button variant="primary" size="sm" className="mt-4" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add drops
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {c.drops.map((d) => (
            <DropCard key={d.id} d={d} onRemove={editable ? () => setRemoving(d) : undefined} />
          ))}
          {editable ? (
            <li>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-1.5 rounded-[16px] border border-dashed border-[var(--hairline-strong)] text-[12.5px] text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
              >
                <Plus className="h-5 w-5" />
                Add more
              </button>
            </li>
          ) : null}
        </ul>
      )}

      {adding ? <AddDropsDialog collectionId={c.id} collectionName={c.name} onClose={() => setAdding(false)} /> : null}
      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.name ?? "drop"}?`}
        body="It stays on sale — it just leaves this collection. You can add it back any time."
        confirmLabel="Remove"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.id, {
            onSuccess: () => {
              toast.success(`${removing.name} removed from ${c.name}`);
              setRemoving(null);
            },
            onError: (err) => {
              toast.error(err instanceof ApiError ? err.friendly : "Could not remove the drop.");
              setRemoving(null);
            },
          });
        }}
      />
    </section>
  );
}

function DropCard({ d, onRemove }: { d: ArtistCollectionDrop; onRemove?: () => void }) {
  const start = d.releaseStart ?? d.publishedAt;
  return (
    <li className="group relative overflow-hidden rounded-[16px] border border-[var(--hairline)] bg-[var(--surface-1)] transition-all hover:-translate-y-0.5 hover:border-[var(--hairline-strong)] hover:shadow-[var(--shadow-2)]">
      <DropMonogram id={d.id} name={d.name} className="h-20 w-full text-[22px]" />
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="truncate text-[13.5px] font-medium text-[var(--text-1)]" title={d.name}>
          {d.name}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--text-3)]">
          <Mono className="text-[10.5px]">{d.groupCode}</Mono>
          <span className="tnum">{formatNumber(d.totalSupply)} made</span>
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--positive-dim)] px-2 py-0.5 text-[11px] text-[var(--positive)]">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          On sale{start ? ` since ${formatDate(start)}` : ""}
          {d.releaseEnd ? ` · ends ${formatDate(d.releaseEnd)}` : ""}
        </p>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${d.name} from this collection`}
          className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[rgba(0,0,0,0.45)] px-2 py-1 text-[11px] text-white opacity-0 backdrop-blur transition-opacity hover:bg-[rgba(0,0,0,0.7)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <X className="h-3 w-3" /> Remove
        </button>
      ) : null}
    </li>
  );
}
