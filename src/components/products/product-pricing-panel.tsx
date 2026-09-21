"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Coins } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAdminMarkets,
  useProductPrices,
  useReplaceProductPrices,
} from "@/lib/api/hooks";
import { usePermissions } from "@/components/layout/authz-provider";
import { Button, Panel, Skeleton, Tooltip } from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  PriceRows,
  draftFromPrice,
  mapServerPriceErrors,
  toPriceInputs,
  unpricedDefaultMarket,
  validatePriceDrafts,
  type PriceDraft,
} from "./price-rows";
import type { ProductVariantRef } from "@/lib/types";

/**
 * The drop's market pricing.
 *
 * A table, edited as a whole and saved with `PUT .../prices` — the endpoint
 * the API's own guidance points a pricing table at. After an edit the client
 * knows the final state, not the sequence of changes that produced it, and
 * "these are the prices now" is the only statement that can express *dropping
 * a market*. So there are no per-row saves: one Save, one request.
 *
 * The minimum of one is enforced here as well as server-side, which is why
 * the last row's remove button is disabled rather than left to return a 409.
 */
export function ProductPricingPanel({
  productId,
  variants,
}: {
  productId: string;
  /** Resolves a variant price's label; variants themselves are read-only. */
  variants: ProductVariantRef[];
}) {
  const perms = usePermissions();
  const query = useProductPrices(productId);
  const save = useReplaceProductPrices(productId);

  /*
   * Only active markets are offerable: an archived or inactive one comes back
   * as PRODUCTS_PRICE_MARKET_INVALID, which names every bad market at once.
   *
   * This list is gated on reports-dashboards:read, which drop:manage does NOT
   * imply — so a drop manager can legitimately be refused it. That refusal
   * must not read as "this platform has no markets": the saved rows are still
   * shown, and only editing is withdrawn.
   */
  const marketsQuery = useAdminMarkets({ isActive: true, limit: 100 });
  const markets = React.useMemo(
    () => marketsQuery.data?.items ?? [],
    [marketsQuery.data]
  );
  const marketsFailed = marketsQuery.isError;

  // Writes need drop:manage platform-wide (admin-write-apis.md §0).
  const canWrite =
    perms.widestScope("drop") === "global" && perms.can("drop", "manage");
  // Nothing can be edited without knowing which markets exist and what they
  // settle in — the currency on every row is read off that list.
  const canEdit = canWrite && !marketsFailed;

  /*
   * The saved rows are the baseline; a draft exists only while the operator is
   * editing, and remembers which baseline it was forked from. That pairing is
   * what lets a refetch drop a stale draft without an effect writing state —
   * and without re-seeding the table under someone mid-edit.
   */
  const [draft, setDraft] = React.useState<{ from: string; rows: PriceDraft[] } | null>(
    null
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const prices = query.data;
  const variantLabel = React.useCallback(
    (variantId: string | null) =>
      variantId ? (variants.find((v) => v.id === variantId)?.label ?? null) : null,
    [variants]
  );

  const baseline = React.useMemo(
    () => (prices ?? []).map((p) => draftFromPrice(p, variantLabel(p.variantId))),
    [prices, variantLabel]
  );
  const baselineKey = React.useMemo(
    () =>
      JSON.stringify(
        baseline.map((d) => [d.priceId, d.amount, d.costOfGoods, d.isFree, d.status])
      ),
    [baseline]
  );

  const dirty = draft?.from === baselineKey;
  const rows = dirty ? draft.rows : baseline;
  // Errors describe the draft, so they go with it.
  const shown = dirty ? errors : {};
  const fallbackGap = unpricedDefaultMarket(rows, markets);

  const edit = (next: PriceDraft[]) => setDraft({ from: baselineKey, rows: next });

  const submit = () => {
    const found = validatePriceDrafts(rows);
    setErrors(found);
    if (Object.keys(found).length) return;

    save.mutate(toPriceInputs(rows), {
      onSuccess: () => {
        setDraft(null);
        toast.success(rows.length === 1 ? "Price saved" : `${rows.length} prices saved`);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 422) {
          // A 422 here is about the payload, not the markets. Mark the row the
          // server named, and show what arrived rather than the bare
          // "Request validation failed".
          setErrors(mapServerPriceErrors(err.fieldErrors, rows));
          toast.error(err.validationSummary ?? err.friendly);
          return;
        }
        toast.error(
          err instanceof ApiError ? err.friendly : "Could not save the pricing."
        );
      },
    });
  };

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
          Pricing{rows.length ? ` (${rows.length})` : ""}
        </p>
        {canEdit && dirty ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={save.isPending}
              onClick={() => {
                setDraft(null);
                setErrors({});
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={save.isPending}
              onClick={submit}
            >
              Save pricing
            </Button>
          </div>
        ) : null}
      </div>

      {query.isLoading || marketsQuery.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[8px]" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : markets.length === 0 && !marketsFailed ? (
        // Without a market there is nothing to price against, and the picker
        // would be an empty select. Say where markets come from instead.
        <EmptyState
          icon={Coins}
          title="No active markets"
          description="A price is scoped to a market, and the currency comes from it. Create or reactivate one under Markets first."
        />
      ) : rows.length === 0 && !canEdit ? (
        <EmptyState
          icon={Coins}
          title="No pricing"
          description="This drop carries no market price, so it is not purchasable anywhere."
        />
      ) : (
        <div className="space-y-3 p-3">
          {rows.length === 0 ? (
            <p className="rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-2)]">
              This drop carries no market price, so the storefront has nothing to show
              and nothing to charge. Add one below.
            </p>
          ) : null}

          <PriceRows
            drafts={rows}
            onChange={edit}
            markets={markets}
            errors={shown}
            disabled={!canEdit || save.isPending}
          />

          {marketsFailed ? (
            <p className="text-[11px] leading-relaxed text-[var(--warning)]">
              The market list could not be loaded, so pricing is read-only here:{" "}
              {marketsQuery.error instanceof ApiError
                ? marketsQuery.error.friendly
                : "the request failed."}
            </p>
          ) : null}

          {fallbackGap ? (
            <Tooltip content="A buyer whose country maps to no market falls back to the default one. With no live price there, that lookup finds nothing.">
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--warning)]">
                <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                <span>
                  {fallbackGap.code} is the default market and has no active price —
                  buyers outside every mapped country will not see this drop.
                </span>
              </p>
            </Tooltip>
          ) : null}

          <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
            The currency is the market&rsquo;s and is never sent — send the amount, read
            the currency back. Saving replaces the whole list, so a market removed here
            stops being priced.
          </p>
        </div>
      )}
    </Panel>
  );
}
