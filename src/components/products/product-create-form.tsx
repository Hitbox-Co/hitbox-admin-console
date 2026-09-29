"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Boxes, Coins, Info, ShieldAlert } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAdminMarkets, useCreateProduct } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { Button, Field, Input, Panel } from "@/components/ui/primitives";
import {
  PriceRows,
  mapServerPriceErrors,
  newPriceDraft,
  toPriceInputs,
  unpricedDefaultMarket,
  validatePriceDrafts,
  type PriceDraft,
} from "./price-rows";
import {
  EMPTY_DETAILS,
  ProductDetailsFields,
  detailsToInput,
  validateDetails,
  type ProductDetailsDraft,
} from "./product-details-fields";
import { isOwnedDrop } from "@/lib/mint-gate";
import type { ProductCreateInput } from "@/lib/types";

/**
 * Add drop — the catalog record, its market pricing, then its first
 * serialized units.
 *
 *   Drop information → Pricing → SKUs → Save
 *
 * The steps are ONE request. `POST /admin/products` writes the product,
 * its prices and its edition in a single transaction, so the form either
 * produces a complete drop or produces nothing.
 *
 * Pricing is a step because `prices` is **required** with at least one entry
 * (product-upload-api.md §3). Prices are written first inside the server's
 * transaction, so a failure there aborts before any unit is minted.
 *
 * The SKUs step exists ONLY for an unowned drop (no artist, no brand). A drop
 * with an owner may not be minted until that owner approves it
 * (drop-approval-lifecycle.md §10) — a `skus` block for one is a 400
 * PRODUCTS_NOT_APPROVED — so for those the form is two steps and saves from
 * Pricing: create → submit for review → owner approves → Add SKUs on the drop.
 *
 * Artwork is NOT here: a presign needs the owning record's id, which does not
 * exist until this request returns. Images are attached from the drop's own
 * gallery panel, which opens straight after this saves.
 *
 * The drop is created as DRAFT. Moving it onward is the review workflow's
 * job — submit, decide, publish — never a field on this form.
 */

const MAX_INLINE_MINT = 1000;

type Step = "details" | "pricing" | "units";

