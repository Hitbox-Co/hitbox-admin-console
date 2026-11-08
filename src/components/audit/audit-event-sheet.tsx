"use client";

import * as React from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Filter, Link2, X } from "lucide-react";
import { useAuditCorrelation } from "@/lib/api/hooks";
import { formatDateTime, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/components/layout/authz-provider";
import { Button, Mono, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import {
  JsonBlock,
  ResultBadge,
  SeverityBadge,
  StateDiff,
  diffStates,
  eventLabel,
  resourceHref,
} from "./audit-bits";
import type { AuditEventTypeRow, AuditTrailEvent, AuditTrailQuery } from "@/lib/types";

/**
 * One audit event in full: who, what, the before/after diff, metadata, the
 * request it belonged to (correlationId) and where it came from.
 */
export function AuditEventSheet({
  event: e,
  catalog,
  onClose,
  onFilter,
  onOpenEvent,
}: {
  event: AuditTrailEvent;
  catalog: Map<string, AuditEventTypeRow>;
  onClose: () => void;
  /** Narrow the trail to this event's actor / resource / request. */
  onFilter: (patch: AuditTrailQuery) => void;
  onOpenEvent: (e: AuditTrailEvent) => void;
}) {
  const perms = usePermissions();
  const def = catalog.get(e.eventType);
  const { area, action } = eventLabel(e.eventType);
  const changes = diffStates(e.beforeState, e.afterState);
  const href = resourceHref(e.resourceType, e.resourceId, perms);
  const hasMeta = e.metadata && Object.keys(e.metadata).length > 0;
  const skewMs = e.insertedAt ? new Date(e.insertedAt).getTime() - new Date(e.occurredAt).getTime() : 0;

  const filterAndClose = (patch: AuditTrailQuery) => {
    onFilter(patch);
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.4)]" />
        <Dialog.Content className="rx-content fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[11.5px] text-[var(--text-3)]">{area}</p>
              <Dialog.Title className="text-[15px] font-semibold capitalize tracking-[-0.01em] text-[var(--text-1)]">
                {action}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                {def?.description ?? e.eventType}
              </Dialog.Description>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <SeverityBadge severity={e.severity} />
                <ResultBadge result={e.actionResult} />
                <Mono className="text-[10.5px]">{e.eventType}</Mono>
              </div>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[12px]">
              <dt className="text-[var(--text-3)]">When</dt>
              <dd className="tnum text-[var(--text-1)]">
                {formatDateTime(e.occurredAt)}
                {Math.abs(skewMs) > 5_000 ? (
                  <span className="ml-1.5 text-[11px] text-[var(--warning)]">
                    written {Math.round(skewMs / 1000)}s later
                  </span>
                ) : null}
              </dd>

              <dt className="text-[var(--text-3)]">Who</dt>
              <dd className="space-y-0.5 text-[var(--text-1)]">
                <p>
                  {humanize(e.actorType)}
                  {e.actorRoleSnapshot ? (
                    <span className="text-[var(--text-3)]"> · held {humanize(e.actorRoleSnapshot)} at the time</span>
                  ) : null}
                </p>
                {e.actorId ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <Mono className="text-[10.5px]">{e.actorId}</Mono>
                    <FilterLink onClick={() => filterAndClose({ actorId: e.actorId ?? undefined })}>Everything they did</FilterLink>
                  </p>
                ) : null}
              </dd>

              <dt className="text-[var(--text-3)]">On</dt>
              <dd className="space-y-0.5 text-[var(--text-1)]">
                {e.resourceType ? (
                  <>
                    <p>{humanize(e.resourceType)}</p>
                    {e.resourceId ? (
                      <p className="flex flex-wrap items-center gap-2">
                        <Mono className="text-[10.5px]">{e.resourceId}</Mono>
                        {href ? (
                          <Link href={href} className="inline-flex items-center gap-0.5 text-[11.5px] text-[var(--accent-text)] hover:underline">
                            Open <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        ) : null}
                        <FilterLink
                          onClick={() =>
                            filterAndClose({ resourceType: e.resourceType ?? undefined, resourceId: e.resourceId ?? undefined })
                          }
                        >
                          Its full history
                        </FilterLink>
                      </p>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </dd>

              {e.organizationId ? (
                <>
                  <dt className="text-[var(--text-3)]">Organization</dt>
                  <dd>
                    <Mono className="text-[10.5px]">{e.organizationId}</Mono>
                  </dd>
                </>
              ) : null}
              {e.ipAddress || e.userAgent ? (
                <>
                  <dt className="text-[var(--text-3)]">From</dt>
                  <dd className="break-all text-[11.5px] text-[var(--text-2)]">
                    {[e.ipAddress, e.userAgent].filter(Boolean).join(" · ")}
                  </dd>
                </>
              ) : null}
              {e.ledgerReferenceId ? (
                <>
                  <dt className="text-[var(--text-3)]">Ledger entry</dt>
                  <dd>
                    <Mono className="text-[10.5px]">{e.ledgerReferenceId}</Mono>
                  </dd>
                </>
              ) : null}
              {e.publicCode ? (
                <>
                  <dt className="text-[var(--text-3)]">Record</dt>
                  <dd>
                    <Mono className="text-[10.5px]">{e.publicCode}</Mono>
                  </dd>
                </>
              ) : null}
            </dl>

            <section>
              <h4 className="mb-1.5 text-[12px] font-semibold text-[var(--text-1)]">What changed</h4>
              {changes.length ? (
                <StateDiff changes={changes} />
              ) : (
                <p className="text-[12px] text-[var(--text-3)]">
                  {e.actionResult === "DENIED" ? "Nothing — the action was refused." : "No before/after snapshot was recorded."}
                </p>
              )}
            </section>

            {hasMeta ? (
              <section>
                <h4 className="mb-1.5 text-[12px] font-semibold text-[var(--text-1)]">Details</h4>
                <JsonBlock value={e.metadata} />
              </section>
            ) : null}

            <section>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-1)]">
                  <Link2 className="h-3.5 w-3.5 text-[var(--text-3)]" /> Same request
                </h4>
                <FilterLink onClick={() => filterAndClose({ correlationId: e.correlationId })}>Show in the trail</FilterLink>
              </div>
              <Correlation event={e} onOpenEvent={onOpenEvent} />
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FilterLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-3)] hover:text-[var(--text-1)]"
    >
      <Filter className="h-3 w-3" />
      {children}
    </button>
  );
}

/** Every event written by the same request, in order — the rest of the story. */
function Correlation({ event, onOpenEvent }: { event: AuditTrailEvent; onOpenEvent: (e: AuditTrailEvent) => void }) {
  const q = useAuditCorrelation(event.correlationId);
  if (q.isLoading) return <Skeleton className="h-16 w-full rounded-[8px]" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  if (rows.length <= 1) {
    return <p className="text-[12px] text-[var(--text-3)]">This was the only event in its request.</p>;
  }
  return (
    <ol className="space-y-1">
      {rows.map((r) => {
        const self = r.eventId === event.eventId;
        return (
          <li key={r.eventId}>
            <button
              type="button"
              disabled={self}
              onClick={() => onOpenEvent(r)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] transition-colors",
                self ? "bg-[var(--accent-dim)] text-[var(--text-1)]" : "text-[var(--text-2)] hover:bg-[var(--surface-2)]"
              )}
            >
              <span className="tnum w-[70px] shrink-0 text-[11px] text-[var(--text-3)]">
                {new Date(r.occurredAt).toLocaleTimeString()}
              </span>
              <Mono className="min-w-0 flex-1 truncate text-[11px]">{r.eventType}</Mono>
              <ResultBadge result={r.actionResult} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
