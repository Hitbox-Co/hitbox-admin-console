"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./primitives";

/**
 * A dense data table. Wide content scrolls inside its own container so the
 * page body never scrolls horizontally.
 */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Right-align numeric columns and give them tabular figures. */
  numeric?: boolean;
  width?: string;
  cell: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  onRowIntent,
  emptyState,
  className,
  dimmed,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /**
   * Fired on hover or keyboard focus, before any click. Used to prefetch the
   * row's detail so opening it paints from cache. Must be cheap and
   * idempotent — it runs every time the pointer crosses a row.
   */
  onRowIntent?: (row: T) => void;
  emptyState?: React.ReactNode;
  className?: string;
  /** True while a background refetch is in flight — keeps the old rows readable. */
  dimmed?: boolean;
  /** Extra classes for a row — e.g. to highlight one that needs attention. */
  rowClassName?: (row: T) => string | undefined;
}) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--hairline)]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "px-4 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)] whitespace-nowrap",
                  col.numeric ? "text-right" : "text-left"
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          className={cn(
            "divide-y divide-[var(--hairline)] transition-opacity duration-150",
            dimmed && "opacity-55"
          )}
        >
          {rows.map((row, i) => (
            <tr
              key={getRowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onPointerEnter={onRowIntent ? () => onRowIntent(row) : undefined}
              onFocusCapture={onRowIntent ? () => onRowIntent(row) : undefined}
              className={cn(
                "transition-colors duration-150",
                onRowClick && "cursor-pointer hover:bg-[var(--surface-2)]",
                rowClassName?.(row)
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-2.5 align-middle text-[var(--text-2)]",
                    col.numeric && "tnum text-right"
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] px-4 py-2.5">
      <p className="tnum text-[12px] text-[var(--text-3)]">
        {total === 0 ? (
          "No results"
        ) : (
          <>
            <span className="text-[var(--text-2)]">
              {first.toLocaleString()}–{last.toLocaleString()}
            </span>{" "}
            of {total.toLocaleString()}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        {onLimitChange ? (
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
            Rows
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 text-[12px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
            >
              {[20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="tnum px-1 text-[12px] text-[var(--text-3)]">
            {page} / {pages}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
