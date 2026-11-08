"use client";

import * as React from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Badge, Button, Input, Mono, Tooltip } from "@/components/ui/primitives";
import type {
  AdminMarket,
  ProductPrice,
  ProductPriceInput,
  ProductPriceStatus,
} from "@/lib/types";

/**
 * The pricing table, shared by Add drop (step 2) and the drop's own pricing
 * panel — one editor, so the rules are stated once.
 *
 * Four things from product-upload-api.md §3 shape it:
 *
 *  1. **At least one price is compulsory.** A drop with no price is not
 *     purchasable anywhere: the storefront reads ProductPrice for the buyer's
 *     market and finds nothing to show and nothing to charge. Every previous
 *     route to that state was a half-finished form, so `prices` is required on
 *     create and the minimum survives every replace.
 *  2. **There is no `currency` field.** The currency is the market's. Sending
 *     one per price would let a drop be quoted in GBP inside a market that
 *     settles in INR, and no constraint in the schema would catch it — so the
 *     currency here is *shown*, read off the chosen market, never *sent*.
 *  3. **Money stays a string.** A price that round-trips through a JavaScript
 *     float can arrive as 1999.9899999999998, and the decimal column would
 *     round it silently — on the column that decides what a buyer is charged.
 *     Amounts are held and sent as the typed text, never parsed to a Number.
 *  4. **One row per market.** `@@unique([productId, variantId, marketId])`
 *     does not actually hold for base prices — `variantId` is null and NULLs
 *     never collide in a Postgres unique index — so duplicates are refused in
 *     the API layer, and pre-empted here.
 */

export interface PriceDraft {
  /** Stable React key; not sent. */
  key: string;
  /** Null for a row that has never been saved. */
  priceId: string | null;
  marketCode: string;
  /** Read off the market, shown next to the amount, never sent. */
  currency: string;
  /** The typed text, carried to the API verbatim. */
  amount: string;
  costOfGoods: string;
  isFree: boolean;
  status: ProductPriceStatus;
  /**
   * Non-null on a row that prices one variant rather than the whole product.
   *
   * These rows are read-only here but MUST survive the round trip: PUT
   * replaces the list wholesale, so sending only the base rows would silently
   * delete every variant price the drop has.
   */
  variantId: string | null;
  variantLabel: string | null;
}

let seq = 0;
const nextKey = () => `draft-${++seq}`;

export function newPriceDraft(marketCode = "", currency = ""): PriceDraft {
  return {
    key: nextKey(),
    priceId: null,
    marketCode,
    currency,
    amount: "",
    costOfGoods: "",
    isFree: false,
    status: "ACTIVE",
    variantId: null,
    variantLabel: null,
  };
}

export function draftFromPrice(
  price: ProductPrice,
  variantLabel: string | null = null
): PriceDraft {
  return {
    key: price.priceId,
    priceId: price.priceId,
    marketCode: price.marketCode,
    currency: price.currency,
    // A free row reads back as "0"; showing that in the amount box would
    // invite an operator to clear the free flag and leave a row carrying
    // neither an amount nor isFree — the one shape the API will not create.
    amount: price.isFree ? "" : (price.amount ?? ""),
    costOfGoods: price.costOfGoods ?? "",
    isFree: price.isFree,
    status: price.status,
    variantId: price.variantId,
    variantLabel,
  };
}

/**
 * The wire shape.
 *
 * An empty cost of goods is OMITTED rather than sent as null. `null` is
 * documented as the clear only on PATCH of a stored row; both of the calls
 * made here — POST /products and PUT /prices — write the row from scratch, so
 * leaving the key out already means "no cost of goods" and does not depend on
 * the create schema accepting a null it was never documented to take.
 */
export function toPriceInputs(drafts: PriceDraft[]): ProductPriceInput[] {
  return drafts.map((d) => {
    const costOfGoods = d.costOfGoods.trim();
    return {
      marketCode: d.marketCode,
      // `isFree` cannot be combined with `amount` — exactly one is sent.
      ...(d.isFree ? { isFree: true } : { amount: d.amount.trim() }),
      ...(costOfGoods ? { costOfGoods } : {}),
      status: d.status,
      ...(d.variantId ? { variantId: d.variantId } : {}),
    };
  });
}

/**
 * Up to 10 digits with at most 2 decimal places, matching the column.
 *
 * (§3 describes the column as `Decimal(12, 2)` in one place and "10 digits and
 * 2 decimal places" in another. The tighter of the two is used here: the
 * server is the authority either way, and being asked for a shorter number is
 * a better failure than a 422 after the form is filled in.)
 */
