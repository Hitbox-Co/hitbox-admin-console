"use client";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Tooltip } from "@/components/ui/primitives";
import type { CurrencyMap } from "@/lib/types";

/** Shared by the Artists directory and an artist's page. */

export function ArtistAvatar({
  artist,
  size = 36,
}: {
  artist: { name: string; avatarUrl: string | null };
  size?: number;
}) {
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

export function ArtistStatusChips({
  artist,
}: {
  artist: { archivedAt: string | null; isActive: boolean; isPublic: boolean };
}) {
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
        <Tooltip content="Deactivated — can't sell, and can't change their own profile or collections.">
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

/**
 * Money per currency, one line each — never added together, there is no
 * exchange rate in the system. Zero amounts are left out unless all are zero.
 */
export function MoneyMap({
  value,
  className,
  stacked,
}: {
  value: CurrencyMap | undefined;
  className?: string;
  stacked?: boolean;
}) {
  const entries = Object.entries(value ?? {});
  const nonZero = entries.filter(([, v]) => Number(v) !== 0);
  const shown = nonZero.length ? nonZero : entries.slice(0, 1);
  if (shown.length === 0) return <span className={className}>—</span>;
  return (
    <span className={cn(stacked ? "flex flex-col" : "block truncate", className)}>
      {stacked
        ? shown.map(([cur, v]) => (
            <span key={cur} className="tnum">
              {formatCurrency(v, cur)}
            </span>
          ))
        : shown.map(([cur, v]) => formatCurrency(v, cur)).join(" · ")}
    </span>
  );
}
