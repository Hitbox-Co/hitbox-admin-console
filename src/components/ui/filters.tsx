"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { humanize } from "@/lib/format";
import { Button, Input } from "./primitives";

/** A labelled select, sized to sit in the filter row. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  className,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: string[];
  allLabel?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex items-center gap-1.5", className)}>
      <span className="text-[12px] text-[var(--text-3)]">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {humanize(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 pl-7 pr-7"
      />
      {value ? (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[4px] p-0.5 text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/** One row of filters above the table, with a reset affordance. */
export function FilterRow({
  children,
  onReset,
  active,
}: {
  children: React.ReactNode;
  onReset?: () => void;
  active?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--hairline)] px-4 py-2.5">
      {children}
      {onReset && active ? (
        <Button variant="ghost" size="sm" onClick={onReset} className="ml-auto">
          <X className="h-3 w-3" />
          Reset
        </Button>
      ) : null}
    </div>
  );
}

/** Keeps page/limit and filters in one place for a list route. */
export function useListState<T extends Record<string, string | undefined>>(
  initialFilters: T
) {
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [filters, setFiltersState] = React.useState<T>(initialFilters);

  const setFilter = React.useCallback((key: keyof T, value: string | undefined) => {
    setFiltersState((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const reset = React.useCallback(() => {
    setFiltersState(initialFilters);
    setPage(1);
    // initialFilters is a literal at the call site; re-creating it each render
    // would loop, so it is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = Object.values(filters).some((v) => v !== undefined && v !== "");

  return {
    page,
    setPage,
    limit,
    setLimit: (n: number) => {
      setLimit(n);
      setPage(1);
    },
    filters,
    setFilter,
    reset,
    active,
    params: { page, limit, ...filters },
  };
}
