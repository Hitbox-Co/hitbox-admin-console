"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Boxes, Coins, Info, ShieldAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAdminArtists,
  useAdminMarkets,
  useAdminOrganizations,
  useCreateProduct,
} from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import {
  PriceRows,
  mapServerPriceErrors,
  newPriceDraft,
  toPriceInputs,
  unpricedDefaultMarket,
  validatePriceDrafts,
  type PriceDraft,
} from "./price-rows";
import type { ProductCreateInput } from "@/lib/types";

/**
 * Step 1's required-ness, as a schema rather than a hand-typed list.
 *
 * Matches `createProductSchema` in the backend (product-upload-api.md §2):
 * `name` is the only field the API rejects a request for omitting — every
 * other field defaults, coerces from `""`/`null`, or is genuinely optional.
 * The fields carry the raw *string* inputs the form actually holds, not the
 * coerced numbers/dates `ProductInput` sends — this schema is about which
 * inputs must be filled in, not about the wire payload's types.
 */
const detailsSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  organizationId: z.string().optional(),
  artistId: z.string().optional(),
  category: z.string().optional(),
  vertical: z.string().optional(),
  rarity: z.string().optional(),
  totalSupply: z.string().optional(),
  purchaseLimit: z.string().optional(),
  groupCode: z.string().optional(),
  releaseStart: z.string().optional(),
  releaseEnd: z.string().optional(),
  minimumAge: z.string().optional(),
  oddsDisclosureRef: z.string().optional(),
});
const REQUIRED_DETAILS = requiredKeys(detailsSchema);

/**
 * What to say under a directory picker. A select that is empty because the
 * fetch failed looks identical to one that is empty because there is nothing
 * to pick, and the difference decides whether the operator retries or gives
 * up — so never let those two read the same.
 */
function directoryHint(
  pending: boolean,
  failed: boolean,
  count: number,
  truncated: boolean,
  ready: string,
  noun: string
) {
  if (pending) return `Loading ${noun}…`;
  if (failed) return `Could not load ${noun}. Close and reopen the drawer to retry.`;
  if (count === 0) return `No active ${noun} to choose from.`;
  if (truncated) {
    return `${ready} Showing the first ${count}; there are more than this picker can list.`;
  }
  return ready;
}

/**
 * Add Product — the catalog record, its market pricing, then its first
 * serialized units.
 *
 *   Add Product → Product information → Pricing → SKUs → Save
 *
 * The three steps are ONE request. `POST /admin/products` writes the product,
 * its prices and its edition in a single transaction, so the form either
 * produces a complete drop or produces nothing. Creating the product first and
 * pricing or minting afterwards would leave a half-made drop on screen
 * whenever the second call failed.
 *
 * Pricing is a step rather than a few fields because `prices` is **required**
 * with at least one entry (product-upload-api.md §3) — a drop with no price is
 * not purchasable anywhere, and every previous route to that state was a
 * half-finished form. Note the ordering inside the server's transaction:
 * prices are written first, so a failure there aborts before 500 SKUs are
 * minted.
 *
 * Artwork is NOT here. `images` on create takes assets that are already
 * uploaded, and a presign needs the owning record's id — which does not exist
 * until this request returns. Images are attached from the drop's own gallery
 * panel, which opens straight after this closes.
 *
 * Adding MORE units later is deliberately not here either — it belongs on the
 * product itself, where the existing edition is visible. See SkuUnitsPanel.
 */

/** `vertical`, `category` and `rarity` are free-form `String?` columns on the
 *  backend, not enums — a fixed list here would be a second source of truth
 *  that drifts. These are suggestions, and the inputs stay free-text. */
const CATEGORY_HINTS = ["JERSEY", "FIGURE", "APPAREL", "PRINT", "CARD"];
const RARITY_HINTS = ["COMMON", "LIMITED", "RARE", "LEGENDARY"];

const MAX_INLINE_MINT = 1000;

type Step = "details" | "pricing" | "units";

