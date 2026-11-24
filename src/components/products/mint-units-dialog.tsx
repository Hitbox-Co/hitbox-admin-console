"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import { Info, ScanLine, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useMintSkus, useProductVariants } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import { usePermissions } from "@/components/layout/authz-provider";
import { Button, Field, Input, Tooltip } from "@/components/ui/primitives";
import type { ProductVariantRef, VariantMode } from "@/lib/types";

/** `count` is the only field POST /admin/products/:id/skus rejects a request
 *  for omitting (sku-api.md §3); variantId depends on the drop having any. */
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
 * The variant picker follows the drop's type (drop-types-and-variants.md §8):
 * REQUIRED makes it mandatory (every T-shirt unit has a size), NONE hides it
 * (a keychain has no variants), and OPTIONAL or an untyped drop offers it.
 * Inactive and archived variants are not offered — minting for one is a 400
 * PRODUCTS_VARIANT_INACTIVE — and a capped variant shows how many are left.
 *
 * No chips here. Chips enter the platform ONLY through a consignment: its
 * manifest carries each chip's UID and NTAG 424 DNA keys, and accepting it
 * mints the units already bound to their chips — the only path whose units
 * a secure tap can verify. A unit minted here has no chip and can't be given
 * one later (accepting a consignment mints new units, it doesn't bind to
 * existing ones), so this is for stock that ships without a chip.
 */

const MAX_BATCH = 1000;

