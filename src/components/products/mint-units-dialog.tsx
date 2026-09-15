"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import { Info, ScanLine, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useMintSkus } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import { usePermissions } from "@/components/layout/authz-provider";
import { Button, Field, Input, Textarea, Tooltip } from "@/components/ui/primitives";
import type { ProductVariantRef } from "@/lib/types";

/** `count` is the only field POST /admin/products/:id/skus rejects a request
 *  for omitting (sku-api.md §3) — vendorId, provisioningBatchId and tagIds
 *  are all optional, and variantId depends on the drop having any. */
const mintSchema = z.object({ count: z.string().min(1) });
const REQUIRED_MINT = requiredKeys(mintSchema);

/**
 * Mint serialized units onto an existing edition.
 *
 * Two constraints come straight from the API and are enforced here so the
 * operator is told before the request rather than by a 422:
 *
 *  - `count` is 1–1000. The insert runs inside the transaction that guards the
 *    serial range, and a transaction writing 10,000 rows holds locks long
 *    enough to matter. Bigger editions are minted in sequential batches.
 *  - `tagIds`, if sent at all, must be EXACTLY `count` long. A shorter list
 *    would silently leave the tail of the batch untagged, and "silently" is
 *    not a property you want in the table that proves authenticity.
 *
 * Tag binding is a separate capability (`nfc-tag-claim:manage`) from minting
 * (`collectible-instance:manage`), so the tag field is absent — not disabled —
 * for a Brand Admin or Drop Manager who can mint but may not bind.
 */

const MAX_BATCH = 1000;

export function MintUnitsDialog({
  productId,
  remaining,
  variants,
  onClose,
}: {
  productId: string;
  /** null when the drop declares no supply cap. */
  remaining: number | null;
  /** Empty for most drops — there is no endpoint to create one. */
  variants: ProductVariantRef[];
  onClose: () => void;
}) {
  const perms = usePermissions();
  const mint = useMintSkus(productId);
  const canBindTags = perms.canBindTags();

  const [count, setCount] = React.useState("");
  const [tagsRaw, setTagsRaw] = React.useState("");
  const [vendorId, setVendorId] = React.useState("");
  const [batchRef, setBatchRef] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [variantId, setVariantId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const tagIds = React.useMemo(
    () =>
      tagsRaw
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsRaw]
  );

  const n = Number(count);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!Number.isInteger(n) || n < 1 || n > MAX_BATCH) {
      next.count = `A whole number from 1 to ${MAX_BATCH}.`;
    } else if (remaining !== null && n > remaining) {
      // The server enforces this too (409 SKUS_SUPPLY_EXCEEDED); saying it
      // here means the operator does not lose the form to find out.
      next.count = `Only ${formatNumber(remaining)} left before the declared supply is reached.`;
    }
    if (tagIds.length && tagIds.length !== n) {
      next.tagIds = `Exactly ${Number.isFinite(n) ? n : "count"} tags, or none at all — ${tagIds.length} given.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mint.isPending || !validate()) return;

    mint.mutate(
      {
        count: n,
        variantId: variantId || undefined,
        tagIds: tagIds.length ? tagIds : undefined,
        vendorId: vendorId.trim() || undefined,
        provisioningBatchId: batchRef.trim() || undefined,
        isActive,
      },
      {
        onSuccess: (r) => {
          toast.success(
            `Minted ${formatNumber(r.minted)} units — #${r.firstSerial}–${r.lastSerial}` +
              (r.tagsBound ? `, ${formatNumber(r.tagsBound)} tagged` : "")
          );
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "SKUS_TAG_TAKEN") {
            // The message names the conflicting tag and the unit holding it.
            setErrors({ tagIds: err.message });
            return;
          }
          toast.error(err instanceof ApiError ? err.friendly : "Could not mint the units.");
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Add SKUs
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                Serials continue from the highest already minted.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="space-y-4 px-4 py-4">
            <Field
              label="How many"
              htmlFor="mint-count"
              error={errors.count}
              required={REQUIRED_MINT.has("count")}
              hint={
                remaining === null
                  ? `Up to ${formatNumber(MAX_BATCH)} per batch. This drop declares no supply cap.`
                  : `Up to ${formatNumber(Math.min(MAX_BATCH, remaining))} — ${formatNumber(remaining)} left in the declared edition.`
              }
            >
              <Input
                id="mint-count"
                inputMode="numeric"
                value={count}
                invalid={!!errors.count}
                onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
                placeholder="500"
                autoFocus
              />
            </Field>

            {/*
              Only offered when the drop actually has variants. The server
              checks the variant belongs to this product and answers
              SKUS_VARIANT_MISMATCH otherwise.
            */}
            {variants.length ? (
              <Field
                label="Variant"
                htmlFor="mint-variant"
                hint="Which variation these units are. Leave unset to mint against the drop itself."
              >
                <select
                  id="mint-variant"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                >
                  <option value="">No variant</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} ({v.optionName}: {v.optionValue})
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {canBindTags ? (
              <Field
                label="NFC tag UIDs"
                htmlFor="mint-tags"
                error={errors.tagIds}
                hint={`Optional. One per line or comma separated — and then exactly as many as the count. Separators are stripped, so 04:A3:9B… and 04a39b… are the same tag.`}
              >
                <Textarea
                  id="mint-tags"
                  rows={3}
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  placeholder={"04:A3:9B:2C:5D:6E:80\n04A39B2C5D6E81"}
                />
              </Field>
            ) : (
              <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                <ScanLine className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                Units will be minted untagged. Binding a physical tag UID needs{" "}
                <span className="text-[var(--text-2)]">nfc-tag-claim:manage</span>, which
                your role does not hold — the edition is yours, the
                anti-counterfeiting material is not.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendor id" htmlFor="mint-vendor" hint="Who provisioned the tags.">
                <Input
                  id="mint-vendor"
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  placeholder="optional"
                />
              </Field>
              <Field
                label="Batch reference"
                htmlFor="mint-batch"
                hint="Recorded, not verified."
              >
                <Input
                  id="mint-batch"
                  value={batchRef}
                  onChange={(e) => setBatchRef(e.target.value)}
                  placeholder="BATCH-2026-09-41"
                />
              </Field>
            </div>

            <Tooltip content="Mint inactive to stage an edition ahead of its release.">
              <label className="flex w-fit items-center gap-2 text-[12.5px] text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                Active immediately
              </label>
            </Tooltip>

            {n > 0 && n <= MAX_BATCH ? (
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
                <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                Minting {formatNumber(n)} unit{n === 1 ? "" : "s"}
                {tagIds.length ? `, binding ${formatNumber(tagIds.length)} tags` : ""}. Units
                are created unclaimed; a unit becomes active on first claim, never here.
              </p>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" variant="primary" size="sm" loading={mint.isPending}>
                Add SKUs
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
