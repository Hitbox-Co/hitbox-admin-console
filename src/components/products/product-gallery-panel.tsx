"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ImageOff,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAttachProductImages,
  useProductImages,
  useRemoveProductImage,
  useReplaceProductImages,
  useUpdateProductImage,
  useUploadAsset,
} from "@/lib/api/hooks";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Mono, Panel, Skeleton, Tooltip } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { ProductImage } from "@/lib/types";

/**
 * The drop's image gallery.
 *
 * Three rules from product-upload-api.md §3 shape this component, and all
 * three are reasons NOT to update the list optimistically:
 *
 *  1. Positions are normalised to contiguous 0-first on every write.
 *  2. Exactly one image is primary — promoting one demotes the other, and
 *     deleting the primary promotes the next automatically.
 *  3. Every mutation therefore returns the WHOLE gallery.
 *
 * So each mutation writes the response straight into the cache and the list
 * re-renders from it. Splicing locally would drift from the server the first
 * time a cascade fired.
 *
 * Reordering calls PUT (replace), not N× PATCH: after a move the client knows
 * the final order, not the sequence of moves that produced it.
 */

/** The only asset type a product gallery accepts. */
const GALLERY_ASSET_TYPE = "DROP_IMAGE" as const;
const MAX_IMAGES = 24;

export function ProductGalleryPanel({ productId }: { productId: string }) {
  const perms = usePermissions();
  const query = useProductImages(productId);
  const attach = useAttachProductImages(productId);
  const replace = useReplaceProductImages(productId);
  const update = useUpdateProductImage(productId);
  const remove = useRemoveProductImage(productId);
  const upload = useUploadAsset();

  const fileRef = React.useRef<HTMLInputElement>(null);
  const images = query.data ?? [];

  // Gallery writes need drop:manage platform-wide (admin-write-apis.md §0).
  const canWrite = perms.widestScope("drop") === "global" && perms.can("drop", "manage");
  const busy = attach.isPending || replace.isPending || update.isPending || remove.isPending;

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.friendly : "Could not update the gallery.");

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same file be picked again after a failure
    if (!files.length) return;

    if (images.length + files.length > MAX_IMAGES) {
      toast.error(`A gallery holds at most ${MAX_IMAGES} images.`);
      return;
    }

    try {
      // Presign + PUT each file, then attach them all in ONE call so the
      // position normalisation runs once rather than per file.
      const uploaded = [];
      for (const file of files) {
        const asset = await upload.mutateAsync({
          file,
          assetType: GALLERY_ASSET_TYPE,
          ownerType: "product",
          ownerId: productId,
        });
        uploaded.push({ assetId: asset.assetId, altText: file.name });
      }
      await attach.mutateAsync(uploaded);
      toast.success(
        uploaded.length === 1 ? "Image added" : `${uploaded.length} images added`
      );
    } catch (err) {
      onError(err);
    }
  };

  /** Reorder by rewriting the final order — see the note above. */
  const move = (index: number, delta: number) => {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    replace.mutate(
      next.map((img, i) => ({
        assetId: img.assetId,
        position: i,
        isPrimary: img.isPrimary,
        altText: img.altText,
      })),
      { onError }
    );
  };

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
          Gallery{images.length ? ` (${images.length})` : ""}
        </p>
        {canWrite ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              hidden
              onChange={onPick}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={upload.isPending || attach.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload images
            </Button>
          </>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-[8px]" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : images.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title="No images yet"
          description={
            canWrite
              ? "Upload artwork — the first one becomes the cover automatically."
              : "This drop has no artwork attached."
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {images.map((img, i) => (
            <GalleryRow
              key={img.imageId}
              image={img}
              canWrite={canWrite}
              busy={busy}
              isFirst={i === 0}
              isLast={i === images.length - 1}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
              onMakePrimary={() =>
                update.mutate({ imageId: img.imageId, isPrimary: true }, { onError })
              }
              onRemove={() =>
                remove.mutate(img.imageId, {
                  onSuccess: () => toast.success("Image removed"),
                  onError,
                })
              }
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function GalleryRow({
  image,
  canWrite,
  busy,
  isFirst,
  isLast,
  onUp,
  onDown,
  onMakePrimary,
  onRemove,
}: {
  image: ProductImage;
  canWrite: boolean;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="tnum w-5 shrink-0 text-[11px] text-[var(--text-3)]">
        {image.position}
      </span>

      {/*
        `url` is null when no bucket is configured on this deploy. That is a
        configuration fact, not a broken image — say so rather than showing a
        torn-image icon the operator will read as data loss.
      */}
      {image.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.url}
          alt={image.altText ?? ""}
          className="h-11 w-11 shrink-0 rounded-[6px] border border-[var(--hairline)] object-cover"
        />
      ) : (
        <Tooltip content="No storage bucket is configured on this deployment, so the URL is null. The asset itself is fine.">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-dashed border-[var(--hairline-strong)] text-[var(--text-3)]">
            <ImageOff className="h-4 w-4" aria-hidden />
          </span>
        </Tooltip>
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[12.5px] text-[var(--text-1)]">
          {image.altText || "Untitled"}
          {image.isPrimary ? <Badge tone="accent">Cover</Badge> : null}
        </p>
        <Mono className="mt-0.5 text-[10px]">{image.storageRef}</Mono>
      </div>

      {canWrite ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip content="Move up">
            <span>
              <Button variant="ghost" size="sm" disabled={isFirst || busy} onClick={onUp}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Move down">
            <span>
              <Button variant="ghost" size="sm" disabled={isLast || busy} onClick={onDown}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            content={
              image.isPrimary
                ? "Already the cover. Promote another image to move it."
                : "Make this the cover — the current one is demoted automatically."
            }
          >
            <span>
              <Button
                variant="ghost"
                size="sm"
                disabled={image.isPrimary || busy}
                onClick={onMakePrimary}
              >
                <Star className="h-3.5 w-3.5" />
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Remove from this drop. The media asset itself is kept.">
            <span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </span>
          </Tooltip>
        </div>
      ) : null}
    </li>
  );
}
