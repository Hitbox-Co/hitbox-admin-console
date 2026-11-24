"use client";

import * as React from "react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/* A shared clock                                                      */
/* ------------------------------------------------------------------ */

/**
 * One minute-ticking clock for every countdown on the page.
 *
 * `Date.now()` read during render is impure: two renders of the same
 * component would disagree, and on the server it would produce a value the
 * client then contradicts during hydration. `useSyncExternalStore` is the
 * supported answer — the snapshot is cached and only changes when the clock
 * actually ticks, and `getServerSnapshot` returns 0, which every caller
 * reads as "not hydrated yet, show the absolute date instead".
 *
 * A single module-level interval rather than one per row: a dispute queue is
 * twenty rows, and twenty timers to render the same minute is twenty times
 * the wakeups for no extra information.
 */
let clockSnapshot = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (clockTimer === null) {
    clockSnapshot = Date.now();
    clockTimer = setInterval(() => {
      clockSnapshot = Date.now();
      for (const l of clockListeners) l();
    }, 60_000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer !== null) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** Milliseconds since the epoch, or 0 while rendering on the server. */
function useNow(): number {
  return React.useSyncExternalStore(
    subscribeToClock,
    () => clockSnapshot,
    () => 0
  );
}

/**
 * Time left until an evidence deadline.
 *
 * Rendered as a duration rather than a date because the decision it drives is
 * "is there still time", and a reader should not have to subtract today's
 * date from a timestamp to find out. Once a case is resolved the clock stops
 * mattering, so it falls back to the plain date — a red "overdue" on a case
 * that was won three weeks ago is noise that trains people to ignore the
 * colour.
 */
export function Countdown({
  iso,
  settled,
  className,
}: {
  iso: string | null | undefined;
  /** True once the case has an outcome — the deadline is then just history. */
  settled?: boolean;
  className?: string;
}) {
  const now = useNow();

  if (!iso) {
    return (
      <span className={cn("text-[11px] text-[var(--text-3)]", className)}>
        No deadline
      </span>
    );
  }

  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) {
    return <span className={cn("text-[11px] text-[var(--text-3)]", className)}>—</span>;
  }

  // `now === 0` is the server (and the hydration pass): there is no honest
  // countdown to render yet, so show the deadline itself.
  if (settled || now === 0) {
    return (
      <span className={cn("tnum text-[12px] text-[var(--text-3)]", className)}>
        {formatDateTime(iso)}
      </span>
    );
  }

  const ms = due.getTime() - now;
  const hours = Math.round(ms / 3_600_000);
  const days = Math.round(hours / 24);

  const overdue = ms <= 0;
  // Under two days is when a case stops being something to schedule and
  // starts being something to do now.
  const urgent = !overdue && hours <= 48;

  const label = overdue
    ? "Deadline passed"
    : hours < 24
      ? `${Math.max(hours, 1)}h left`
      : `${days}d left`;

  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          "text-[12px] font-medium",
          overdue
            ? "text-[var(--danger)]"
            : urgent
              ? "text-[var(--warning)]"
              : "text-[var(--text-1)]"
        )}
      >
        {label}
      </p>
      <p className="tnum mt-0.5 text-[11px] text-[var(--text-3)]">
        {formatDateTime(iso)}
      </p>
    </div>
  );
}
