"use client";

import * as React from "react";
import { z } from "zod";
import { useAdminArtists, useAdminOrganizations } from "@/lib/api/hooks";
import { requiredKeys } from "@/lib/required-fields";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import type { AdminProductDetail, ProductInput } from "@/lib/types";

/**
 * The catalog fields of a drop — shared by the Add drop page and the Edit
 * drop page, so the two cannot drift into validating the same input two ways.
 *
 * `status` is deliberately absent. It is the outcome of the workflow — submit
 * and decide (/admin/releases), publish (POST /admin/products/:id/publish),
 * archive (DELETE) — and PATCH is .strict(), so sending it is a 422.
 */

/**
 * Required-ness, as a schema rather than a hand-typed list. Matches
 * `createProductSchema`: `name` is the only field the API rejects a request
 * for omitting. The fields are the raw STRING inputs the form holds.
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

/** Free-form `String?` columns, not enums — suggestions only. */
const CATEGORY_HINTS = ["JERSEY", "FIGURE", "APPAREL", "PRINT", "CARD"];
const RARITY_HINTS = ["COMMON", "LIMITED", "RARE", "LEGENDARY"];

export interface ProductDetailsDraft {
  name: string;
  description: string;
  organizationId: string;
  artistId: string;
  category: string;
  vertical: string;
  rarity: string;
  totalSupply: string;
  purchaseLimit: string;
  /** Create only — the 4-digit suffix. */
  groupCode: string;
  releaseStart: string;
  releaseEnd: string;
  isAgeSpecific: boolean;
  minimumAge: string;
  oddsDisclosureRef: string;
}

export const EMPTY_DETAILS: ProductDetailsDraft = {
  name: "",
  description: "",
  organizationId: "",
  artistId: "",
  category: "",
  vertical: "",
  rarity: "",
  totalSupply: "",
  purchaseLimit: "",
  groupCode: "",
  releaseStart: "",
  releaseEnd: "",
  isAgeSpecific: false,
  minimumAge: "",
  oddsDisclosureRef: "",
};

/** ISO instant → the `YYYY-MM-DDTHH:mm` a datetime-local input holds, in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function detailsFromProduct(p: AdminProductDetail): ProductDetailsDraft {
  return {
    name: p.name,
    description: p.description ?? "",
    organizationId: p.organizationId ?? "",
    artistId: p.artistId ?? "",
    category: p.category ?? "",
    vertical: p.vertical ?? "",
    rarity: p.rarity ?? "",
    totalSupply: p.totalSupply ? String(p.totalSupply) : "",
    purchaseLimit: p.purchaseLimit ? String(p.purchaseLimit) : "",
    groupCode: "",
    releaseStart: toLocalInput(p.releaseStart),
    releaseEnd: toLocalInput(p.releaseEnd),
    isAgeSpecific: p.isAgeSpecific,
    minimumAge: p.minimumAge != null ? String(p.minimumAge) : "",
    oddsDisclosureRef: p.oddsDisclosureRef ?? "",
  };
}

export function validateDetails(
  d: ProductDetailsDraft,
  mode: "create" | "edit"
): Record<string, string> {
  const next: Record<string, string> = {};
  if (!d.name.trim()) next.name = "A name is required.";
  if (mode === "create" && d.groupCode && !/^\d{4}$/.test(d.groupCode)) {
    next.groupCode = "Exactly four digits — the server prefixes eight more.";
  }
  const supply = d.totalSupply ? Number(d.totalSupply) : 0;
  if (d.totalSupply && (!Number.isInteger(supply) || supply < 0)) {
    next.totalSupply = "A whole number, or blank for “size not declared yet”.";
  }
  if (d.purchaseLimit && Number(d.purchaseLimit) < 1) {
    next.purchaseLimit = "At least 1, or blank for unlimited.";
  }
  if (d.isAgeSpecific && !d.minimumAge) {
    // Not rejected by the write, but RELEASES_COMPLIANCE_INCOMPLETE blocks the
    // approval and PRODUCTS_PUBLISH_BLOCKED blocks going live.
    next.minimumAge = "An age-restricted drop cannot be approved or published without one.";
  }
  if (d.minimumAge && Number(d.minimumAge) > 120) {
    next.minimumAge = "At most 120.";
  }
  if (d.releaseStart && d.releaseEnd && d.releaseStart >= d.releaseEnd) {
    next.releaseEnd = "The window must end after it starts.";
  }
  return next;
}

/**
 * The wire shape of the catalog fields. Blank means "no value": `null`
 * clears a column on PATCH, and create treats it the same as omitting it.
 * Owner ids go as null, never "" — both are validated as uuids.
 */