const MONEY = /^\d{1,8}(\.\d{1,2})?$/;

/** Keyed by draft key, plus a form-level "prices" entry. */
export function validatePriceDrafts(drafts: PriceDraft[]): Record<string, string> {
  const errors: Record<string, string> = {};

  if (drafts.length === 0) {
    errors.prices = "A drop needs at least one market price to be purchasable.";
    return errors;
  }

  // The composite key: two base prices for the same market collide, a base
  // price and a variant price for that market do not.
  const seen = new Map<string, number>();
  for (const d of drafts) {
    const dupKey = `${d.marketCode}::${d.variantId ?? ""}`;
    seen.set(dupKey, (seen.get(dupKey) ?? 0) + 1);
  }

  for (const d of drafts) {
    if (!d.marketCode) {
      errors[d.key] = "Choose a market.";
      continue;
    }
    if ((seen.get(`${d.marketCode}::${d.variantId ?? ""}`) ?? 0) > 1) {
      errors[d.key] = "This market is priced twice. One row per market.";
      continue;
    }
    if (d.costOfGoods.trim() && !MONEY.test(d.costOfGoods.trim())) {
      errors[d.key] = "Cost of goods: up to 10 digits with at most 2 decimals.";
      continue;
    }
    // `isFree` cannot be combined with an amount, so a free row's amount box
    // is disabled rather than validated.
    if (d.isFree) continue;
    if (!d.amount.trim()) {
      errors[d.key] = "An amount, or mark it free.";
      continue;
    }
    if (!MONEY.test(d.amount.trim())) {
      errors[d.key] = "Up to 10 digits with at most 2 decimal places.";
    }
  }

  return errors;
}

/**
 * Re-key a 422's field errors onto the rows on screen.
 *
 * The server reports price issues by path — `prices.0.amount`, or `prices`
 * for the list as a whole — and `PriceRows` shows errors by draft key. Without
 * this the operator gets a toast naming `prices.0.amount` and a table with
 * nothing marked on it.
 */
export function mapServerPriceErrors(
  fieldErrors: Record<string, string>,
  drafts: PriceDraft[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, message] of Object.entries(fieldErrors)) {
    if (path === "prices") {
      out.prices = message;
      continue;
    }
    const match = /^prices[.[](\d+)/.exec(path);
    if (!match) continue;
    const row = drafts[Number(match[1])];
    if (row && !(row.key in out)) out[row.key] = message;
  }
  return out;
}