export function ProductFormDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Hands the new product's id back so the caller can open it. */
  onCreated?: (productId: string) => void;
}) {
  const create = useCreateProduct();
  const [step, setStep] = React.useState<Step>("details");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Only active markets are offerable: an archived or inactive one comes back
  // as PRODUCTS_PRICE_MARKET_INVALID, which names every bad market at once.
  const marketsQuery = useAdminMarkets({ isActive: true, limit: 100 });

  const markets = React.useMemo(
    () => marketsQuery.data?.items ?? [],
    [marketsQuery.data]
  );

  // Step 1 — product information
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [organizationId, setOrganizationId] = React.useState("");
  const [artistId, setArtistId] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [vertical, setVertical] = React.useState("");
  const [rarity, setRarity] = React.useState("");
  const [totalSupply, setTotalSupply] = React.useState("");
  const [purchaseLimit, setPurchaseLimit] = React.useState("");
  const [groupCode, setGroupCode] = React.useState("");
  const [releaseStart, setReleaseStart] = React.useState("");
  const [releaseEnd, setReleaseEnd] = React.useState("");
  const [isAgeSpecific, setIsAgeSpecific] = React.useState(false);
  const [minimumAge, setMinimumAge] = React.useState("");
  const [oddsDisclosureRef, setOddsDisclosureRef] = React.useState("");

  /*
   * The owner directories. Both take `drop:read`, which anyone reaching this
   * form already holds — that gating is deliberate on the backend so a Drop
   * Manager can fill the form without a brand-artist-record grant.
   *
   * The artist list is narrowed by the chosen brand: the same artist under a
   * brand and under their own artist-individual organization are different
   * rows, and offering both makes the picker ambiguous about which drop is
   * being filed.
   */
  const orgsQuery = useAdminOrganizations();
  const artistsQuery = useAdminArtists(organizationId || undefined);

  /*
   * Step 2 — market pricing. Required: at least one row.
   *
   * Null until the operator touches the table, so the opening row can be
   * DERIVED from the market list instead of being written into state by an
   * effect the moment that list lands. The seed is the DEFAULT market: it is
   * the one a buyer falls back to when their country maps nowhere, so it is
   * the single price most likely to be wanted — and an empty table would make
   * a required step look optional.
   */
  const [priceDraft, setPrices] = React.useState<PriceDraft[] | null>(null);
  const seededPrices = React.useMemo(() => {
    if (markets.length === 0) return [];
    const seed = markets.find((m) => m.isDefault) ?? markets[0];
    return [newPriceDraft(seed.code, seed.currency)];
  }, [markets]);
  const prices = priceDraft ?? seededPrices;

  // Step 3 — the opening edition
  const [mintNow, setMintNow] = React.useState(true);
  const [skuCount, setSkuCount] = React.useState("");

  const fallbackGap = unpricedDefaultMarket(prices, markets);

  const supplyN = totalSupply ? Number(totalSupply) : 0;
  const countN = skuCount ? Number(skuCount) : 0;

  const validateDetails = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "A name is required.";
    if (groupCode && !/^\d{4}$/.test(groupCode)) {
      next.groupCode = "Exactly four digits — the server prefixes eight more.";
    }
    if (totalSupply && (!Number.isInteger(supplyN) || supplyN < 0)) {
      next.totalSupply = "A whole number, or blank for “size not declared yet”.";
    }
    if (isAgeSpecific && !minimumAge) {
      // Not rejected by POST, but RELEASES_COMPLIANCE_INCOMPLETE blocks the
      // approval later — cheaper to say now than at the compliance gate.
      next.minimumAge = "An age-restricted drop cannot be approved without one.";
    }
    if (releaseStart && releaseEnd && releaseStart >= releaseEnd) {
      next.releaseEnd = "The window must end after it starts.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validatePricing = () => {
    const next = validatePriceDrafts(prices);
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateUnits = () => {
    const next: Record<string, string> = {};
    if (mintNow) {
      if (!Number.isInteger(countN) || countN < 1 || countN > MAX_INLINE_MINT) {
        next.skuCount = `A whole number from 1 to ${formatNumber(MAX_INLINE_MINT)}.`;
      } else if (supplyN > 0 && countN > supplyN) {
        // PRODUCTS_SUPPLY_EXCEEDED — the inline block cannot exceed the drop's
        // own declared supply.
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
      if (validateDetails()) setStep("pricing");
      return;
    }
    if (step === "pricing") {
      if (validatePricing()) setStep("units");
      return;
    }
    if (!validateUnits()) return;

    const payload: ProductCreateInput = {
      name: name.trim(),
      description: description.trim() || null,
      // Both are validated as uuids server-side; "" would be a 422, so an
      // unset picker sends null rather than an empty string.
      organizationId: organizationId || null,
      artistId: artistId || null,
      category: category.trim() || undefined,
      vertical: vertical.trim() || undefined,
      rarity: rarity.trim() || undefined,
      totalSupply: totalSupply ? supplyN : undefined,
      purchaseLimit: purchaseLimit ? Number(purchaseLimit) : undefined,
      groupCode: groupCode || undefined,
      releaseStart: releaseStart ? new Date(releaseStart).toISOString() : undefined,
      releaseEnd: releaseEnd ? new Date(releaseEnd).toISOString() : undefined,
      isAgeSpecific,
      minimumAge: isAgeSpecific && minimumAge ? Number(minimumAge) : null,
      oddsDisclosureRef: oddsDisclosureRef.trim() || null,
      // Required, minimum one. Amounts go as the typed STRINGS: a price that
      // round-trips through a float can arrive as 1999.9899999999998, and the
      // decimal column would round it silently.
      prices: toPriceInputs(prices),
      ...(mintNow && countN > 0 ? { skus: { count: countN } } : {}),
    };

    create.mutate(payload, {
      onSuccess: (product) => {
        toast.success(
          mintNow && countN > 0
            ? `${product.name} created with ${formatNumber(countN)} units`
            : `${product.name} created`
        );
        onCreated?.(product.id);
        onClose();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === 422) {
          const fields = err.fieldErrors;
          // Price issues arrive by path ("prices.0.amount"); re-key them onto
          // the rows on screen so the offending one is actually marked.
          setErrors({ ...fields, ...mapServerPriceErrors(fields, prices) });
          /*
           * Send the operator to the step that owns the offending input
           * rather than leaving them on one with no visible error. Paths
           * arrive dotted and indexed — "prices.0.amount", "skus.count" — so
           * the prefix is what identifies the step.
           */
          const keys = Object.keys(fields);
          if (keys.some((k) => k.startsWith("prices"))) {
            setStep("pricing");
          } else if (keys.some((k) => !k.startsWith("skus"))) {
            setStep("details");
          }
          toast.error(err.validationSummary ?? err.friendly);
          return;
        }
        toast.error(err instanceof ApiError ? err.friendly : "Could not create the drop.");
      },
    });
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-140 flex-col border-l border-hairline-strong bg-surface-1 shadow-e3">
          <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-text-1">
                Add drop
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-text-3">
                {step === "details"
                  ? "Step 1 of 3 — the catalog record."
                  : step === "pricing"
                    ? "Step 2 of 3 — what it costs, per market."
                    : "Step 3 of 3 — the serialized units under it."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <Steps step={step} />

          <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {step === "details" ? (
                <>
                  <Field
                    label="Name"
                    htmlFor="p-name"
                    error={errors.name}
                    required={REQUIRED_DETAILS.has("name")}
                  >
                    <Input
                      id="p-name"
                      value={name}
                      invalid={!!errors.name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Neon Drift — Series 2"
                      autoFocus
                    />
                  </Field>

                  <Field label="Description" htmlFor="p-desc">
                    <Textarea
                      id="p-desc"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Hand-finished resin figure, 500 piece edition."
                    />
                  </Field>

                  <Field
                    label="Brand"
                    htmlFor="p-org"
                    error={errors.organizationId}
                    hint={
                      orgsQuery.isError
                        ? "The organization directory could not be loaded, so this cannot be set here."
                        : "The owning organization, read from the live directory."
                    }
                  >
                    <select
                      id="p-org"
                      value={organizationId}
                      disabled={!orgsQuery.data?.length}
                      onChange={(e) => {
                        setOrganizationId(e.target.value);
                        // The roster below is scoped to the brand, so an artist
                        // chosen under the previous one no longer belongs.
                        setArtistId("");
                      }}
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)] disabled:opacity-50"
                    >
                      <option value="">
                        {orgsQuery.isLoading ? "Loading brands…" : "Unassigned"}
                      </option>
                      {(orgsQuery.data ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} — {o.type}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Artist"
                    htmlFor="p-artist"
                    hint={
                      artistsQuery.isError
                        ? "The artist directory could not be loaded, so this cannot be set here."
                        : organizationId
                          ? "Narrowed to the chosen brand's roster."
                          : "Every live artist. Choose a brand to narrow this."
                    }
                  >
                    <select
                      id="p-artist"
                      value={artistId}
                      disabled={!artistsQuery.data?.length}
                      onChange={(e) => setArtistId(e.target.value)}
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)] disabled:opacity-50"
                    >
                      <option value="">
                        {artistsQuery.isLoading
                          ? "Loading artists…"
                          : artistsQuery.data?.length === 0
                            ? "No artists on this brand"
                            : "Unassigned"}
                      </option>
                      {(artistsQuery.data ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.organizationName ? ` — ${a.organizationName}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Category" htmlFor="p-category">
                      <Input
                        id="p-category"
                        list="category-hints"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="JERSEY"
                      />
                      <datalist id="category-hints">
                        {CATEGORY_HINTS.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label="Rarity" htmlFor="p-rarity">
                      <Input
                        id="p-rarity"
                        list="rarity-hints"
                        value={rarity}
                        onChange={(e) => setRarity(e.target.value)}
                        placeholder="LIMITED"
                      />
                      <datalist id="rarity-hints">
                        {RARITY_HINTS.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Vertical" htmlFor="p-vertical">
                      <Input
                        id="p-vertical"
                        value={vertical}
                        onChange={(e) => setVertical(e.target.value)}
                        placeholder="music"
                      />
                    </Field>
                    <Field
                      label="Code suffix"
                      htmlFor="p-code"
                      error={errors.groupCode}
                      hint="Four digits; eight random ones are prefixed."
                    >
                      <Input
                        id="p-code"
                        value={groupCode}
                        invalid={!!errors.groupCode}
                        onChange={(e) =>
                          setGroupCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                        }
                        placeholder="0042"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Total supply"
                      htmlFor="p-supply"
                      error={errors.totalSupply}
                      hint="Blank means the size is not declared yet."
                    >
                      <Input
                        id="p-supply"
                        inputMode="numeric"
                        value={totalSupply}
                        invalid={!!errors.totalSupply}
                        onChange={(e) => setTotalSupply(e.target.value.replace(/\D/g, ""))}
                        placeholder="500"
                      />
                    </Field>
                    <Field label="Purchase limit" htmlFor="p-limit">
                      <Input
                        id="p-limit"
                        inputMode="numeric"
                        value={purchaseLimit}
                        onChange={(e) => setPurchaseLimit(e.target.value.replace(/\D/g, ""))}
                        placeholder="2"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Release start" htmlFor="p-start">
                      <Input
                        id="p-start"
                        type="datetime-local"
                        value={releaseStart}
                        onChange={(e) => setReleaseStart(e.target.value)}
                      />
                    </Field>
                    <Field label="Release end" htmlFor="p-end" error={errors.releaseEnd}>
                      <Input
                        id="p-end"
                        type="datetime-local"
                        value={releaseEnd}
                        invalid={!!errors.releaseEnd}
                        onChange={(e) => setReleaseEnd(e.target.value)}
                      />
                    </Field>
                  </div>

                  <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
                    <input
                      type="checkbox"
                      checked={isAgeSpecific}
                      onChange={(e) => setIsAgeSpecific(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    Age-restricted
                  </label>

                  {isAgeSpecific ? (
                    <Field
                      label="Minimum age"
                      htmlFor="p-age"
                      error={errors.minimumAge}
                      hint="Required before the release can be approved."
                    >
                      <Input
                        id="p-age"
                        inputMode="numeric"
                        value={minimumAge}
                        invalid={!!errors.minimumAge}
                        onChange={(e) => setMinimumAge(e.target.value.replace(/\D/g, ""))}
                        placeholder="18"
                      />
                    </Field>
                  ) : null}

                  <Field
                    label="Odds disclosure"
                    htmlFor="p-odds"
                    hint="A chance-based drop needs one; a non-randomised drop legitimately has none."
                  >
                    <Input
                      id="p-odds"
                      value={oddsDisclosureRef}
                      onChange={(e) => setOddsDisclosureRef(e.target.value)}
                      placeholder="https://…"
                    />
                  </Field>

                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-text-3">
                    <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
                    The drop is created as a <strong>Draft</strong>. Moving it onward is
                    the review workflow&rsquo;s job, from Approvals.
                  </p>
                </>
              ) : step === "pricing" ? (
                <>
                  {marketsQuery.isLoading ? (
                    <p className="text-[12px] text-text-3">Loading markets…</p>
                  ) : markets.length === 0 ? (
                    /*
                      Nothing to price against — the picker would be an empty
                      select and the step unpassable. The two reasons for that
                      are different problems with different fixes, so they get
                      different sentences: the market list is gated on
                      reports-dashboards:read, which drop:manage does not imply.
                    */
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
                            No active market exists, so this drop cannot be priced — and
                            a drop cannot be created without a price. Create one under{" "}
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
                            {fallbackGap.code} is the default market and has no active
                            price. A buyer whose country maps to no market falls back to
                            it, and that lookup will find nothing.
                          </span>
                        </p>
                      ) : null}

                      <div className="space-y-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
                        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                          <Coins className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span>
                            The currency belongs to the market, not the price — send the
                            amount, read the currency back. A drop priced only in one
                            market is invisible to buyers resolved into any other.
                          </span>
                        </p>
                        <p className="flex items-start gap-2 border-t border-[var(--hairline)] pt-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                          <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span>
                            At least one price is required. Prices are written first
                            inside the server&rsquo;s transaction, so a bad market code
                            aborts before any unit is minted.
                          </span>
                        </p>
                      </div>
                    </>
                  )}
                </>
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
                      // Required only conditionally on the checkbox above, so
                      // it isn't in detailsSchema — a static schema can't
                      // express "required when this box is checked", and the
                      // field is rendered only in that branch anyway.
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
                        placeholder={totalSupply || "500"}
                        autoFocus
                      />
                    </Field>
                  ) : (
                    <p className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                      The drop will be created with no units. You can add them at any
                      time from the drop&rsquo;s <strong>Serialized units</strong>{" "}
                      panel.
                    </p>
                  )}

                  <div className="space-y-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
                    <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                      <Boxes className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>
                        Each unit gets its own code —{" "}
                        <span className="font-mono text-[10.5px] text-[var(--text-2)]">
                          {groupCode ? `………${groupCode}` : "………0042"}-000001
                        </span>{" "}
                        — and carries its own serial, tag and owner. Bigger editions are
                        minted in batches of {formatNumber(MAX_INLINE_MINT)}.
                      </span>
                    </p>
                    {/*
                      Size/colour/material variants are a different record
                      (ProductVariant) and the backend exposes no endpoint to
                      create one — the product DTO says so outright: "a drop
                      being created right now has no variants yet". Saying so
                      here beats a variant field that silently does nothing.
                    */}
                    <p className="flex items-start gap-2 border-t border-[var(--hairline)] pt-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                      <ShieldAlert className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
                      <span>
                        Variants (size, colour, material) are a separate record with no
                        create endpoint yet. Units minted here are unvaried; once
                        variants exist on a drop, Add SKUs can mint against one.
                      </span>
                    </p>
                  </div>

                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
                    <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                    The drop and its units are written in one transaction — this
                    either creates a drop with {mintNow && countN ? formatNumber(countN) : "N"}{" "}
                    units or creates nothing at all.
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
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
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="sm"
                className="ml-auto"
                loading={create.isPending}
                // Nothing to price against, and a price is required — so the
                // step cannot be passed rather than failing silently.
                disabled={step === "pricing" && markets.length === 0}
              >
                {step === "details"
                  ? "Next — pricing"
                  : step === "pricing"
                    ? "Next — add SKUs"
                    : "Save drop"}
                {step !== "units" ? <ArrowRight className="h-3.5 w-3.5" /> : null}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Steps({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "details", label: "Drop information" },
    { key: "pricing", label: "Pricing" },
    { key: "units", label: "SKUs" },
  ];
  const reached = items.findIndex((it) => it.key === step);
  return (
    <ol className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-2.5">
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