export function MintUnitsDialog({
  productId,
  remaining,
  variants: embedded,
  variantMode = null,
  onClose,
}: {
  productId: string;
  /** null when the drop declares no supply cap. */
  remaining: number | null;
  /** The product read's variants — a fallback while the variant list loads. */
  variants: ProductVariantRef[];
  /** null on an untyped (legacy) drop. */
  variantMode?: VariantMode | null;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const mint = useMintSkus(productId);

  // The variants endpoint carries mintedUnits; the product read does not.
  const variantsQuery = useProductVariants(productId, false, variantMode !== "NONE");
  const variants = React.useMemo(
    () =>
      (variantsQuery.data
        ? variantsQuery.data.map((v) => ({
            id: v.id,
            label: v.label,
            variantCode: v.variantCode as string | undefined,
            totalSupply: v.totalSupply,
            mintedUnits: v.mintedUnits as number | null,
            usable: v.isActive && !v.archived,
          }))
        : embedded.map((v) => ({
            id: v.id,
            label: v.label,
            variantCode: v.variantCode,
            totalSupply: v.totalSupply ?? null,
            mintedUnits: null as number | null,
            usable: v.isActive !== false,
          }))
      ).sort((a, b) => Number(b.usable) - Number(a.usable)),
    [variantsQuery.data, embedded]
  );
  const usable = variants.filter((v) => v.usable);
  const requiresVariant = variantMode === "REQUIRED";
  const offerVariant = variantMode !== "NONE" && variants.length > 0;

  const [count, setCount] = React.useState("");

  const [isActive, setIsActive] = React.useState(true);
  const [variantId, setVariantId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});


  const n = Number(count);
  const chosen = variants.find((v) => v.id === variantId);
  const variantLeft =
    chosen && chosen.totalSupply != null && chosen.mintedUnits != null
      ? Math.max(0, chosen.totalSupply - chosen.mintedUnits)
      : null;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!Number.isInteger(n) || n < 1 || n > MAX_BATCH) {
      next.count = `A whole number from 1 to ${MAX_BATCH}.`;
    } else if (remaining !== null && n > remaining) {
      // The server enforces this too (409 SKUS_SUPPLY_EXCEEDED); saying it
      // here means the operator does not lose the form to find out.
      next.count = `Only ${formatNumber(remaining)} left before the declared supply is reached.`;
    }
    if (requiresVariant && !variantId) {
      next.variantId = "Every unit of this drop type belongs to a variant — pick one.";
    } else if (variantLeft !== null && n > variantLeft) {
      next.count = `Only ${formatNumber(variantLeft)} left under ${chosen?.label}'s cap.`;
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
        isActive,
      },
      {
        onSuccess: (r) => {
          toast.success(
            `Minted ${formatNumber(r.minted)} units — #${r.firstSerial}–${r.lastSerial}`
          );
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "SKUS_NOT_APPROVED") {
            // details names the review that is blocking — say which, and why.
            const d = (err.details ?? {}) as { version?: number; status?: string };
            toast.error(
              d.version
                ? `Review v${d.version} is ${String(d.status ?? "not approved").toLowerCase()} — units can be minted once the owner approves it.`
                : err.friendly
            );
            onClose();
            return;
          }
          if (
            err instanceof ApiError &&
            (err.code === "PRODUCTS_VARIANTS_REQUIRED" ||
              err.code === "PRODUCTS_VARIANT_INACTIVE" ||
              err.code === "PRODUCTS_VARIANTS_NOT_ALLOWED")
          ) {
            setErrors({ variantId: err.friendly });
            return;
          }
          if (
            err instanceof ApiError &&
            (err.code === "PRODUCTS_VARIANT_SUPPLY_EXCEEDED" ||
              // The same cap, enforced inside the mint transaction.
              err.code === "SKUS_VARIANT_SUPPLY_EXCEEDED")
          ) {
            setErrors({ count: err.friendly });
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
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] flex max-h-[min(90dvh,860px)] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
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

          <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
              Follows the drop type: mandatory for REQUIRED, absent for NONE.
              The server checks the variant belongs to this drop
              (SKUS_VARIANT_MISMATCH) and is active (PRODUCTS_VARIANT_INACTIVE).
            */}
            {requiresVariant && usable.length === 0 && !variantsQuery.isLoading ? (
              <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]">
                <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--danger)]" aria-hidden />
                This drop type needs a variant on every unit, and none is active. Add or
                re-activate one under Variants first.
              </p>
            ) : offerVariant ? (
              <Field
                label="Variant"
                htmlFor="mint-variant"
                error={errors.variantId}
                required={requiresVariant}
                hint={
                  requiresVariant
                    ? "Every unit of this drop type belongs to a variant."
                    : "Which variation these units are. Leave unset to mint against the drop itself."
                }
              >
                <select
                  id="mint-variant"
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                >
                  <option value="">{requiresVariant ? "Choose a variant" : "No variant"}</option>
                  {variants.map((v) => {
                    const left =
                      v.totalSupply != null && v.mintedUnits != null
                        ? v.totalSupply - v.mintedUnits
                        : null;
                    return (
                      <option key={v.id} value={v.id} disabled={!v.usable || left === 0}>
                        {v.label}
                        {v.mintedUnits != null
                          ? ` — ${formatNumber(v.mintedUnits)}${v.totalSupply != null ? ` / ${formatNumber(v.totalSupply)}` : ""} minted`
                          : ""}
                        {!v.usable ? " (inactive)" : left === 0 ? " (full)" : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>
            ) : null}

            <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]">
              <ScanLine className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
              <span>
                <strong className="text-[var(--text-1)]">These units get no NFC chip.</strong> Chips only come in
                through a{" "}
                {perms.canOpen("/supply/consignments") ? (
                  <Link href="/supply/consignments" className="underline underline-offset-2">
                    consignment
                  </Link>
                ) : (
                  "consignment"
                )}{" "}
                — book the carton, register its chips with their keys, and accepting it mints the units bound to them. A
                unit minted here can&rsquo;t be given a chip later, so use this only for stock that ships without one.
              </span>
            </p>

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
                Minting {formatNumber(n)} unit{n === 1 ? "" : "s"} without chips. Units are created
                unclaimed.
              </p>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={mint.isPending}
                disabled={requiresVariant && usable.length === 0}
              >
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
