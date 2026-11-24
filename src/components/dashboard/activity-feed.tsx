"use client";

import * as React from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { formatRelative, humanize } from "@/lib/format";
import { humanizeRoleName as roleLabel } from "@/lib/authz";
import { Badge, Mono, Tooltip, toneForStatus } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import type { ActivityEvent } from "@/lib/types";

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No audit events in this window" />;
  }

  return (
    <ul className="divide-y divide-[var(--hairline)]">
      {events.map((e) => (
        <li
          key={e.eventId}
          className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
        >
          <span className="mt-[3px] shrink-0">
            {e.actionResult === "SUCCESS" ? (
              <CircleCheck className="h-3.5 w-3.5 text-[var(--positive)]" aria-hidden />
            ) : (
              <CircleX className="h-3.5 w-3.5 text-[var(--danger)]" aria-hidden />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] text-[var(--text-1)]">
                {humanize(e.type.split(".").slice(-1)[0])}
              </span>
              <Mono className="text-[10px]">{e.type}</Mono>
              {e.severity !== "INFO" ? (
                <Badge tone={toneForStatus(e.severity)} className="px-1 py-0 text-[10px]">
                  {humanize(e.severity)}
                </Badge>
              ) : null}
            </div>

            <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
              {/*
                The role the actor held at the time, not their current roles —
                a since-revoked Finance Admin's past approval must still read
                as a Finance Admin action.
              */}
              <Tooltip
                content={
                  e.actorRoleSnapshot
                    ? "The role this actor held when the event occurred, not the roles they hold now."
                    : "This event carries no role snapshot — typically a system-raised event rather than an operator action."
                }
              >
                <span className="cursor-help text-[var(--text-2)]">
                  {roleLabel(e.actorRoleSnapshot)}
                </span>
              </Tooltip>
              {" · "}
              <span className="font-mono">{e.actorId}</span>
              {" · "}
              {e.resourceType} <span className="font-mono">{e.resourceId}</span>
            </p>
          </div>

          <time
            dateTime={e.occurredAt}
            title={new Date(e.occurredAt).toLocaleString()}
            className="tnum shrink-0 text-[11px] text-[var(--text-3)]"
          >
            {formatRelative(e.occurredAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
