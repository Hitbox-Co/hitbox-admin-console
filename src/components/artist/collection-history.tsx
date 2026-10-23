"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, History } from "lucide-react";
import { useAuditTrail } from "@/lib/api/hooks";
import { formatDateTime, humanize, shortId } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Mono, Skeleton, Tooltip } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { StateDiff, diffStates } from "@/components/audit/audit-bits";
import type { AuditTrailEvent } from "@/lib/types";

/**
 * A collection's change history, straight from the audit log
 * (GET /admin/audit/events?resourceType=ArtistCollection&resourceId=…).
 * Each artist change is one `artist.collection.*` event with before/after
 * snapshots; the diff shows only the fields that moved.
 */

const EVENT_LABEL: Record<string, string> = {
  "artist.collection.create": "Created",
  "artist.collection.update": "Edited",
  "artist.collection.archive": "Deleted",
  "artist.collection.restore": "Restored",
  "artist.collection.reorder": "Reordered",
};

const EVENT_TONE: Record<string, "positive" | "danger" | "accent" | "neutral"> = {
  "artist.collection.create": "positive",
  "artist.collection.archive": "danger",
  "artist.collection.restore": "accent",
};

/** Bookkeeping fields every snapshot carries — noise in a diff. */
const IGNORED = new Set(["updatedAt", "createdAt", "id", "artistId", "organizationId", "publicCode"]);

export function CollectionHistory({ collectionId }: { collectionId: string }) {
  const trail = useAuditTrail({ resourceType: "ArtistCollection", resourceId: collectionId });
  const events = trail.data?.pages.flatMap((p) => p.data ?? []) ?? [];

  if (trail.isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-[8px]" />
        ))}
      </div>
    );
  }
  if (trail.isError) return <ErrorState error={trail.error} onRetry={() => trail.refetch()} />;
  if (events.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No recorded changes"
        description="Changes made before the audit trail was switched on aren't listed."
      />
    );
  }

  return (
    <div>
      <ol className="divide-y divide-[var(--hairline)]">
        {events.map((e) => (
          <HistoryRow key={e.eventId} event={e} />
        ))}
      </ol>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] px-4 py-2">
        <Link
          href={`/activity?resourceType=ArtistCollection&resourceId=${collectionId}`}
          className="text-[11.5px] text-[var(--text-3)] hover:text-[var(--text-1)]"
        >
          Open in the audit log →
        </Link>
      </div>
      {trail.hasNextPage ? (
        <div className="border-t border-[var(--hairline)] px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => trail.fetchNextPage()} disabled={trail.isFetchingNextPage}>
            {trail.isFetchingNextPage ? "Loading…" : "Load older changes"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function HistoryRow({ event: e }: { event: AuditTrailEvent }) {
  const [open, setOpen] = React.useState(false);
  const changes = diffStates(e.beforeState, e.afterState, IGNORED);
  const label = EVENT_LABEL[e.eventType] ?? humanize(e.eventType.split(".").pop() ?? e.eventType);

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={EVENT_TONE[e.eventType] ?? "neutral"} dot>
          {label}
        </Badge>
        {e.actionResult !== "SUCCESS" ? <Badge tone="danger">{humanize(e.actionResult)}</Badge> : null}
        <span className="text-[12px] text-[var(--text-2)]">
          by {humanize(e.actorType ?? "unknown").toLowerCase()}
          {e.actorRoleSnapshot ? ` (${humanize(e.actorRoleSnapshot)})` : ""}
        </span>
        {e.actorId ? (
          <Tooltip content={e.actorId}>
            <span>
              <Mono className="text-[10.5px]">{shortId(e.actorId)}</Mono>
            </span>
          </Tooltip>
        ) : null}
        <span className="tnum ml-auto text-[11.5px] text-[var(--text-3)]">{formatDateTime(e.occurredAt)}</span>
      </div>

      {changes.length ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-1 flex items-center gap-1 text-[11.5px] text-[var(--text-3)] hover:text-[var(--text-1)]"
            aria-expanded={open}
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            {changes.length === 1 ? `Changed ${humanize(changes[0].key).toLowerCase()}` : `${changes.length} fields changed`}
          </button>
          {open ? (
            <div className="mt-1.5">
              <StateDiff changes={changes} />
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
