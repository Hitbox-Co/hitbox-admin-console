"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Badge, Tooltip, type BadgeTone } from "@/components/ui/primitives";
import type { DropTypeRef, VariantMode, VariantOption } from "@/lib/types";

/**
 * Small shared pieces for drop types and variants
 * (drop-types-and-variants.md) — used by the drop page, the mint dialog, the
 * Add/Edit drop forms and the drop-type admin screens.
 */

/** Variants may be added or removed only in these drop statuses (§10). */
export const VARIANTS_EDITABLE = new Set(["DRAFT", "REJECTED"]);

export const MODE_COPY: Record<VariantMode, { label: string; tone: BadgeTone; help: string }> = {
  NONE: {
    label: "No variants",
    tone: "neutral",
    help: "One sellable item. Units are minted against the drop itself.",
  },
  OPTIONAL: {
    label: "Variants optional",
    tone: "info",
    help: "May have variants. Units can be minted with or without one.",
  },
  REQUIRED: {
    label: "Variants required",
    tone: "accent",
    help: "Needs at least one active variant to submit, and every unit belongs to a variant.",
  },
};

export function ModeBadge({ mode }: { mode: VariantMode }) {
  const m = MODE_COPY[mode];
  return (
    <Tooltip content={m.help}>
      <span>
        <Badge tone={m.tone}>{m.label}</Badge>
      </span>
    </Tooltip>
  );
}

/** The drop's type as a badge; "Legacy" when it has none. */
export function DropTypeBadge({ type }: { type: DropTypeRef | null | undefined }) {
  if (!type) {
    return (
      <Tooltip content="Created before drop types existed — no variant rules apply.">
        <span>
          <Badge tone="neutral" outline>
            Untyped
          </Badge>
        </span>
      </Tooltip>
    );
  }
  return <Badge tone="neutral">{type.name}</Badge>;
}

/** A colour dot. `null` hex renders nothing — no hex means no swatch. */
export function Swatch({
  hex,
  size = 12,
  className,
}: {
  hex: string | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!hex) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full border border-[var(--hairline-strong)]",
        className
      )}
      style={{ width: size, height: size, backgroundColor: hex }}
    />
  );
}

/** A variant's options as compact chips: swatch + label. */
export function OptionChips({ options }: { options: VariantOption[] | undefined }) {
  if (!options?.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {options.map((o) => (
        <span
          key={o.dimension}
          title={`${o.dimensionLabel ?? o.dimension}: ${o.label} (${o.value})`}
          className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--surface-3)] px-1.5 py-px text-[10.5px] text-[var(--text-2)]"
        >
          <Swatch hex={o.hexCode} size={9} />
          {o.label}
        </span>
      ))}
    </span>
  );
}

/**
 * `#abc`, `abc`, `#aabbcc` or `aabbcc` → `#AABBCC` — the forms the server
 * accepts (drop-types-and-variants.md §5). null when it is not a hex colour.
 */
export function normalizeHex(text: string): string | null {
  const t = text.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(t)) {
    return `#${t
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase()}`;
  }
  return null;
}

/**
 * A colour as both a picker and a typed hex code — so a brand colour such as
 * #1A1A1A can be entered exactly instead of hunted for in the picker. The
 * text is the source of truth; the picker follows it while it is valid.
 */
export function HexColorInput({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id?: string;
  /** The text as typed, e.g. "#1A1A1A". */
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const valid = normalizeHex(value);
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        aria-label="Pick a colour"
        value={(valid ?? "#888888").toLowerCase()}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-8 w-9 shrink-0 cursor-pointer rounded-[6px] border border-[var(--hairline)] bg-transparent disabled:opacity-40"
      />
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^#0-9a-fA-F]/g, "").slice(0, 7))}
        placeholder="#1A1A1A"
        spellCheck={false}
        aria-invalid={invalid || (value !== "" && !valid) || undefined}
        className={cn(
          "h-8 w-[92px] rounded-[6px] border bg-[var(--surface-1)] px-2 font-mono text-[12px] uppercase text-[var(--text-1)] disabled:opacity-40",
          invalid || (value !== "" && !valid)
            ? "border-[var(--danger)]"
            : "border-[var(--hairline)]"
        )}
      />
    </span>
  );
}
