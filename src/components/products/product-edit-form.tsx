"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Info, Lock } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useProductVariants, useUpdateProduct } from "@/lib/api/hooks";
import { DropTypePicker } from "./drop-type-picker";
import { humanize } from "@/lib/format";
import { Badge, Button, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import {
  ProductDetailsFields,
  detailsFromProduct,
  detailsToInput,
  validateDetails,
  type ProductDetailsDraft,
} from "./product-details-fields";
import type { AdminProductDetail, ProductInput } from "@/lib/types";

/**
 * Edit drop — the catalog fields only, as PATCH /admin/products/:id takes
 * them.
 *
 * What is NOT here, and why:
 *   - status   — the outcome of the workflow, not a field. PATCH is .strict()
 *                and refuses it with a 422; the drop's detail offers Submit,
 *                the review screen offers Approve/Reject, and Publish is its
 *                own gated route.
 *   - groupCode, units, gallery, prices — each has its own route and its own
 *                panel on the drop's detail.
 *
 * Only CHANGED fields are sent. A PATCH naming every field would rewrite
 * columns nobody touched — and on a drop under review, a no-op rewrite of
 * ownership or age fields reads in the audit trail like a real change.
 */

/** States in which a review exists that an edit does not reach back into. */
const REVIEWED = new Set(["SUBMITTED", "IN_REVIEW", "APPROVED", "PUBLISHED", "ACTIVE"]);
const LIVE_OR_CLEARED = new Set(["APPROVED", "PUBLISHED", "ACTIVE"]);

function changedFields(before: ProductInput, after: ProductInput): ProductInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k])) {
      out[k] = v;
    }
  }
  return out as ProductInput;
}

export function ProductEditForm({ product }: { product: AdminProductDetail }) {
  const router = useRouter();
  const update = useUpdateProduct(product.id);
  const initial = React.useMemo(() => detailsFromProduct(product), [product]);
  const [draft, setDraft] = React.useState<ProductDetailsDraft>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  /*
   * The type can change only while the drop has NO variants — archived ones
   * count (409 PRODUCTS_DROP_TYPE_LOCKED). Read with archived rows so the
   * lock matches the server's.
   */
  const initialType = product.dropType?.code ?? "";
  const [dropType, setDropType] = React.useState(initialType);
  const variantsQuery = useProductVariants(product.id, true);
  const variantCount = variantsQuery.data?.length ?? (product.variants ?? []).length;
  const typeLocked = variantCount > 0;

  const changes = React.useMemo(() => {
    const out = changedFields(detailsToInput(initial), detailsToInput(draft));
    if (dropType !== initialType) out.dropType = dropType || null;
    return out;
  }, [initial, draft, dropType, initialType]);
  const dirty = Object.keys(changes).length > 0;

  const ownershipChanged = "organizationId" in changes || "artistId" in changes;
  const ageChanged = "isAgeSpecific" in changes || "minimumAge" in changes;
  const archived = !!product.archivedAt || product.status === "ARCHIVED";

  const back = () => router.push(`/products/${product.id}`);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (update.isPending || !dirty) return;
    const next = validateDetails(draft, "edit");
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    update.mutate(changes, {
      onSuccess: (saved) => {
        toast.success(`${saved.name ?? product.name} saved`);
        back();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "PRODUCTS_DROP_TYPE_LOCKED") {
          setErrors({ dropType: err.friendly });
          setDropType(initialType);
        }
        if (err instanceof ApiError && err.status === 422) {
          setErrors(err.fieldErrors);
          toast.error(err.validationSummary ?? err.friendly);
          return;
        }
        toast.error(err instanceof ApiError ? err.friendly : "Could not save the drop.");
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Mono className="text-[11px]">{product.groupCode}</Mono>
        <span className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
          Status
          <Badge tone={toneForStatus(product.status)} dot>
            {humanize(product.status)}
          </Badge>
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
          <Lock className="h-3 w-3" aria-hidden />
          Not editable here — it moves through submit, the owner&rsquo;s decision and
          publish.
        </span>
      </Panel>

      {archived ? (
        <Notice tone="warning">
          This drop is archived. Its catalog fields can still be corrected, but it
          cannot be submitted or published again.
        </Notice>
      ) : null}

      <Panel className="overflow-hidden">
        <form onSubmit={submit}>
          <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-[var(--text-2)]">Drop type</span>
                {typeLocked ? (
                  <span className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                    <Lock className="h-3 w-3" aria-hidden />
                    Locked — this drop has {variantCount} variant{variantCount === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <DropTypePicker
                value={dropType}
                onChange={(code) => setDropType(code)}
                disabled={typeLocked || update.isPending}
                allowUntyped={!initialType}
                error={errors.dropType}
              />
              {typeLocked ? (
                <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
                  A type can change only while the drop has no variants, archived ones
                  included — they were checked against this type&rsquo;s rules.
                </p>
              ) : null}
            </div>

            <ProductDetailsFields
              value={draft}
              onChange={setDraft}
              errors={errors}
              mode="edit"
              disabled={update.isPending}
            />

            {ownershipChanged && REVIEWED.has(product.status) ? (
              <Notice tone="warning">
                The review already opened for this drop keeps the approver it was
                resolved with — authority is frozen on the review row. The new owner
                is asked only on the next submission.
              </Notice>
            ) : null}

            {ageChanged && LIVE_OR_CLEARED.has(product.status) ? (
              <Notice tone="warning">
                The approval was recorded against the old age settings. Publishing
                re-checks them, so an age-restricted drop with no minimum age will be
                refused at the publish step.
              </Notice>
            ) : null}

            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
              <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
              Pricing, gallery and serialized units are edited from the drop&rsquo;s own
              panels. Clearing a field here removes its value.
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3 sm:px-6">
            <Button type="button" variant="ghost" size="sm" onClick={back}>
              Cancel
            </Button>
            <span className="ml-auto text-[11px] text-[var(--text-3)]">
              {dirty
                ? `${Object.keys(changes).length} field${Object.keys(changes).length === 1 ? "" : "s"} changed`
                : "No changes"}
            </span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={update.isPending}
              disabled={!dirty}
            >
              Save changes
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warning"; children: React.ReactNode }) {
  return (
    <p
      data-tone={tone}
      className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]"
    >
      <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
