"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  ArchiveRestore,
  ArrowLeft,
  Gift,
  Lock,
  Power,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAdminReward, useModerateReward, useRewardUnlocks } from "@/lib/api/hooks";
import { formatBytes, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Field, Panel, Segmented, Skeleton, Textarea } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Preview, StatusBadge, rewardContentsSummary } from "@/components/artist/collection-reward-tab";
import { ResourceHistory } from "@/components/artist/collection-history";
import type { AdminRewardDetail, RewardModerationAction, RewardUnlockRow } from "@/lib/types";

/**
 * One collection reward, for review and moderation (admin-rewards-api.md).
 * The file links are signed for an hour: the query is never cached and is
 * re-read before they expire. Every action answers with the detail, which
 * replaces the page state.
 */
export default function RewardPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/rewards")}
      what="Collection rewards"
      requires="content-unlock:manage (platform-wide)"
    >
      <RewardView />
    </PageGuard>
  );
}

function BackLink() {
  return (
    <Link href="/rewards" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-1)]">
      <ArrowLeft className="h-3.5 w-3.5" /> All rewards
    </Link>
  );
}

type Tab = "files" | "unlocks" | "history";

function RewardView() {
  const { rewardId } = useParams<{ rewardId: string }>();
  const perms = usePermissions();
  const q = useAdminReward(rewardId);
  const r = q.data;
  const [tab, setTab] = React.useState<Tab>("files");
  const canAudit = perms.canOpen("/activity");

  usePageChrome({
    title: r?.name ?? "Reward",
    description: r ? `${r.collection.artist.name} · ${r.collection.name}` : undefined,
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (q.isError || !r) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackLink />

      {r.moderation.locked ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border-2 border-[var(--danger)] bg-[var(--danger-dim)] px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <div className="text-[12.5px]">
            <p className="font-semibold text-[var(--danger)]">Locked by HitBox: {r.moderation.reason ?? "no reason recorded"}</p>
            <p className="mt-0.5 text-[var(--text-2)]">
              {r.moderation.lockedAt ? `Since ${formatDateTime(r.moderation.lockedAt)}. ` : ""}
              Fans can&rsquo;t open it and the artist can&rsquo;t switch it back on — only staff can lift the lock.
            </p>
          </div>
        </div>
      ) : null}

      <Header r={r} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "files", label: `Files · ${r.items.length}` },
            { value: "unlocks", label: `Unlocks · ${formatNumber(r.unlockedCount)}` },
            ...(canAudit ? [{ value: "history" as const, label: "History" }] : []),
          ]}
        />
        {tab === "files" && r.items.length ? (
          <Button variant="ghost" size="sm" onClick={() => q.refetch()} loading={q.isFetching}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh links
          </Button>
        ) : null}
      </div>

      {tab === "unlocks" ? (
        <UnlocksTab rewardId={r.id} />
      ) : tab === "history" && canAudit ? (
        <Panel className="overflow-hidden">
          <ResourceHistory resourceType={r.auditTrail.resourceType} resourceId={r.auditTrail.resourceId} />
        </Panel>
      ) : (
        <FilesTab r={r} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header({ r }: { r: AdminRewardDetail }) {
  const contents = rewardContentsSummary(r.itemCounts);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(200,109,215,0.16),transparent_55%)]" />
      <div className="relative flex flex-wrap items-start gap-4 px-5 py-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[#c86dd7] text-white">
          <Gift className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">{r.name}</h2>
            <StatusBadge status={r.status} />
            {r.moderation.locked ? (
              <Badge tone="danger">
                <Lock className="h-3 w-3" /> Locked by HitBox
              </Badge>
            ) : null}
            {r.collection.deleted ? <Badge tone="danger">Collection deleted</Badge> : null}
          </div>
          <p className="mt-1 text-[12.5px] text-[var(--text-3)]">
            <Link href={`/artists/${r.collection.artist.id}`} className="text-[var(--text-2)] hover:underline">
              {r.collection.artist.name}
            </Link>{" "}
            ·{" "}
            <Link href={`/artist-collections/${r.collection.id}`} className="text-[var(--text-2)] hover:underline">
              {r.collection.name}
            </Link>
          </p>
          {r.description ? (
            <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[12.5px] text-[var(--text-2)]">{r.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
            <Chip icon={Users}>
              {formatNumber(r.unlockedCount)} fan{r.unlockedCount === 1 ? "" : "s"} unlocked
            </Chip>
            <Chip icon={Lock}>
              Requires {formatNumber(r.requiredDrops)} drop{r.requiredDrops === 1 ? "" : "s"}
            </Chip>
            {contents ? <Chip icon={Gift}>{contents}</Chip> : null}
          </div>
        </div>
        <Actions r={r} />
      </div>
    </div>
  );
}

function Chip({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-1 text-[var(--text-2)]">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Moderation                                                          */
/* ------------------------------------------------------------------ */

const ACTION_COPY: Record<
  RewardModerationAction,
  { label: string; title: string; body: string; reasonRequired: boolean; danger: boolean; icon: typeof Power; done: string }
> = {
  "switch-off": {
    label: "Switch off",
    title: "Switch this reward off?",
    body: "Fans can't open it and nobody new unlocks it. It's locked: the artist can still fix the files, but only staff can switch it back on. Nothing is deleted.",
    reasonRequired: true,
    danger: true,
    icon: PowerOff,
    done: "Reward switched off and locked",
  },
  remove: {
    label: "Remove",
    title: "Remove this reward?",
    body: "It's taken down and locked. Files and fans' unlocks are kept, so restoring brings it all back.",
    reasonRequired: true,
    danger: true,
    icon: Trash2,
    done: "Reward removed and locked",
  },
  "switch-on": {
    label: "Switch on",
    title: "Switch this reward back on?",
    body: "The lock is lifted. Fans who had it can open it again, and anyone who completed the set meanwhile gets it.",
    reasonRequired: false,
    danger: false,
    icon: Power,
    done: "Reward switched on",
  },
  restore: {
    label: "Restore",
    title: "Restore this reward?",
    body: "The removal and lock are lifted. If HitBox had also switched it off, it comes back off — but unlocked, so the artist can switch it on.",
    reasonRequired: false,
    danger: false,
    icon: ArchiveRestore,
    done: "Reward restored",
  },
};

function Actions({ r }: { r: AdminRewardDetail }) {
  const [pending, setPending] = React.useState<RewardModerationAction | null>(null);
  const actions: RewardModerationAction[] = [];
  if (r.moderation.locked && r.status === "OFF") actions.push("switch-on");
  if (r.moderation.locked && r.status === "REMOVED") actions.push("restore");
  if (r.status === "ON") actions.push("switch-off");
  if (r.status !== "REMOVED") actions.push("remove");

  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => {
        const c = ACTION_COPY[a];
        return (
          <Button
            key={a}
            variant={c.danger ? (a === "remove" ? "ghost" : "danger") : "primary"}
            size="sm"
            className={a === "remove" ? "text-[var(--danger)]" : undefined}
            onClick={() => setPending(a)}
          >
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </Button>
        );
      })}
      {pending ? <ModerationDialog r={r} action={pending} onClose={() => setPending(null)} /> : null}
    </div>
  );
}

