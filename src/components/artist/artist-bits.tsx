"use client";

import { Badge, Tooltip } from "@/components/ui/primitives";
import type { AdminArtist } from "@/lib/types";

/** Shared by the Artists directory and an artist's page. */

export function ArtistAvatar({ artist, size = 36 }: { artist: Pick<AdminArtist, "name" | "avatarUrl">; size?: number }) {
  return artist.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- a public S3 URL
    <img
      src={artist.avatarUrl}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover ring-1 ring-[var(--hairline)]"
    />
  ) : (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[#c86dd7] font-semibold text-white"
    >
      {artist.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ArtistStatusChips({ artist }: { artist: AdminArtist }) {
  if (artist.archivedAt) {
    return (
      <Badge tone="neutral" dot>
        Archived
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {artist.isActive ? (
        <Badge tone="positive" dot>
          Active
        </Badge>
      ) : (
        <Tooltip content="Deactivated — the artist can't change their profile or collections.">
          <span>
            <Badge tone="warning" dot>
              Inactive
            </Badge>
          </span>
        </Tooltip>
      )}
      <Badge tone={artist.isPublic ? "accent" : "neutral"}>{artist.isPublic ? "Public" : "Unlisted"}</Badge>
    </div>
  );
}