export function PriceRows({
  drafts,
  onChange,
  markets,
  errors,
  disabled,
}: {
  drafts: PriceDraft[];
  onChange: (next: PriceDraft[]) => void;
  /** Active markets only — an archived or inactive one is refused server-side. */
  markets: AdminMarket[];
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const patch = (key: string, next: Partial<PriceDraft>) =>
    onChange(drafts.map((d) => (d.key === key ? { ...d, ...next } : d)));

  const remove = (key: string) => onChange(drafts.filter((d) => d.key !== key));

  const priced = new Set(drafts.filter((d) => !d.variantId).map((d) => d.marketCode));
  const unpriced = markets.filter((m) => !priced.has(m.code));

  const add = () => {
    const next = unpriced[0];
    onChange([...drafts, newPriceDraft(next?.code ?? "", next?.currency ?? "")]);
  };

  return (
    <div className="space-y-2">
      {errors.prices ? (
        <p className="text-[11px] text-[var(--danger)]">{errors.prices}</p>
      ) : null}

      {drafts.map((d) => {
        const error = errors[d.key];
        const trimmed = d.amount.trim();
        return (
          <div
            key={d.key}
            className="space-y-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              {d.variantId ? (
                /*
                  Variant rows are carried through the PUT untouched. The
                  backend exposes no endpoint to author a variant, so one that
                  exists was priced by another route, and leaving it out of a
                  wholesale replace would be a silent delete.
                */
                <Tooltip content="A variant price. Variants cannot be authored from the console, so this row is shown for completeness and saved back unchanged.">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Tag className="h-3 w-3 shrink-0 text-[var(--text-3)]" aria-hidden />
                    <span className="truncate text-[12.5px] text-[var(--text-1)]">
                      {d.marketCode} · {d.variantLabel ?? "Variant"}
                    </span>
                  </span>
                </Tooltip>
              ) : d.priceId ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <Mono className="text-[10px]">{d.marketCode}</Mono>
                  <span className="truncate text-[12.5px] text-[var(--text-1)]">
                    {markets.find((m) => m.code === d.marketCode)?.name ?? "Market"}
                  </span>
                </span>
              ) : (
                <select
                  aria-label="Market"
                  value={d.marketCode}
                  disabled={disabled}
                  onChange={(e) => {
                    const m = markets.find((mk) => mk.code === e.target.value);
                    patch(d.key, {
                      marketCode: e.target.value,
                      currency: m?.currency ?? "",
                    });
                  }}
                  className="h-8 min-w-0 flex-1 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                >
                  <option value="">Choose a market…</option>
                  {markets.map((m) => (
                    <option key={m.id} value={m.code}>
                      {m.code} — {m.name} ({m.currency})
                      {m.isDefault ? " · default" : ""}
                    </option>
                  ))}
                </select>
              )}

              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {d.currency ? <Badge tone="neutral">{d.currency}</Badge> : null}
                <Tooltip
                  content={
                    drafts.length === 1
                      ? "A drop must keep at least one market price."
                      : "Remove this market. It is dropped when you save."
                  }
                >
                  <span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${d.marketCode || "market"}`}
                      disabled={disabled || drafts.length === 1}
                      onClick={() => remove(d.key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </Tooltip>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor={`amt-${d.key}`}
                  className="block text-[11px] text-[var(--text-3)]"
                >
                  Amount
                </label>
                <Input
                  id={`amt-${d.key}`}
                  inputMode="decimal"
                  value={d.isFree ? "" : d.amount}
                  invalid={!!error}
                  disabled={disabled || d.isFree}
                  placeholder={d.isFree ? "Free" : "1999.00"}
                  onChange={(e) => patch(d.key, { amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={`cog-${d.key}`}
                  className="block text-[11px] text-[var(--text-3)]"
                >
                  Cost of goods
                </label>
                <Input
                  id={`cog-${d.key}`}
                  inputMode="decimal"
                  value={d.costOfGoods}
                  disabled={disabled}
                  placeholder="Optional"
                  onChange={(e) => patch(d.key, { costOfGoods: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={d.isFree}
                  disabled={disabled}
                  onChange={(e) => patch(d.key, { isFree: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                Free in this market
              </label>

              <Tooltip content="Disabled stages a price without making it live — the way to stop selling in a market without dropping its pricing.">
                <span className="flex items-center gap-1.5">
                  <label
                    htmlFor={`st-${d.key}`}
                    className="text-[12px] text-[var(--text-3)]"
                  >
                    Status
                  </label>
                  <select
                    id={`st-${d.key}`}
                    value={d.status}
                    disabled={disabled}
                    onChange={(e) =>
                      patch(d.key, { status: e.target.value as ProductPriceStatus })
                    }
                    className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-1.5 text-[12px] text-[var(--text-1)]"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="DISABLED">Disabled</option>
                  </select>
                </span>
              </Tooltip>

              {/* The typed string read back as the market's currency renders
                  it — a cheap check that 1999.00 was not typed as 199900. */}
              {!d.isFree && d.currency && MONEY.test(trimmed) ? (
                <span className="tnum ml-auto text-[11.5px] text-[var(--text-3)]">
                  {formatCurrency(trimmed, d.currency)}
                </span>
              ) : null}
            </div>

            {error ? <p className="text-[11px] text-[var(--danger)]">{error}</p> : null}
          </div>
        );
      })}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || unpriced.length === 0}
        onClick={add}
      >
        <Plus className="h-3.5 w-3.5" />
        {unpriced.length === 0 ? "Every market is priced" : "Add a market"}
      </Button>
    </div>
  );
}

/**
 * A drop priced only in IN is invisible to a US buyer's price lookup: the
 * storefront resolves the buyer's country to a market through MarketCountry
 * and falls back to the DEFAULT market when the country maps nowhere. So a
 * default market with no live price is worth saying out loud rather than
 * leaving to be discovered as "nobody can buy this".
 */
export function unpricedDefaultMarket(
  drafts: PriceDraft[],
  markets: AdminMarket[]
): AdminMarket | null {
  const fallback = markets.find((m) => m.isDefault);
  if (!fallback) return null;
  const priced = drafts.some(
    (d) => !d.variantId && d.marketCode === fallback.code && d.status === "ACTIVE"
  );
  return priced ? null : fallback;
}
