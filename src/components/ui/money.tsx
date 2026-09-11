"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatCurrency, formatCurrencyCompact, moneyEntries } from "@/lib/format";
import { useStoredValue } from "@/lib/stored-value";
import type { Money } from "@/lib/types";
import { Tooltip } from "./primitives";

/**
 * Money display.
 *
 * There is no FX rate anywhere in the system, so nothing here ever adds two
 * currencies together. A multi-currency figure shows one currency at a time
 * (the operator picks which) with the rest available on hover, and an empty
 * object reads as "no money in this window" — which is different again from
 * the key being absent, handled by NotPermitted.
 */

const CurrencyContext = React.createContext<{
  preferred: string | null;
  setPreferred: (c: string | null) => void;
}>({ preferred: null, setPreferred: () => {} });

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [preferred, setPreferred] = useStoredValue("hitbox.currency");

  const value = React.useMemo(
    () => ({ preferred, setPreferred }),
    [preferred, setPreferred]
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return React.useContext(CurrencyContext);
}

/** Picks the entry to lead with: the operator's choice when present. */
function leadEntry(money: Money | undefined, preferred: string | null) {
  const entries = moneyEntries(money);
  if (entries.length === 0) return { lead: null, rest: [], entries };
  const chosen = preferred ? entries.find((e) => e.currency === preferred) : undefined;
  const lead = chosen ?? entries[0];
  return { lead, rest: entries.filter((e) => e.currency !== lead.currency), entries };
}

export function MoneyValue({
  money,
  compact,
  className,
  size = "md",
}: {
  money: Money | undefined;
  compact?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { preferred } = useCurrency();
  const { lead, rest } = leadEntry(money, preferred);

  const sizes = {
    sm: "text-[13px]",
    md: "text-[15px]",
    lg: "text-[26px] leading-[1.15]",
  };

  if (!money || Object.keys(money).length === 0) {
    // The section is visible, there simply was no money in this window.
    return (
      <span className={cn("tnum text-[var(--text-3)]", sizes[size], className)}>
        —
      </span>
    );
  }

  const text = compact
    ? formatCurrencyCompact(lead!.raw, lead!.currency)
    : formatCurrency(lead!.raw, lead!.currency);

  const body = (
    <span
      className={cn(
        "tnum inline-flex items-baseline gap-1.5 font-semibold tracking-[-0.02em] text-[var(--text-1)]",
        sizes[size],
        className
      )}
    >
      {text}
      {rest.length > 0 ? (
        <span className="rounded-[4px] bg-[var(--surface-2)] px-1 text-[10px] font-medium text-[var(--text-3)]">
          +{rest.length}
        </span>
      ) : null}
    </span>
  );

  if (rest.length === 0) return body;

  return (
    <Tooltip
      side="top"
      content={
        <div className="space-y-1">
          <p className="text-[11px] text-[var(--text-3)]">
            Shown per currency — never summed.
          </p>
          {[lead!, ...rest].map((e) => (
            <div key={e.currency} className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-[11px] text-[var(--text-3)]">
                {e.currency}
              </span>
              <span className="tnum text-[12px] text-[var(--text-1)]">{e.formatted}</span>
            </div>
          ))}
        </div>
      }
    >
      <span className="cursor-help border-b border-dotted border-[var(--hairline-strong)]">
        {body}
      </span>
    </Tooltip>
  );
}

/** Every currency stacked — used where the page has room to be explicit. */
export function MoneyBreakdown({
  money,
  className,
}: {
  money: Money | undefined;
  className?: string;
}) {
  const entries = moneyEntries(money);
  if (entries.length === 0) {
    return <p className={cn("text-[13px] text-[var(--text-3)]", className)}>—</p>;
  }
  return (
    <div className={cn("space-y-1", className)}>
      {entries.map((e) => (
        <div key={e.currency} className="flex items-baseline justify-between gap-4">
          <span className="font-mono text-[11px] text-[var(--text-3)]">{e.currency}</span>
          <span className="tnum text-[13px] font-medium text-[var(--text-1)]">
            {e.formatted}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Lets the operator choose which currency leads across the console. */
export function CurrencyPicker({ available }: { available: string[] }) {
  const { preferred, setPreferred } = useCurrency();
  if (available.length <= 1) return null;

  return (
    <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
      <span className="sr-only">Display currency</span>
      <select
        value={preferred ?? ""}
        onChange={(e) => setPreferred(e.target.value || null)}
        className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
      >
        <option value="">Default currency</option>
        {available.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Collects every currency present across a set of money objects. */
export function currenciesIn(...monies: (Money | undefined)[]): string[] {
  const set = new Set<string>();
  for (const m of monies) {
    if (!m) continue;
    for (const c of Object.keys(m)) set.add(c);
  }
  return [...set].sort();
}