function ModerationDialog({
  r,
  action,
  onClose,
}: {
  r: AdminRewardDetail;
  action: RewardModerationAction;
  onClose: () => void;
}) {
  const c = ACTION_COPY[action];
  const run = useModerateReward(r.id);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = reason.trim();
    if (c.reasonRequired && !text) {
      setError("A reason is required — the artist sees it.");
      return;
    }
    run.mutate(
      { action, reason: text || undefined },
      {
        onSuccess: () => {
          toast.success(c.done);
          onClose();
        },
        // 409s carry the precise wording — shown exactly as returned.
        onError: (err) => setError(err instanceof ApiError ? err.friendly : "That didn't work."),
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.55)] backdrop-blur-[2px]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14.5px] font-semibold text-[var(--text-1)]">{c.title}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                {r.name} · {r.collection.artist.name}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="space-y-4 px-4 py-4">
            <p className="text-[12.5px] leading-relaxed text-[var(--text-2)]">{c.body}</p>
            <Field
              label={c.reasonRequired ? "Reason (shown to the artist)" : "Reason (optional)"}
              htmlFor="mod-reason"
              required={c.reasonRequired}
              error={error ?? undefined}
              hint={`${reason.length}/500 · kept in the audit trail`}
            >
              <Textarea
                id="mod-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
                placeholder={
                  c.reasonRequired
                    ? "e.g. The video contains copyrighted music. Replace it and contact support."
                    : "e.g. Reviewed: the music was replaced."
                }
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={c.danger ? "danger" : "primary"}
                size="sm"
                loading={run.isPending}
                disabled={c.reasonRequired && !reason.trim()}
              >
                {c.label}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

