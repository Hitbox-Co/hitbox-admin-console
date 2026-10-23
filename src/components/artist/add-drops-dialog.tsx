"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft, Check, ChevronLeft, ChevronRight, PackageSearch, Search, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAddCollectionDrops, useAvailableCollectionDrops } from "@/lib/api/hooks";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Mono, Skeleton } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { DropMonogram } from "./drop-tile";
import type { AvailableCollectionDrop, CollectionDropProblem } from "@/lib/types";

/**
 * Add drops — the picker for routes 10 and 11 (artist-collection-api.md).
 *
 * Multi-select that survives searching and paging. Drops already in another
 * of my collections appear only with "Include drops in my other
 * collections" on, chipped with where they are; choosing one is the consent
 * to move it, and the button says so before anything is sent. The add is
 * all-or-nothing: on DROPS_INVALID every problem is marked on its row.
 */

const LIMIT = 12;

const PROBLEM_COPY: Record<CollectionDropProblem["problem"], string> = {
  NOT_FOUND: "No longer available to you",
  NOT_ACTIVE: "Not on sale any more — add it once it's live",
  ALREADY_IN_COLLECTION: "Already in this collection",
  IN_ANOTHER_COLLECTION: "In another collection",
};

export function AddDropsDialog({
  collectionId,
  collectionName,
  onClose,
}: {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [includeFiled, setIncludeFiled] = React.useState(false);
  const [page, setPage] = React.useState(1);
  // id → row, so a selection keeps its name and chip after the page changes.
  const [selected, setSelected] = React.useState<Map<string, AvailableCollectionDrop>>(new Map());
  const [problems, setProblems] = React.useState<Map<string, CollectionDropProblem>>(new Map());

  React.useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useAvailableCollectionDrops(collectionId, { q: q || undefined, includeFiled, page, limit: LIMIT });
  const add = useAddCollectionDrops(collectionId);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const moving = [...selected.values()].filter((d) => d.currentCollection);
  const movingFrom = [...new Set(moving.map((d) => d.currentCollection!.name))];

  const toggle = (d: AvailableCollectionDrop) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(d.id)) next.delete(d.id);
      else if (next.size < 50) next.set(d.id, d);
      else toast.error("You can add up to 50 drops at a time.");
      return next;
    });
    setProblems((prev) => {
      if (!prev.has(d.id)) return prev;
      const next = new Map(prev);
      next.delete(d.id);
      return next;
    });
  };

  const submit = (move: boolean) => {
    if (selected.size === 0 || add.isPending) return;
    add.mutate(
      { dropIds: [...selected.keys()], move },
      {
        onSuccess: (r) => {
          const n = r.dropIds.length;
          const moved = Object.keys(r.movedFrom ?? {}).length;
          toast.success(
            `${n} drop${n === 1 ? "" : "s"} added to ${collectionName}` +
              (moved ? ` · ${moved} moved from another collection` : "")
          );
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "ARTIST_COLLECTION_DROPS_INVALID") {
            const list = ((err.details as { problems?: CollectionDropProblem[] } | null)?.problems ?? []);
            setProblems(new Map(list.map((p) => [p.dropId, p])));
            // Nothing to decide for these — take them out of the selection.
            setSelected((prev) => {
              const next = new Map(prev);
              list.forEach((p) => {
                if (p.problem !== "IN_ANOTHER_COLLECTION") next.delete(p.dropId);
              });
              return next;
            });
            const fixable = list.filter((p) => p.problem === "IN_ANOTHER_COLLECTION").length;
            toast.error(
              fixable
                ? `${fixable} drop${fixable === 1 ? " is" : "s are"} in another collection — choose Move here to bring ${fixable === 1 ? "it" : "them"} over.`
                : "Some drops couldn't be added and were unselected. Try again with the rest."
            );
            return;
          }
          if (err instanceof ApiError && err.code === "ARTIST_COLLECTION_DROPS_CHANGED") {
            setProblems(new Map());
            query.refetch();
          }
          toast.error(err instanceof ApiError ? err.friendly : "Could not add the drops.");
        },
      }
    );
  };

  const needsMoveConsent = [...problems.values()].some((p) => p.problem === "IN_ANOTHER_COLLECTION");
  const move = moving.length > 0 || needsMoveConsent;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.55)] backdrop-blur-[2px]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] flex max-h-[min(720px,calc(100vh-32px))] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          {/* Header */}
          <div className="space-y-3 border-b border-[var(--hairline)] px-5 pb-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="text-[16px] font-semibold tracking-[-0.015em] text-[var(--text-1)]">
                  Add drops
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 truncate text-[12.5px] text-[var(--text-3)]">
                  Your on-sale drops, into <span className="text-[var(--text-2)]">{collectionName}</span>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or group code"
                aria-label="Search drops"
                autoFocus
                className="h-10 w-full rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-2)] pl-9 pr-9 text-[13px] text-[var(--text-1)] outline-none transition-colors placeholder:text-[var(--text-3)] focus:border-[var(--accent)]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-3)] hover:text-[var(--text-1)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <Toggle
              checked={includeFiled}
              onChange={(v) => {
                setIncludeFiled(v);
                setPage(1);
              }}
              label="Include drops in my other collections"
              hint="Adding one moves it here — a drop sits in one collection at a time."
            />
          </div>

          {/* List */}
          <div className="min-h-[240px] flex-1 overflow-y-auto px-3 py-3">
            {query.isLoading ? (
              <div className="space-y-2 px-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[64px] w-full rounded-[12px]" />
                ))}
              </div>
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title={q ? "No drops match" : "Nothing left to add"}
                description={
                  q
                    ? "Try another name or group code."
                    : includeFiled
                      ? "Every drop you have on sale is already here."
                      : "Your on-sale drops are all filed. Turn on the toggle above to move one from another collection."
                }
              />
            ) : (
              <ul className={cn("space-y-1.5", query.isFetching && "opacity-60 transition-opacity")}>
                {items.map((d) => (
                  <PickRow
                    key={d.id}
                    d={d}
                    checked={selected.has(d.id)}
                    problem={problems.get(d.id)}
                    onToggle={() => toggle(d)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--hairline)] bg-[var(--surface-2)]/40 px-5 py-3">
            {move && selected.size > 0 ? (
              <p className="mb-2.5 flex items-start gap-2 text-[12px] text-[var(--text-2)]">
                <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
                <span>
                  {moving.length || [...problems.values()].filter((p) => p.problem === "IN_ANOTHER_COLLECTION").length}{" "}
                  will move here from{" "}
                  <span className="font-medium text-[var(--text-1)]">
                    {movingFrom.length
                      ? movingFrom.join(", ")
                      : [...new Set([...problems.values()].map((p) => p.collection?.name).filter(Boolean))].join(", ") ||
                        "another collection"}
                  </span>{" "}
                  and leave it.
                </span>
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              {pages > 1 ? (
                <div className="flex items-center gap-1 text-[12px] text-[var(--text-3)]">
                  <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="tnum">
                    {page} / {pages}
                  </span>
                  <Button variant="ghost" size="icon-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <span className="tnum text-[12px] text-[var(--text-3)]">{formatNumber(total)} available</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {selected.size ? (
                  <button
                    type="button"
                    onClick={() => setSelected(new Map())}
                    className="text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    Clear {selected.size}
                  </button>
                ) : null}
                <Button variant="primary" size="md" disabled={selected.size === 0} loading={add.isPending} onClick={() => submit(move)}>
                  {selected.size === 0
                    ? "Select drops"
                    : move
                      ? `Add & move ${selected.size}`
                      : `Add ${selected.size} drop${selected.size === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PickRow({
  d,
  checked,
  problem,
  onToggle,
}: {
  d: AvailableCollectionDrop;
  checked: boolean;
  problem?: CollectionDropProblem;
  onToggle: () => void;
}) {
  const blocking = problem && problem.problem !== "IN_ANOTHER_COLLECTION";
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className={cn(
          "group flex w-full items-center gap-3 rounded-[12px] border px-2.5 py-2 text-left transition-all",
          checked
            ? "border-[var(--accent)] bg-[var(--accent-dim)]"
            : "border-transparent hover:border-[var(--hairline)] hover:bg-[var(--surface-2)]",
          blocking && "border-[var(--danger)] bg-[var(--danger-dim)]"
        )}
      >
        <DropMonogram id={d.id} name={d.name} className="h-12 w-12 rounded-[10px] text-[14px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-[var(--text-1)]">{d.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--text-3)]">
            <Mono className="text-[10.5px]">{d.groupCode}</Mono>
            <span>{formatNumber(d.totalSupply)} made</span>
            {d.publishedAt ? <span>Live since {formatDate(d.publishedAt)}</span> : null}
          </span>
          {d.currentCollection ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--warning-dim)] px-2 py-0.5 text-[11px] text-[var(--warning)]">
              <ArrowRightLeft className="h-3 w-3" />
              In <span className="font-medium">{d.currentCollection.name}</span> — adding moves it
            </span>
          ) : null}
          {problem ? (
            <span
              className={cn(
                "mt-1 flex items-center gap-1 text-[11.5px]",
                blocking ? "text-[var(--danger)]" : "text-[var(--warning)]"
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {problem.problem === "IN_ANOTHER_COLLECTION" && problem.collection
                ? `In ${problem.collection.name} — Add & move brings it here`
                : PROBLEM_COPY[problem.problem]}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            checked
              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-[var(--hairline-strong)] text-transparent group-hover:border-[var(--text-3)]"
          )}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      </button>
    </li>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 text-left"
    >
      <span
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </span>
      <span>
        <span className="block text-[12.5px] text-[var(--text-1)]">{label}</span>
        {hint ? <span className="block text-[11.5px] text-[var(--text-3)]">{hint}</span> : null}
      </span>
    </button>
  );
}
