"use client";

import { Badge, Tooltip } from "@/components/ui/primitives";
import type { AdminArtistCollection } from "@/lib/types";

/** Small pieces shared by the artist's collection screens and the admin monitor. */

export function HeroThumb({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- a public S3 URL
    <img
      src={url}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[8px] object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-3)] text-[13px] font-semibold text-[var(--text-2)]"
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ArtistFlags({ artist }: { artist: AdminArtistCollection["artist"] }) {
  if (artist.archived) {
    return (
      <Tooltip content="The artist is archived — they can no longer change this collection.">
        <span>
          <Badge tone="danger">Artist archived</Badge>
        </span>
      </Tooltip>
    );
  }
  if (!artist.isActive) {
    return (
      <Tooltip content="The artist is deactivated — they can no longer change this collection.">
        <span>
          <Badge tone="warning">Artist inactive</Badge>
        </span>
      </Tooltip>
    );
  }
  return null;
}

export function StatusChips({ row }: { row: { status: string; isPublic: boolean } }) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.status === "ARCHIVED" ? (
        <Badge tone="neutral" dot>
          Archived
        </Badge>
      ) : (
        <>
          <Badge tone="positive" dot>
            Live
          </Badge>
          <Badge tone={row.isPublic ? "accent" : "neutral"}>{row.isPublic ? "Public" : "Draft"}</Badge>
        </>
      )}
    </div>
  );
}
