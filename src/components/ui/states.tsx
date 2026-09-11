"use client";

import * as React from "react";
import {
  AlertTriangle,
  Inbox,
  Lock,
  RefreshCw,
  ServerCrash,
  WifiOff,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { Button, Panel, Skeleton } from "./primitives";

/* ------------------------------------------------------------------ */
/* Not permitted                                                       */
/* ------------------------------------------------------------------ */

/**
 * Rendered when a section key is ABSENT from the response.
 *
 * This must never look like an empty data state. A missing key means the
 * caller is not allowed to see the figure at all; `{ revenue: 0 }` would
 * mean the figure is genuinely zero. Conflating the two is the single
 * easiest way to mislead an operator, so this state is deliberately
 * locked-looking, muted, and labelled.
 */
export function NotPermitted({
  what,
  requires,
  className,
  compact,
}: {
  what: string;
  requires?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[8px] border border-dashed border-[var(--hairline-strong)] bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(255,255,255,0.014)_6px,rgba(255,255,255,0.014)_12px)]",
        compact ? "px-3 py-2.5" : "px-4 py-5",
        className
      )}
    >
      <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[var(--text-2)]">
          {what} is not visible to your role
        </p>
        {requires && !compact ? (
          <p className="mt-0.5 font-mono text-[11px] text-[var(--text-3)]">
            requires {requires}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Inline variant for a single figure inside an otherwise-visible card. */
export function RedactedValue({ requires }: { requires?: string }) {
  return (
    <span
      title={requires ? `Requires ${requires}` : "Not visible to your role"}
      className="inline-flex items-center gap-1 text-[13px] text-[var(--text-3)]"
    >
      <Lock className="h-3 w-3" aria-hidden />
      <span>Restricted</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty                                                               */
/* ------------------------------------------------------------------ */

/** Rendered when the caller CAN see a section and it genuinely holds nothing. */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)]">
        <Icon className="h-4 w-4 text-[var(--text-3)]" />
      </div>
      <p className="text-[13px] font-medium text-[var(--text-1)]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-[380px] text-[12px] leading-relaxed text-[var(--text-3)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Error                                                               */
/* ------------------------------------------------------------------ */

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const api = error instanceof ApiError ? error : null;
  const code = api?.code ?? "NETWORK_ERROR";

  const Icon =
    code === "NETWORK_ERROR"
      ? WifiOff
      : code === "STORAGE_UNAVAILABLE"
        ? ServerCrash
        : code === "AUTHZ_FORBIDDEN" || code === "SCOPE_MISMATCH"
          ? Lock
          : AlertTriangle;

  const tone =
    code === "AUTHZ_FORBIDDEN" || code === "SCOPE_MISMATCH" || code === "NOT_FOUND"
      ? "muted"
      : "danger";

  const message =
    api?.friendly ??
    (error instanceof Error ? error.message : "Something went wrong.");

  // A forbidden response on a dedicated page is the same fact as a missing
  // key on the aggregate — present it the same way, not as a failure.
  const retryable = code !== "AUTHZ_FORBIDDEN" && code !== "SCOPE_MISMATCH";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className
      )}
    >
      <div
        className={cn(
          "mb-3 flex h-9 w-9 items-center justify-center rounded-[8px] border",
          tone === "danger"
            ? "border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)]"
            : "border-[var(--hairline)] bg-[var(--surface-2)]"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "danger" ? "text-[var(--danger)]" : "text-[var(--text-3)]"
          )}
        />
      </div>
      <p className="text-[13px] font-medium text-[var(--text-1)]">{message}</p>
      <p className="mt-1 font-mono text-[11px] text-[var(--text-3)]">{code}</p>
      {onRetry && retryable ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

// Uneven widths read as content arriving, not as a progress bar.
const SKELETON_WIDTHS = ["28%", "14%", "20%", "11%", "17%", "13%", "22%"];

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-[var(--hairline)]">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3.5"
              style={{ width: SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Panel className={cn("p-4", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </Panel>
  );
}

export function GridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
