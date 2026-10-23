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
  Package,
  Pencil,
  Trash2,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useArchiveCollection,
  useMyCollection,
  useRemoveCollectionHero,
  useUpdateCollection,
  useUploadCollectionHero,
} from "@/lib/api/hooks";
import { ARTIST_IMAGE_MAX_BYTES, ARTIST_IMAGE_TYPES, prepareImage } from "@/lib/image-prep";
import { formatDate, formatNumber } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { Badge, Button, Mono, Panel, PanelHeader, Skeleton, Tooltip } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/packing/packing-ui";
import { CollectionFormDialog, useRestoreFlow } from "./collection-dialogs";
import { BackToCollections, blockedDeleteCopy, useCollectionsLocked } from "./my-collections";
import type { ArtistCollectionDetail } from "@/lib/types";

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
  const preparing = c.counts.liveDrops - c.counts.activeDrops;

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

      <Panel className="overflow-hidden">
        <PanelHeader
          title="Drops"
          description={`${formatNumber(c.counts.activeDrops)} on sale`}
        />
        {preparing > 0 ? (
          <p className="flex items-start gap-2 border-b border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-2.5 text-[12px] text-[var(--text-2)]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
            {preparing} more drop{preparing === 1 ? " is" : "s are"} being prepared — drafts or in review. They appear here once on sale
            {c.actions?.archiveBlockedReason === "HAS_DROPS" ? ", and they're why this collection can't be deleted yet" : ""}.
          </p>
        ) : null}
        {c.drops.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nothing on sale here yet"
            description="Your brand team or HitBox files drops into collections. They show up once they're on sale."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-px bg-[var(--hairline)] sm:grid-cols-2 xl:grid-cols-3">
            {c.drops.map((d) => (
              <li key={d.id} className="bg-[var(--surface-1)] px-4 py-3">
                <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{d.name}</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--text-3)]">
                  <Mono className="text-[10.5px]">{d.groupCode}</Mono> · {formatNumber(d.totalSupply)} made
                </p>
                <p className="mt-1 text-[11.5px] text-[var(--text-3)]">
                  On sale {formatDate(d.releaseStart ?? d.publishedAt)}
                  {d.releaseEnd ? ` – ${formatDate(d.releaseEnd)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