export function ProductCreateForm() {
  const router = useRouter();
  const create = useCreateProduct();
  const [step, setStep] = React.useState<Step>("details");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [details, setDetails] = React.useState<ProductDetailsDraft>(EMPTY_DETAILS);

  // Only active markets are offerable: an archived or inactive one comes back
  // as PRODUCTS_PRICE_MARKET_INVALID.
  const marketsQuery = useAdminMarkets({ isActive: true, limit: 100 });
  const markets = React.useMemo(() => marketsQuery.data?.items ?? [], [marketsQuery.data]);

  /*
   * Null until the operator touches the table, so the opening row is DERIVED
   * from the market list — seeded with the default market, the one a buyer
   * falls back to when their country maps nowhere.
   */
  const [priceDraft, setPrices] = React.useState<PriceDraft[] | null>(null);
  const seededPrices = React.useMemo(() => {
    if (markets.length === 0) return [];
    const seed = markets.find((m) => m.isDefault) ?? markets[0];
    return [newPriceDraft(seed.code, seed.currency)];
  }, [markets]);
  const prices = priceDraft ?? seededPrices;
  const fallbackGap = unpricedDefaultMarket(prices, markets);

  const [mintNow, setMintNow] = React.useState(true);
  const [skuCount, setSkuCount] = React.useState("");

  const supplyN = details.totalSupply ? Number(details.totalSupply) : 0;
  const countN = skuCount ? Number(skuCount) : 0;
  // Derived, not stored: picking an owner on step 1 after ticking the box
  // must still keep the `skus` block out of the request.
  const owned = isOwnedDrop({
    artistId: details.artistId || null,
    organizationId: details.organizationId || null,
  });
  const mintAtCreate = mintNow && !owned;

  const leave = () => router.push("/products");

  const validateUnits = () => {
    const next: Record<string, string> = {};
    if (mintAtCreate) {
      if (!Number.isInteger(countN) || countN < 1 || countN > MAX_INLINE_MINT) {
        next.skuCount = `A whole number from 1 to ${formatNumber(MAX_INLINE_MINT)}.`;
      } else if (supplyN > 0 && countN > supplyN) {
        // PRODUCTS_SUPPLY_EXCEEDED — the inline block cannot exceed the
        // drop's own declared supply.
        next.skuCount = `More than the declared supply of ${formatNumber(supplyN)}.`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    if (step === "details") {
      const next = validateDetails(details, "create");
      setErrors(next);
      if (Object.keys(next).length === 0) setStep("pricing");
      return;
    }
    if (step === "pricing") {
      const next = validatePriceDrafts(prices);
      setErrors(next);
      if (Object.keys(next).length > 0) return;
      // An owned drop has no SKUs step — it saves from here.
      if (!owned) {
        setStep("units");
        return;
      }
    } else if (!validateUnits()) {
      return;
    }

    const payload: ProductCreateInput = {
      ...detailsToInput(details),
      groupCode: details.groupCode || undefined,
      // Amounts go as the typed STRINGS: a price that round-trips through a
      // float can arrive as 1999.9899999999998.
      prices: toPriceInputs(prices),
      ...(mintAtCreate && countN > 0 ? { skus: { count: countN } } : {}),
    };

    create.mutate(payload, {
      onSuccess: (product) => {
        toast.success(
          mintAtCreate && countN > 0
            ? `${product.name} created with ${formatNumber(countN)} units`
            : owned
              ? `${product.name} created — submit it for review next`
              : `${product.name} created`
        );
        // Straight into the new drop, where the gallery and Add SKUs live.
        router.push(`/products/${product.id}`);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 422) {
          const fields = err.fieldErrors;
          setErrors({ ...fields, ...mapServerPriceErrors(fields, prices) });
          // Send the operator to the step that owns the offending input.
          const keys = Object.keys(fields);
          if (keys.some((k) => k.startsWith("prices"))) setStep("pricing");
          else if (keys.some((k) => !k.startsWith("skus"))) setStep("details");
          toast.error(err.validationSummary ?? err.friendly);
          return;
        }
        toast.error(err instanceof ApiError ? err.friendly : "Could not create the drop.");
      },
    });
  };

  return (
    <Panel className="mx-auto max-w-3xl overflow-hidden">
      <Steps step={step} withUnits={!owned} />

      <form onSubmit={submit}>
        <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          {step === "details" ? (
            <>
              <ProductDetailsFields
                value={details}
                onChange={setDetails}
                errors={errors}
                mode="create"
                disabled={create.isPending}
              />
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
                <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
                The drop is created as a <strong>Draft</strong>. Submitting it for
                review, the owner&rsquo;s decision and publishing happen on the drop
                itself afterwards.
              </p>
            </>
          ) : step === "pricing" ? (
            marketsQuery.isLoading ? (
              <p className="text-[12px] text-[var(--text-3)]">Loading markets…</p>
            ) : markets.length === 0 ? (
              <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]">
                <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--danger)]" aria-hidden />
                <span>
                  {marketsQuery.isError ? (
                    <>
                      The market list could not be loaded, so this drop cannot be
                      priced — and a drop cannot be created without a price.{" "}
                      {marketsQuery.error instanceof ApiError
                        ? marketsQuery.error.friendly
                        : "The request failed."}
                    </>
                  ) : (
                    <>
                      No active market exists, so this drop cannot be priced — and a
                      drop cannot be created without a price. Create one under{" "}
                      <strong>Markets</strong> first.
                    </>
                  )}
                </span>
              </p>
            ) : (
              <>
                <PriceRows
                  drafts={prices}
                  onChange={setPrices}
                  markets={markets}
                  errors={errors}
                  disabled={create.isPending}
                />

                {fallbackGap ? (
                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--warning)]">
                    <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                    <span>
                      {fallbackGap.code} is the default market and has no active price.
                      A buyer whose country maps to no market falls back to it, and
                      that lookup will find nothing.
                    </span>
                  </p>
                ) : null}

                <div className="space-y-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
                  <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                    <Coins className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      The currency belongs to the market, not the price — send the
                      amount, read the currency back. A drop priced only in one market
                      is invisible to buyers resolved into any other.
                    </span>
                  </p>
                  <p className="flex items-start gap-2 border-t border-[var(--hairline)] pt-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                    <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      At least one price is required — and publishing later needs at
                      least one <strong>active</strong> price.
                    </span>
                  </p>
                </div>

                {owned ? (
                  <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]">
                    <Boxes className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
                    <span>
                      <strong className="font-medium text-[var(--text-1)]">
                        Units come after approval.
                      </strong>{" "}
                      This drop names an artist or a brand, so it is saved with no units.
                      Submit it for review from its page; once the owner approves, add SKUs
                      from Serialized units.
                    </span>
                  </p>
                ) : null}
              </>
            )
          ) : (
            <>
              <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={mintNow}
                  onChange={(e) => setMintNow(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                Mint the opening edition now
              </label>

              {mintNow ? (
                <Field
                  label="How many units"
                  htmlFor="p-skus"
                  error={errors.skuCount}
                  required
                  hint={
                    supplyN > 0
                      ? `Up to ${formatNumber(Math.min(MAX_INLINE_MINT, supplyN))} — the declared supply is ${formatNumber(supplyN)}.`
                      : `Up to ${formatNumber(MAX_INLINE_MINT)} in one go.`
                  }
                >
                  <Input
                    id="p-skus"
                    inputMode="numeric"
                    value={skuCount}
                    invalid={!!errors.skuCount}
                    onChange={(e) => setSkuCount(e.target.value.replace(/\D/g, ""))}
                    placeholder={details.totalSupply || "500"}
                    autoFocus
                  />
                </Field>
              ) : (
                <p className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                  The drop will be created with no units. You can add them at any time
                  from the drop&rsquo;s <strong>Serialized units</strong> panel.
                  {supplyN > 0
                    ? " A drop declaring supply cannot be published until at least one unit is minted."
                    : ""}
                </p>
              )}

              <div className="space-y-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
                <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                  <Boxes className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    Each unit gets its own code —{" "}
                    <span className="font-mono text-[10.5px] text-[var(--text-2)]">
                      {details.groupCode ? `………${details.groupCode}` : "………0042"}-000001
                    </span>{" "}
                    — and carries its own serial, tag and owner. Bigger editions are
                    minted in batches of {formatNumber(MAX_INLINE_MINT)}.
                  </span>
                </p>
                <p className="flex items-start gap-2 border-t border-[var(--hairline)] pt-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                  <ShieldAlert className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
                  <span>
                    Variants (size, colour, material) are a separate record with no
                    create endpoint yet. Units minted here are unvaried.
                  </span>
                </p>
              </div>

              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
                <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                The drop and its units are written in one transaction — this either
                creates a drop with {mintAtCreate && countN ? formatNumber(countN) : "N"} units
                or creates nothing at all.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3 sm:px-6">
          {step !== "details" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStep(step === "units" ? "pricing" : "details")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={leave}>
              Cancel
            </Button>
          )}

          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="ml-auto"
            loading={create.isPending}
            disabled={step === "pricing" && markets.length === 0}
          >
            {step === "details"
              ? "Next — pricing"
              : step === "pricing" && !owned
                ? "Next — add SKUs"
                : "Save drop"}
            {step === "details" || (step === "pricing" && !owned) ? (
              <ArrowRight className="h-3.5 w-3.5" />
            ) : null}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Steps({ step, withUnits }: { step: Step; withUnits: boolean }) {
  const items: { key: Step; label: string }[] = [
    { key: "details", label: "Drop information" },
    { key: "pricing", label: "Pricing" },
    ...(withUnits ? [{ key: "units" as const, label: "SKUs" }] : []),
  ];
  const reached = items.findIndex((it) => it.key === step);
  return (
    <ol className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] px-4 py-2.5 sm:px-6">
      {items.map((it, i) => {
        const active = it.key === step;
        const done = i < reached;
        return (
          <li key={it.key} className="flex items-center gap-2">
            <span
              className={[
                "flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-medium",
                active
                  ? "bg-[var(--accent)] text-white"
                  : done
                    ? "bg-[var(--positive-dim)] text-[var(--positive)]"
                    : "bg-[var(--surface-3)] text-[var(--text-3)]",
              ].join(" ")}
            >
              {i + 1}
            </span>
            <span
              className={
                active
                  ? "text-[12px] font-medium text-[var(--text-1)]"
                  : "text-[12px] text-[var(--text-3)]"
              }
            >
              {it.label}
            </span>
            {i < items.length - 1 ? (
              <span className="mx-1 h-px w-5 bg-[var(--hairline-strong)]" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
