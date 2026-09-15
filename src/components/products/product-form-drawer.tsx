"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Boxes, Info, ShieldAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCreateProduct } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { ARTIST_OPTIONS, ORGANIZATION_OPTIONS } from "@/components/authz/organizations";
import type { ProductInput } from "@/lib/types";

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
 * Add Product — the catalog record, then its first serialized units.
 *
 *   Add Product → Product information → SKUs → Save
 *
 * The two steps are one request. `POST /admin/products` takes an optional
 * `skus` block and writes the drop and its edition in a single transaction, so
 * the form either produces a drop with N units or produces nothing. Creating
 * the product first and minting afterwards would leave a half-made drop on
 * screen whenever the second call failed.
 *
 * Adding MORE units later is deliberately not here — it belongs on the product
 * itself, where the existing edition is visible. See SkuUnitsPanel.
 */

/** `vertical`, `category` and `rarity` are free-form `String?` columns on the
 *  backend, not enums — a fixed list here would be a second source of truth
 *  that drifts. These are suggestions, and the inputs stay free-text. */
const CATEGORY_HINTS = ["JERSEY", "FIGURE", "APPAREL", "PRINT", "CARD"];
const RARITY_HINTS = ["COMMON", "LIMITED", "RARE", "LEGENDARY"];

const MAX_INLINE_MINT = 1000;

type Step = "details" | "units";

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

  // Step 2 — the opening edition
  const [mintNow, setMintNow] = React.useState(true);
  const [skuCount, setSkuCount] = React.useState("");

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
      if (validateDetails()) setStep("units");
      return;
    }
    if (!validateUnits()) return;

    const payload: ProductInput = {
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
          setErrors(fields);
          // A field error belongs on step 1 unless it is about the edition,
          // so send the operator back to where the offending input actually
          // is instead of leaving them on a step with no visible error.
          if (Object.keys(fields).some((k) => !k.startsWith("skus"))) {
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
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[560px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Add drop
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                {step === "details"
                  ? "Step 1 of 2 — the catalog record."
                  : "Step 2 of 2 — the serialized units under it."}
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
                    hint="The owning organization. There is still no organization-list endpoint, so these mirror the seeded set."
                  >
                    <select
                      id="p-org"
                      value={organizationId}
                      onChange={(e) => setOrganizationId(e.target.value)}
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                    >
                      <option value="">Unassigned</option>
                      {ORGANIZATION_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} — {o.type}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Artist"
                    htmlFor="p-artist"
                    hint="Also a uuid server-side, and also has no list endpoint yet."
                  >
                    <select
                      id="p-artist"
                      value={artistId}
                      onChange={(e) => setArtistId(e.target.value)}
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                    >
                      <option value="">Unassigned</option>
                      {ARTIST_OPTIONS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
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

                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
                    <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                    The drop is created as a <strong>Draft</strong>. Moving it onward is
                    the review workflow&rsquo;s job, from Approvals.
                  </p>
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
              {step === "units" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("details")}
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
              >
                {step === "details" ? "Next — add SKUs" : "Save drop"}
                {step === "details" ? <ArrowRight className="h-3.5 w-3.5" /> : null}
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
    { key: "units", label: "SKUs" },
  ];
  return (
    <ol className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-2.5">
      {items.map((it, i) => {
        const active = it.key === step;
        const done = it.key === "details" && step === "units";
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
            {i === 0 ? (
              <span className="mx-1 h-px w-6 bg-[var(--hairline-strong)]" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
