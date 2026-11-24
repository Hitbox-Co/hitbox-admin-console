"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, Calculator, ListTree, Pencil, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAuditEventTypes, useAuditRetention, useUpdateRetention } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Field, Input, Panel, PanelHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { SearchInput } from "@/components/ui/filters";
import { SEVERITIES, SeverityBadge } from "./audit-bits";
import type { AuditRetentionPolicy, AuditSeverity } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Event types — what gets recorded (audit-logging.md §2–3)            */
/* ------------------------------------------------------------------ */

export function EventTypesPanel({ onPick }: { onPick: (eventType: string) => void }) {
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [severity, setSeverity] = React.useState<string | undefined>();
  const q = useAuditEventTypes(includeInactive);

  const rows = (q.data ?? []).filter(
    (r) =>
      (!severity || r.defaultSeverity === severity) &&
      (!search ||
        r.eventType.includes(search.toLowerCase()) ||
        r.description.toLowerCase().includes(search.toLowerCase()))
  );
  const counts = SEVERITIES.map((s) => ({ s, n: (q.data ?? []).filter((r) => r.isActive && r.defaultSeverity === s).length }));
  const groups = new Map<string, typeof rows>();
  rows.forEach((r) => groups.set(r.personaGroup, [...(groups.get(r.personaGroup) ?? []), r]));

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="What gets recorded"
        description="Severity belongs to the event, not the caller — CRITICAL events are kept 7 years and can't be downgraded."
      />
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--hairline)] px-4 py-2.5">
        <SearchInput value={search} onChange={setSearch} placeholder="Event or description" className="w-[220px]" />
        {counts.map(({ s, n }) => (
          <button
            key={s}
            type="button"
            aria-pressed={severity === s}
            onClick={() => setSeverity(severity === s ? undefined : s)}
            className={severity === s ? "rounded-[8px] ring-2 ring-[var(--accent)]" : "rounded-[8px]"}
          >
            <SeverityBadge severity={s} />
            <span className="tnum ml-1 text-[11.5px] text-[var(--text-3)]">{n}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Include retired
        </label>
      </div>

      {q.isLoading ? (
        <TableSkeleton rows={10} cols={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ListTree} title="No event types match" />
      ) : (
        [...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([group, list]) => (
            <section key={group}>
              <h4 className="border-b border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                {humanize(group)} · {list.length}
              </h4>
              <ul className="divide-y divide-[var(--hairline)]">
                {list.map((r) => (
                  <li key={r.eventType} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                    <button
                      type="button"
                      onClick={() => onPick(r.eventType)}
                      className="font-mono text-[12px] text-[var(--text-1)] hover:underline"
                      title="Show these events in the trail"
                    >
                      {r.eventType}
                    </button>
                    <SeverityBadge severity={r.defaultSeverity} />
                    {!r.isActive ? <Badge tone="neutral">Retired</Badge> : null}
                    <span className="min-w-[200px] flex-1 text-[12px] text-[var(--text-2)]">{r.description}</span>
                    {r.sourceStories.length ? (
                      <span className="text-[11px] text-[var(--text-3)]" title="The requirement that justified recording it">
                        {r.sourceStories.join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Retention — how long each severity is kept (audit-logging.md §7)    */
/* ------------------------------------------------------------------ */

const DEFAULT_DAYS: Record<AuditSeverity, number> = { CRITICAL: 2555, WARNING: 1095, INFO: 90 };

function describeDays(days: number): string {
  if (days % 365 === 0 || days >= 730) {
    const years = Math.round((days / 365) * 10) / 10;
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${formatNumber(days)} day${days === 1 ? "" : "s"}`;
}

export function RetentionPanel() {
  const perms = usePermissions();
  const canManage = perms.can("audit-log", "manage", "global");
  // The counts are a COUNT over the largest table — only when asked for.
  const [withCounts, setWithCounts] = React.useState(false);
  const q = useAuditRetention(withCounts);
  const [editing, setEditing] = React.useState<AuditRetentionPolicy | null>(null);

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="How long the trail is kept"
          description="One window per severity. Nothing here deletes anything — a scheduled job outside the app drops whole months past the cutoff."
          action={
            withCounts ? undefined : (
              <Button variant="secondary" size="sm" onClick={() => setWithCounts(true)}>
                <Calculator className="h-3.5 w-3.5" /> Count what&rsquo;s due
              </Button>
            )
          }
        />
        {q.isLoading ? (
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            {SEVERITIES.map((s) => (
              <Skeleton key={s} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            {SEVERITIES.map((s) => {
              const p = q.data?.find((x) => x.severity === s);
              if (!p) {
                return (
                  <div key={s} className="rounded-xl border border-[var(--danger)] bg-[var(--danger-dim)] p-3.5">
                    <SeverityBadge severity={s} />
                    <p className="mt-2 text-[12px] text-[var(--text-1)]">
                      No policy — the audit seed hasn&rsquo;t been run here, so these rows never expire.
                    </p>
                  </div>
                );
              }
              const changed = p.retentionDays !== DEFAULT_DAYS[s];
              return (
                <div key={s} className="flex flex-col rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <SeverityBadge severity={s} />
                    {canManage ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                        <Pencil className="h-3 w-3" /> Change
                      </Button>
                    ) : null}
                  </div>
                  <p className="tnum mt-2 text-[24px] font-semibold leading-none text-[var(--text-1)]">
                    {describeDays(p.retentionDays)}
                  </p>
                  <p className="tnum mt-1 text-[11.5px] text-[var(--text-3)]">
                    {formatNumber(p.retentionDays)} days · older than {formatDate(p.cutoff)} is out of policy
                  </p>
                  {changed ? (
                    <p className="mt-1 text-[11px] text-[var(--text-3)]">Default is {describeDays(DEFAULT_DAYS[s])}.</p>
                  ) : null}
                  {p.notes ? <p className="mt-2 text-[12px] text-[var(--text-2)]">{p.notes}</p> : null}
                  {p.pendingDeletion !== undefined ? (
                    <p className="mt-auto pt-2 text-[12px] text-[var(--text-1)]">
                      <span className="tnum font-semibold">{formatNumber(p.pendingDeletion)}</span>
                      <span className="text-[var(--text-3)]"> rows due at the next sweep</span>
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel className="px-4 py-3">
        <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
          Export isn&rsquo;t available yet: it needs a step-up sign-in the platform doesn&rsquo;t have, so the backend
          doesn&rsquo;t offer the route.
          {canManage ? "" : " Changing a window needs audit-log:manage."}
        </p>
      </Panel>

      {editing ? <EditRetentionDialog policy={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EditRetentionDialog({ policy, onClose }: { policy: AuditRetentionPolicy; onClose: () => void }) {
  const update = useUpdateRetention();
  const [days, setDays] = React.useState(String(policy.retentionDays));
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const n = Number(days);
  const shortening = Number.isFinite(n) && n < policy.retentionDays;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!Number.isInteger(n) || n < 1 || n > 36_500) next.days = "A whole number of days, 1 to 36,500.";
    if (notes.trim().length < 10) next.notes = "Say why, in at least 10 characters — it's kept with the change.";
    setErrors(next);
    if (Object.keys(next).length) return;
    update.mutate(
      { severity: policy.severity, retentionDays: n, notes: notes.trim() },
      {
        onSuccess: (p) => {
          toast.success(`${humanize(p.severity)} events are now kept ${describeDays(p.retentionDays)}`);
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 422) setErrors(err.fieldErrors);
          toast.error(err instanceof ApiError ? err.validationSummary ?? err.friendly : "Could not change the window.");
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold text-[var(--text-1)]">
                Keep {humanize(policy.severity).toLowerCase()} events for…
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                Recorded as a critical event, with the old and new window.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="space-y-4 px-4 py-4">
            <Field
              label="Days"
              htmlFor="ret-days"
              error={errors.days ?? errors.retentionDays}
              hint={Number.isFinite(n) && n > 0 ? `About ${describeDays(n)}. Currently ${formatNumber(policy.retentionDays)} days.` : undefined}
            >
              <Input
                id="ret-days"
                type="number"
                min={1}
                max={36500}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="tnum w-[160px]"
                autoFocus
              />
            </Field>
            {shortening ? (
              <p className="flex items-start gap-2 rounded-[8px] border border-[var(--danger)] bg-[var(--danger-dim)] px-3 py-2 text-[12px] text-[var(--text-1)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
                Shortening means the next sweep removes rows that would have been kept.
                {policy.severity === "CRITICAL" ? " Don't shorten critical retention without legal sign-off." : ""}
              </p>
            ) : null}
            <Field label="Reason" htmlFor="ret-notes" error={errors.notes} hint={`${notes.trim().length}/1000 — at least 10`}>
              <Textarea
                id="ret-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Legal hold for the 2026 dispute — extend to 10 years."
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant={shortening ? "danger" : "primary"} size="sm" loading={update.isPending}>
                {shortening ? "Shorten window" : "Save"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

