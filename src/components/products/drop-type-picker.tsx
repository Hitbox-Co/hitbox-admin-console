"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useDropTypes } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { ModeBadge, Swatch } from "./variant-bits";
import type { DropType } from "@/lib/types";

/**
 * Pick a drop's type from GET /admin/drop-types — the first step of Add drop
 * (drop-types-and-variants.md §16). Each card shows what the type varies by,
 * so the operator chooses knowing which variants the drop will be able to
 * have. Only active types are listed: an inactive one cannot be picked for a
 * new drop (404 PRODUCTS_DROP_TYPE_NOT_FOUND).
 *
 * `allowUntyped` adds the legacy "no type" choice — offered on Edit only when
 * the drop is already untyped, so nothing new is created without a type.
 */
export function DropTypePicker({
  value,
  onChange,
  disabled,
  allowUntyped,
  error,
}: {
  /** A type code, or "" for untyped. */
  value: string;
  onChange: (code: string, type: DropType | null) => void;
  disabled?: boolean;
  allowUntyped?: boolean;
  error?: string;
}) {
  const query = useDropTypes();
  const types = query.data ?? [];

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-[10px] bg-[var(--surface-2)]" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] text-[var(--text-2)]">
        Drop types could not be loaded.{" "}
        {query.error instanceof ApiError ? query.error.friendly : "The request failed."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Drop type"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {types.map((t) => (
          <TypeCard
            key={t.code}
            type={t}
            selected={value === t.code}
            disabled={disabled}
            onSelect={() => onChange(t.code, t)}
          />
        ))}
        {allowUntyped ? (
          <button
            type="button"
            role="radio"
            aria-checked={value === ""}
            disabled={disabled}
            onClick={() => onChange("", null)}
            className={cardClass(value === "", disabled)}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-[var(--text-1)]">Untyped (legacy)</span>
              {value === "" ? <Check className="h-3.5 w-3.5 text-[var(--accent-text)]" /> : null}
            </span>
            <span className="mt-1 block text-[11.5px] leading-relaxed text-[var(--text-3)]">
              No variant rules. How drops worked before types existed.
            </span>
          </button>
        ) : null}
      </div>
      {types.length === 0 ? (
        <p className="text-[12px] text-[var(--text-3)]">
          No active drop types. A System Admin can create them under Drop types.
        </p>
      ) : null}
      {error ? <p className="text-[11px] text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function cardClass(selected: boolean, disabled?: boolean) {
  return cn(
    "pressable rounded-[10px] border px-3 py-2.5 text-left transition-colors",
    selected
      ? "border-[var(--accent)] bg-[var(--accent-dim)]"
      : "border-[var(--hairline)] bg-[var(--surface-2)] hover:border-[var(--hairline-strong)]",
    disabled && "cursor-not-allowed opacity-60"
  );
}

function TypeCard({
  type: t,
  selected,
  disabled,
  onSelect,
}: {
  type: DropType;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const dims = t.dimensions.filter((d) => !d.archived);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cardClass(selected, disabled)}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--text-1)]">{t.name}</span>
        <span className="flex items-center gap-1.5">
          <ModeBadge mode={t.variantMode} />
          {selected ? <Check className="h-3.5 w-3.5 text-[var(--accent-text)]" /> : null}
        </span>
      </span>
      {t.description ? (
        <span className="mt-1 line-clamp-2 block text-[11.5px] leading-relaxed text-[var(--text-3)]">
          {t.description}
        </span>
      ) : null}
      {dims.length ? (
        <span className="mt-1.5 block space-y-0.5">
          {dims.map((d) => {
            const vals = d.values.filter((v) => !v.archived);
            return (
              <span key={d.code} className="flex flex-wrap items-center gap-1 text-[11px] text-[var(--text-2)]">
                <span className="text-[var(--text-3)]">
                  {d.label}
                  {d.required ? "" : " (optional)"}:
                </span>
                {d.displayType === "COLOR"
                  ? vals.slice(0, 8).map((v) => <Swatch key={v.code} hex={v.hexCode} size={10} />)
                  : vals
                      .slice(0, 6)
                      .map((v) => v.label)
                      .join(" · ")}
                {vals.length > (d.displayType === "COLOR" ? 8 : 6) ? " …" : ""}
                {d.allowCustomValues ? <span className="text-[var(--text-3)]">+ custom</span> : null}
              </span>
            );
          })}
        </span>
      ) : null}
    </button>
  );
}