function FilesTab({ r }: { r: AdminRewardDetail }) {
  const items = [...r.items].sort((a, b) => a.position - b.position);
  if (!items.length) {
    return (
      <Panel>
        <EmptyState icon={Gift} title="No files" description="The artist hasn't added any content to this reward yet." />
      </Panel>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11.5px] text-[var(--text-3)]">
        Preview links are signed for an hour and refresh automatically before they expire.
      </p>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it, i) => (
          <li key={it.id} className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)]">
            <div className="[&>div]:w-full [&>div]:rounded-none [&>div]:sm:w-full">
              <Preview item={it} />
            </div>
            <div className="px-3.5 py-3">
              <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-1)]">
                <span className="tnum text-[11px] text-[var(--text-3)]">{i + 1}</span>
                <span className="truncate">{it.title}</span>
              </p>
              <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-3)]">
                {it.kind === "AUDIO" ? "Music" : it.kind.charAt(0) + it.kind.slice(1).toLowerCase()} · {it.fileName} ·{" "}
                {formatBytes(it.sizeBytes)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Unlocks                                                             */
/* ------------------------------------------------------------------ */

function UnlocksTab({ rewardId }: { rewardId: string }) {
  const [status, setStatus] = React.useState<"ALL" | "LIVE" | "ENDED">("ALL");
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const q = useRewardUnlocks(rewardId, { status: status === "ALL" ? undefined : status, page, limit });

  const columns: Column<RewardUnlockRow>[] = [
    {
      key: "buyer",
      header: "Buyer",
      cell: (u) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--text-1)]">
            {u.buyer.handle ? `@${u.buyer.handle}` : u.buyer.fullName ?? "Unknown buyer"}
          </p>
          {u.buyer.handle && u.buyer.fullName ? (
            <p className="truncate text-[11px] text-[var(--text-3)]">{u.buyer.fullName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (u) =>
        u.status === "LIVE" ? (
          <Badge tone="positive" dot>Live</Badge>
        ) : (
          <Badge tone="neutral" dot>Ended</Badge>
        ),
    },
    { key: "unlocked", header: "Unlocked", cell: (u) => <span className="tnum text-[12px]">{formatDateTime(u.unlockedAt)}</span> },
    {
      key: "ended",
      header: "Ended",
      cell: (u) => <span className="tnum text-[12px] text-[var(--text-3)]">{u.endedAt ? formatDateTime(u.endedAt) : "—"}</span>,
    },
    { key: "opened", header: "Times opened", numeric: true, cell: (u) => <span className="tnum">{formatNumber(u.timesOpened)}</span> },
    {
      key: "last",
      header: "Last opened",
      cell: (u) => (
        <span className="tnum text-[12px] text-[var(--text-3)]" title={u.lastOpenedAt ? formatDateTime(u.lastOpenedAt) : undefined}>
          {u.lastOpenedAt ? formatRelative(u.lastOpenedAt) : "Never"}
        </span>
      ),
    },
  ];

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-2.5">
        <Segmented
          size="sm"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "ALL", label: "All" },
            { value: "LIVE", label: "Live" },
            { value: "ENDED", label: "Ended" },
          ]}
        />
        <p className="text-[11.5px] text-[var(--text-3)]">Ended = lost it when a piece of the set was taken back.</p>
      </div>
      {q.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={q.data?.items ?? []}
            getRowKey={(u) => u.id}
            dimmed={q.isFetching}
            rowClassName={(u) => (u.status === "ENDED" ? "opacity-60" : undefined)}
            emptyState={
              <EmptyState
                icon={Users}
                title={status === "ALL" ? "Nobody has unlocked it yet" : `No ${status.toLowerCase()} unlocks`}
              />
            }
          />
          <div className={cn((q.data?.total ?? 0) === 0 && "hidden")}>
            <Pagination
              page={q.data?.page ?? 1}
              limit={q.data?.limit ?? limit}
              total={q.data?.total ?? 0}
              onPageChange={setPage}
              onLimitChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
          </div>
        </>
      )}
    </Panel>
  );
}
