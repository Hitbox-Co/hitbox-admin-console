"use client";

import * as React from "react";
import { ScrollText, X } from "lucide-react";
import { useAuditTrail } from "@/lib/api/hooks";
import { formatDateTime, formatRelative, humanize, shortId } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Input, Mono, Panel, Tooltip } from "@/components/ui/primitives";
import { FilterRow, FilterSelect } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { AuditEventSheet } from "./audit-event-sheet";
import { RESULTS, ResultBadge, SEVERITIES, SeverityBadge, eventLabel } from "./audit-bits";
import type { AuditEventTypeRow, AuditTrailEvent, AuditTrailQuery } from "@/lib/types";

/**
 * The trail — GET /admin/audit/events, newest first, keyset-paged (there is
 * no total by design, so it is "Load older" rather than page numbers).
 * Filters live in the URL so a filtered view can be linked to.
 */

export type TrailFilters = Pick<
  AuditTrailQuery,
  "eventType" | "actorId" | "resourceType" | "resourceId" | "actionResult" | "severity" | "correlationId" | "from" | "to"
>;

export const TRAIL_KEYS: (keyof TrailFilters)[] = [
  "eventType",
  "actorId",
  "resourceType",
  "resourceId",
  "actionResult",
  "severity",
  "correlationId",
  "from",
  "to",
];

/** `to` is exclusive server-side; the date picker means "through that day". */
function toQuery(f: TrailFilters): AuditTrailQuery {
  const q: AuditTrailQuery = { ...f };
  if (f.to) {
    const d = new Date(f.to);
    d.setDate(d.getDate() + 1);
    q.to = d.toISOString().slice(0, 10);
  }
  // resourceId alone is refused (it can't use the index) — send the pair or neither.
  if (q.resourceId && !q.resourceType) delete q.resourceId;
  return q;
}

const QUICK: { label: string; patch: TrailFilters }[] = [
  { label: "Critical", patch: { severity: "CRITICAL" } },
  { label: "Denied", patch: { actionResult: "DENIED" } },
  { label: "Failures", patch: { actionResult: "FAILURE" } },
  { label: "Refunds", patch: { eventType: "refund.process" } },
  { label: "Role grants", patch: { eventType: "role.assign" } },
];