export function detailsToInput(d: ProductDetailsDraft): ProductInput {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    organizationId: d.organizationId || null,
    artistId: d.artistId || null,
    category: d.category.trim() || null,
    vertical: d.vertical.trim() || null,
    rarity: d.rarity.trim() || null,
    totalSupply: d.totalSupply ? Number(d.totalSupply) : 0,
    purchaseLimit: d.purchaseLimit ? Number(d.purchaseLimit) : null,
    releaseStart: d.releaseStart ? new Date(d.releaseStart).toISOString() : null,
    releaseEnd: d.releaseEnd ? new Date(d.releaseEnd).toISOString() : null,
    isAgeSpecific: d.isAgeSpecific,
    minimumAge: d.isAgeSpecific && d.minimumAge ? Number(d.minimumAge) : null,
    oddsDisclosureRef: d.oddsDisclosureRef.trim() || null,
  };
}

const selectClass =
  "h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)] disabled:opacity-50";

export function ProductDetailsFields({
  value,
  onChange,
  errors,
  mode,
  disabled,
}: {
  value: ProductDetailsDraft;
  onChange: (next: ProductDetailsDraft) => void;
  errors: Record<string, string>;
  mode: "create" | "edit";
  disabled?: boolean;
}) {
  const set = <K extends keyof ProductDetailsDraft>(key: K, v: ProductDetailsDraft[K]) =>
    onChange({ ...value, [key]: v });

  /*
   * The owner directories take drop:read, which anyone reaching this form
   * holds. The artist list is narrowed by the chosen brand: the same artist
   * under a brand and under their own artist-individual organization are
   * different rows.
   */
  const orgsQuery = useAdminOrganizations();
  const artistsQuery = useAdminArtists(value.organizationId || undefined);

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <Field label="Name" htmlFor="p-name" error={errors.name} required={REQUIRED_DETAILS.has("name")}>
        <Input
          id="p-name"
          value={value.name}
          invalid={!!errors.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Neon Drift — Series 2"
          autoFocus={mode === "create"}
        />
      </Field>

      <Field label="Description" htmlFor="p-desc">
        <Textarea
          id="p-desc"
          rows={3}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Hand-finished resin figure, 500 piece edition."
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Brand"
          htmlFor="p-org"
          error={errors.organizationId}
          hint={
            orgsQuery.isError
              ? "The organization directory could not be loaded, so this cannot be set here."
              : "The owning organization — it decides who approves the drop."
          }
        >
          <select
            id="p-org"
            value={value.organizationId}
            disabled={!orgsQuery.data?.length}
            onChange={(e) =>
              // The roster is scoped to the brand, so an artist chosen under
              // the previous one no longer belongs.
              onChange({ ...value, organizationId: e.target.value, artistId: "" })
            }
            className={selectClass}
          >
            <option value="">{orgsQuery.isLoading ? "Loading brands…" : "Unassigned"}</option>
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
          error={errors.artistId}
          hint={
            artistsQuery.isError
              ? "The artist directory could not be loaded, so this cannot be set here."
              : value.organizationId
                ? "Narrowed to the chosen brand's roster."
                : "Every live artist. Choose a brand to narrow this."
          }
        >
          <select
            id="p-artist"
            value={value.artistId}
            disabled={!artistsQuery.data?.length}
            onChange={(e) => set("artistId", e.target.value)}
            className={selectClass}
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
      </div>

      <OwnershipHint organizationId={value.organizationId} artistId={value.artistId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor="p-category">
          <Input
            id="p-category"
            list="category-hints"
            value={value.category}
            onChange={(e) => set("category", e.target.value)}
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
            value={value.rarity}
            onChange={(e) => set("rarity", e.target.value)}
            placeholder="LIMITED"
          />
          <datalist id="rarity-hints">
            {RARITY_HINTS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Vertical" htmlFor="p-vertical">
          <Input
            id="p-vertical"
            value={value.vertical}
            onChange={(e) => set("vertical", e.target.value)}
            placeholder="music"
          />
        </Field>
        {mode === "create" ? (
          <Field
            label="Code suffix"
            htmlFor="p-code"
            error={errors.groupCode}
            hint="Four digits; eight random ones are prefixed."
          >
            <Input
              id="p-code"
              value={value.groupCode}
              invalid={!!errors.groupCode}
              onChange={(e) => set("groupCode", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0042"
            />
          </Field>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Total supply"
          htmlFor="p-supply"
          error={errors.totalSupply}
          hint="Blank means the size is not declared yet."
        >
          <Input
            id="p-supply"
            inputMode="numeric"
            value={value.totalSupply}
            invalid={!!errors.totalSupply}
            onChange={(e) => set("totalSupply", e.target.value.replace(/\D/g, ""))}
            placeholder="500"
          />
        </Field>
        <Field
          label="Purchase limit"
          htmlFor="p-limit"
          error={errors.purchaseLimit}
          hint="Blank means unlimited."
        >
          <Input
            id="p-limit"
            inputMode="numeric"
            value={value.purchaseLimit}
            invalid={!!errors.purchaseLimit}
            onChange={(e) => set("purchaseLimit", e.target.value.replace(/\D/g, ""))}
            placeholder="2"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Release start" htmlFor="p-start">
          <Input
            id="p-start"
            type="datetime-local"
            value={value.releaseStart}
            onChange={(e) => set("releaseStart", e.target.value)}
          />
        </Field>
        <Field label="Release end" htmlFor="p-end" error={errors.releaseEnd}>
          <Input
            id="p-end"
            type="datetime-local"
            value={value.releaseEnd}
            invalid={!!errors.releaseEnd}
            onChange={(e) => set("releaseEnd", e.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
        <input
          type="checkbox"
          checked={value.isAgeSpecific}
          onChange={(e) => set("isAgeSpecific", e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--accent)]"
        />
        Age-restricted
      </label>

      {value.isAgeSpecific ? (
        <Field
          label="Minimum age"
          htmlFor="p-age"
          error={errors.minimumAge}
          hint="Required before the drop can be approved or published."
        >
          <Input
            id="p-age"
            inputMode="numeric"
            value={value.minimumAge}
            invalid={!!errors.minimumAge}
            onChange={(e) => set("minimumAge", e.target.value.replace(/\D/g, ""))}
            placeholder="18"
          />
        </Field>
      ) : null}

      <Field
        label="Odds disclosure"
        htmlFor="p-odds"
        error={errors.oddsDisclosureRef}
        hint="A chance-based drop needs one; a non-randomised drop legitimately has none."
      >
        <Input
          id="p-odds"
          value={value.oddsDisclosureRef}
          onChange={(e) => set("oddsDisclosureRef", e.target.value)}
          placeholder="https://…"
        />
      </Field>
    </fieldset>
  );
}

/**
 * Who will be asked to approve, derived the way the backend resolves it at
 * submit time (drop-approval-lifecycle.md §2). Organization.type is the
 * discriminator, not "does it have an artist".
 */
function OwnershipHint({
  organizationId,
  artistId,
}: {
  organizationId: string;
  artistId: string;
}) {
  const orgsQuery = useAdminOrganizations();
  const org = (orgsQuery.data ?? []).find((o) => o.id === organizationId);

  let text: string;
  if (!organizationId && !artistId) {
    text =
      "No brand and no artist: the review auto-passes on submit and the drop is filed under HitBox. No legal acceptance is recorded.";
  } else if (!organizationId) {
    text = "No brand, but an artist: the artist approves this drop.";
  } else if (!org) {
    text = "The owning organization decides who approves this drop.";
  } else if (org.type === "BRAND") {
    text = `A ${org.name} member approves this drop — not the artist, even if one is named.`;
  } else if (org.type === "ARTIST_INDIVIDUAL") {
    text = "The artist approves this drop themselves.";
  } else if (org.type === "HITBOX") {
    text = "HitBox-owned: platform staff approve this drop.";
  } else {
    text = "The owning organization decides who approves this drop.";
  }

  return (
    <p className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
      <span className="font-medium text-[var(--text-2)]">Approval: </span>
      {text}
    </p>
  );
}
