import type { Money } from "./types";

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/**
 * Money never collapses to a single number. There is no FX rate anywhere in
 * the system, so summing across currencies would invent one. Every helper
 * here preserves the per-currency split.
 */

export interface MoneyEntry {
  currency: string;
  /** The raw string straight from Postgres numeric. Never parsed for display. */
  raw: string;
  /** Parsed only for sorting and chart geometry, never for display. */
  numeric: number;
  formatted: string;
}

const CURRENCY_ORDER = ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD"];

export function moneyEntries(money: Money | undefined | null): MoneyEntry[] {
  if (!money) return [];
  return Object.entries(money)
    .map(([currency, raw]) => ({
      currency,
      raw,
      numeric: Number.parseFloat(raw) || 0,
      formatted: formatCurrency(raw, currency),
    }))
    .sort((a, b) => {
      const ai = CURRENCY_ORDER.indexOf(a.currency);
      const bi = CURRENCY_ORDER.indexOf(b.currency);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.currency.localeCompare(b.currency);
    });
}

export function formatCurrency(raw: string, currency: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return `${raw} ${currency}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: n >= 1000 ? 0 : 2,
      minimumFractionDigits: n >= 1000 ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("en-US")}`;
  }
}

/** Compact form for tight cells: $84.2K, ₹19.8L-scale figures stay grouped. */
export function formatCurrencyCompact(raw: string, currency: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return `${raw} ${currency}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return `${currency} ${formatCompact(n)}`;
  }
}

/** True when the object exists but holds no currencies: "no money", not "no permission". */
export function isEmptyMoney(money: Money | undefined | null): boolean {
  return !!money && Object.keys(money).length === 0;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

export function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

export function formatCompact(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1000) return n.toLocaleString("en-US");
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/**
 * `null` means there was no baseline to compare against - a brand new market,
 * or the first period on record. That is not the same as 0% growth and must
 * not render as "0%".
 */
export function formatGrowth(
  pct: number | null | undefined
): { text: string; tone: "positive" | "danger" | "neutral"; known: boolean } {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return { text: "No baseline", tone: "neutral", known: false };
  }
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    tone: pct > 0 ? "positive" : pct < 0 ? "danger" : "neutral",
    known: true,
  };
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatShortDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/** SCREAMING_SNAKE or camelCase -> Sentence case. */
export function humanize(value: string): string {
  if (!value) return "";
  if (value === value.toUpperCase()) {
    const s = value.replace(/_/g, " ").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Trim a uuid for display without losing its identity as a handle. */
export function shortId(id: string | undefined | null, keep = 8): string {
  if (!id) return "—";
  if (id.length <= keep + 1) return id;
  // The API already truncates some ids with an ellipsis; do not double up.
  if (id.endsWith("…")) return id;
  return `${id.slice(0, keep)}…`;
}