export function AuditTrail({
  filters,
  setFilters,
  catalog,
}: {
  filters: TrailFilters;
  setFilters: (next: TrailFilters) => void;
  catalog: AuditEventTypeRow[];
}) {
  const query = useAuditTrail({ ...toQuery(filters), limit: 50 });
  const events = query.data?.pages.flatMap((p) => p.data ?? []) ?? [];
  const [open, setOpen] = React.useState<AuditTrailEvent | null>(null);
  const byType = React.useMemo(() => new Map(catalog.map((c) => [c.eventType, c])), [catalog]);

  const set = (k: keyof TrailFilters, v: string | undefined) => setFilters({ ...filters, [k]: v || undefined });
  const merge = (patch: AuditTrailQuery) => {
    const next: TrailFilters = { ...filters };
    TRAIL_KEYS.forEach((k) => {
      if (k in patch) next[k] = patch[k] as string | undefined;
    });
    setFilters(next);
  };
  const active = TRAIL_KEYS.some((k) => filters[k]);
  const quickActive = (patch: TrailFilters) =>
    TRAIL_KEYS.every((k) => (patch[k] ?? undefined) === (filters[k] ?? undefined));

  // Event types grouped by who they concern, for the picker.
  const groups = React.useMemo(() => {
    const m = new Map<string, AuditEventTypeRow[]>();
    catalog.forEach((c) => m.set(c.personaGroup, [...(m.get(c.personaGroup) ?? []), c]));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  /** Filters that have no control of their own — shown as removable chips. */
  type Pin = { key: keyof TrailFilters; label: string; value: string };
  const pinned: Pin[] = [];
  if (filters.actorId) pinned.push({ key: "actorId", label: "Actor", value: shortId(filters.actorId) });
  if (filters.resourceType) {
    pinned.push({
      key: "resourceType",
      label: "Resource",
      value: `${humanize(filters.resourceType)}${filters.resourceId ? ` ${shortId(filters.resourceId)}` : ""}`,
    });
  }
  if (filters.correlationId) pinned.push({ key: "correlationId", label: "Request", value: shortId(filters.correlationId) });

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] px-4 py-2.5">
        <span className="mr-1 text-[12px] text-[var(--text-3)]">Quick views</span>
        {QUICK.map((q) => {
          const on = quickActive(q.patch);
          return (
            <button
              key={q.label}
              type="button"
              aria-pressed={on}
              onClick={() => setFilters(on ? {} : q.patch)}
              className={cn(
                "h-6 rounded-full border px-2.5 text-[11.5px] transition-colors",
                on
                  ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent-text)]"
                  : "border-[var(--hairline)] text-[var(--text-2)] hover:border-[var(--hairline-strong)]"
              )}
            >
              {q.label}
            </button>
          );
        })}
      </div>

      <FilterRow active={active} onReset={() => setFilters({})}>
        <label className="flex items-center gap-1.5">
          <span className="text-[12px] text-[var(--text-3)]">Event</span>
          <select
            value={filters.eventType ?? ""}
            onChange={(e) => set("eventType", e.target.value)}
            className="h-7 max-w-[220px] rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)]"
          >
            <option value="">All events</option>
            {groups.map(([group, rows]) => (
              <optgroup key={group} label={humanize(group)}>
                {rows.map((r) => (
                  <option key={r.eventType} value={r.eventType}>
                    {r.eventType}
                  </option>
                ))}
              </optgroup>
            ))}
            {filters.eventType && !byType.has(filters.eventType) ? (
              <option value={filters.eventType}>{filters.eventType}</option>
            ) : null}
          </select>
        </label>
        <FilterSelect
          label="Severity"
          value={filters.severity}
          onChange={(v) => set("severity", v)}
          options={[...SEVERITIES]}
          allLabel="All"
        />
        <FilterSelect
          label="Result"
          value={filters.actionResult}
          onChange={(v) => set("actionResult", v)}
          options={[...RESULTS]}
          allLabel="All"
        />
        <label className="flex items-center gap-1.5">
          <span className="text-[12px] text-[var(--text-3)]">From</span>
          <Input
            type="date"
            value={filters.from ?? ""}
            onChange={(e) => set("from", e.target.value)}
            className="h-7 w-[132px] text-[12px]"
            aria-label="From date"
          />
          <span className="text-[12px] text-[var(--text-3)]">to</span>
          <Input
            type="date"
            value={filters.to ?? ""}
            onChange={(e) => set("to", e.target.value)}
            className="h-7 w-[132px] text-[12px]"
            aria-label="Through date"
          />
        </label>
      </FilterRow>

      {pinned.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline)] px-4 py-2 text-[12px] text-[var(--text-3)]">
          Narrowed to
          {pinned.map((p) => (
            <Badge key={p.key} tone="accent">
              {p.label}: <span className="font-mono">{p.value}</span>
              <button
                type="button"
                aria-label={`Remove ${p.label} filter`}
                onClick={() =>
                  setFilters({
                    ...filters,
                    [p.key]: undefined,
                    ...(p.key === "resourceType" ? { resourceId: undefined } : {}),
                  })
                }
                className="-mr-0.5 hover:text-[var(--text-1)]"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      {query.isLoading ? (
        <TableSkeleton rows={12} cols={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={active ? "No events match" : "The trail is empty"}
          description={active ? "Try widening the dates or clearing a filter." : "Audited changes appear here as they happen."}
        />
      ) : (
        <>
          <ul className={cn("divide-y divide-[var(--hairline)]", query.isFetching && !query.isFetchingNextPage && "opacity-60")}>
            {events.map((e) => (
              <EventRow key={`${e.eventId}:${e.occurredAt}`} e={e} def={byType.get(e.eventType)} onOpen={() => setOpen(e)} />
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] px-4 py-2 text-[11.5px] text-[var(--text-3)]">
            <span>
              {events.length} event{events.length === 1 ? "" : "s"} shown
            </span>
            {query.hasNextPage ? (
              <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                Load older
              </Button>
            ) : (
              <span>That&rsquo;s everything.</span>
            )}
          </div>
        </>
      )}

      {open ? (
        <AuditEventSheet
          key={open.eventId}
          event={open}
          catalog={byType}
          onClose={() => setOpen(null)}
          onFilter={merge}
          onOpenEvent={setOpen}
        />
      ) : null}
    </Panel>
  );
}

function EventRow({ e, def, onOpen }: { e: AuditTrailEvent; def?: AuditEventTypeRow; onOpen: () => void }) {
  const { area, action } = eventLabel(e.eventType);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "grid w-full grid-cols-1 gap-x-4 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)] md:grid-cols-[120px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]",
          e.severity === "CRITICAL" && "border-l-2 border-[var(--danger)]"
        )}
      >
        <Tooltip content={formatDateTime(e.occurredAt)}>
          <span className="tnum text-[11.5px] text-[var(--text-3)]">{formatRelative(e.occurredAt)}</span>
        </Tooltip>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-medium text-[var(--text-1)]">
              {area} <span className="font-normal capitalize text-[var(--text-2)]">{action}</span>
            </span>
            {e.severity !== "INFO" ? <SeverityBadge severity={e.severity} /> : null}
            {e.actionResult !== "SUCCESS" ? <ResultBadge result={e.actionResult} /> : null}
          </span>
          {def?.description ? (
            <span className="mt-0.5 block truncate text-[11px] text-[var(--text-3)]">{def.description}</span>
          ) : null}
        </span>
        <span className="min-w-0 text-[12px] text-[var(--text-2)]">
          {humanize(e.actorType)}
          {e.actorRoleSnapshot ? <span className="block truncate text-[11px] text-[var(--text-3)]">{humanize(e.actorRoleSnapshot)}</span> : null}
        </span>
        <span className="min-w-0 text-[12px] text-[var(--text-2)]">
          {e.resourceType ? humanize(e.resourceType) : "—"}
          {e.resourceId ? <Mono className="block truncate text-[10.5px]">{shortId(e.resourceId)}</Mono> : null}
        </span>
      </button>
    </li>
  );
}
