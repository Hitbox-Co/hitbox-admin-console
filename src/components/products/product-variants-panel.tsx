"use client";

import * as React from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, Layers, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useProductVariants, useRemoveVariant, useUpdateVariant } from "@/lib/api/hooks";
import { formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
  PanelHeader,
  Tooltip,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Meter } from "@/components/charts/charts";
import { STATUS } from "@/components/charts/palette";
import { GenerateVariantsDialog } from "./generate-variants-dialog";
import { ModeBadge, OptionChips, Swatch, VARIANTS_EDITABLE } from "./variant-bits";
import type { AdminProductDetail, DropVariant } from "@/lib/types";

/**
 * The drop's variants — its sellable options, size × colour, pack size…
 * (drop-types-and-variants.md §7, §10).
 *
 * The owner approves a drop TOGETHER WITH its variants, so:
 *   - add / remove only while the drop is DRAFT or REJECTED;
 *   - label, supply cap and the active flag can change in any status — none
 *     of them change WHAT the variant is;
 *   - options are never edited: they are the variant's identity, and units
 *     and orders point at it. Remove it and create another.
 *
 * Every write is a globalOnly catalog route, the same gate as Edit details.
 */
export function ProductVariantsPanel({ product }: { product: AdminProductDetail }) {
  const perms = usePermissions();
  const canWrite = perms.canManageCatalog();
  const [showArchived, setShowArchived] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<DropVariant | null>(null);

  const type = product.dropType ?? null;
  const mode = type?.variantMode ?? null;
  const archivedDrop = !!product.archivedAt || product.status === "ARCHIVED";
  const editable = VARIANTS_EDITABLE.has(product.status) && !archivedDrop;

  const query = useProductVariants(product.id, showArchived);
  const rows = React.useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.position - b.position),
    [query.data]
  );
  const active = rows.filter((v) => v.isActive && !v.archived);

  // Capped variants together cannot exceed the drop's supply (§9 rule 10).
  const cappedTotal = active.reduce((n, v) => n + (v.totalSupply ?? 0), 0);

  const columns = React.useMemo<Column<DropVariant>[]>(
    () => [
      {
        key: "variant",
        header: "Variant",
        cell: (v) => (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[var(--text-1)]">
              {v.options
                .filter((o) => o.hexCode)
                .map((o) => (
                  <Swatch key={o.dimension} hex={o.hexCode} />
                ))}
              {v.label}
            </p>
            <Mono className="mt-0.5 text-[10px]" title={v.variantCode}>
              {v.variantCode}
            </Mono>
          </div>
        ),
      },
      {
        key: "options",
        header: "Options",
        cell: (v) => <OptionChips options={v.options} />,
      },
      {
        key: "minted",
        header: "Minted",
        cell: (v) =>
          v.totalSupply != null ? (
            <div className="min-w-[120px]">
              <Meter
                label={`${formatNumber(v.mintedUnits)} / ${formatNumber(v.totalSupply)}`}
                value={v.mintedUnits}
                max={Math.max(v.totalSupply, 1)}
                color={v.mintedUnits >= v.totalSupply ? STATUS.good : STATUS.neutral}
              />
            </div>
          ) : (
            <Tooltip content="No per-variant cap — draws from the drop's total supply.">
              <span className="tnum cursor-help text-[12.5px] text-[var(--text-2)]">
                {formatNumber(v.mintedUnits)} <span className="text-[var(--text-3)]">· no cap</span>
              </span>
            </Tooltip>
          ),
      },
      {
        key: "status",
        header: "Status",
        cell: (v) =>
          v.archived ? (
            <Tooltip content="Kept because units, prices, orders or wishlists point at it. Select its combination again to restore it.">
              <span>
                <Badge tone="neutral" outline>
                  Archived
                </Badge>
              </span>
            </Tooltip>
          ) : v.isActive ? (
            <Badge tone="positive" dot>
              Active
            </Badge>
          ) : (
            <Tooltip content="No new units can be minted for it. It stays visible in history.">
              <span>
                <Badge tone="warning">Inactive</Badge>
              </span>
            </Tooltip>
          ),
      },
      ...(canWrite
        ? [
            {
              key: "actions",
              header: "",
              cell: (v: DropVariant) =>
                v.archived ? null : (
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${v.label}`}
                      onClick={() => setEditing(v)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {editable ? <RemoveVariant productId={product.id} variant={v} /> : null}
                  </div>
                ),
            },
          ]
        : []),
    ],
    [canWrite, editable, product.id]
  );

  const addButton =
    canWrite && type && mode !== "NONE" ? (
      editable ? (
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add variants
        </Button>
      ) : (
        <Tooltip content={`Locked while the drop is ${humanize(product.status).toLowerCase()} — see below.`}>
          <span>
            <Button variant="secondary" size="sm" disabled>
              <Lock className="h-3.5 w-3.5" />
              Add variants
            </Button>
          </span>
        </Tooltip>
      )
    ) : null;

  return (
    <>
      <Panel className="overflow-hidden">
        <PanelHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Variants
              {type ? (
                <>
                  <Badge tone="neutral">{type.name}</Badge>
                  <ModeBadge mode={type.variantMode} />
                </>
              ) : null}
            </span>
          }
          description={
            !type
              ? "Untyped drop — created before drop types, so no variant rules apply."
              : mode === "NONE"
                ? `A ${type.name.toLowerCase()} has no variants — one sellable item, minted against the drop itself.`
                : "Sellable options. The owner approves the drop together with these."
          }
          action={
            <div className="flex items-center gap-2">
              {mode !== "NONE" ? (
                <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="h-3 w-3 accent-[var(--accent)]"
                  />
                  Archived
                </label>
              ) : null}
              {addButton}
            </div>
          }
        />

        {!type && canWrite && rows.length === 0 ? (
          <Note>
            To give this drop variants, set its type under{" "}
            <Link href={`/products/${product.id}/edit`} className="text-[var(--accent-text)] hover:underline">
              Edit details
            </Link>{" "}
            first. A type can be set only while the drop has no variants.
          </Note>
        ) : null}

        {type && mode !== "NONE" && !editable && !archivedDrop ? (
          <Note icon={Lock}>
            Variants can&rsquo;t be added or removed while the drop is{" "}
            <strong>{humanize(product.status).toLowerCase()}</strong> — adding a size after
            sign-off would sell something the owner never approved. To change them, reject the
            review (an already-approved review can be turned into a rejection only by a System
            Admin), edit the variants, then resubmit. Label, supply cap and active flag stay
            editable.
          </Note>
        ) : null}

        {mode === "REQUIRED" && active.length === 0 && !query.isLoading ? (
          <Note icon={AlertTriangle} tone="warning">
            A {type?.name ?? "drop"} needs at least one active variant before it can be submitted
            for review, and every unit is minted against a variant.
          </Note>
        ) : null}

        {product.totalSupply > 0 && cappedTotal > 0 ? (
          <Note>
            Variant caps total {formatNumber(cappedTotal)} of the drop&rsquo;s{" "}
            {formatNumber(product.totalSupply)} declared units
            {cappedTotal < product.totalSupply
              ? ` — ${formatNumber(product.totalSupply - cappedTotal)} unallocated.`
              : "."}
          </Note>
        ) : null}

        {mode === "NONE" && rows.length === 0 ? null : query.isLoading ? (
          <TableSkeleton rows={3} cols={5} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(v) => v.id}
            dimmed={query.isFetching}
            emptyState={
              <EmptyState
                icon={Layers}
                title="No variants yet"
                description={
                  type && mode !== "NONE"
                    ? editable
                      ? "Pick values on each dimension and preview the combinations before creating them."
                      : "None were added before the drop left Draft."
                    : "This drop has no variants."
                }
                action={editable ? addButton : undefined}
              />
            }
          />
        )}
      </Panel>

      {adding && type ? (
        <GenerateVariantsDialog
          productId={product.id}
          typeCode={type.code}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {editing ? (
        <EditVariantDialog
          productId={product.id}
          variant={editing}
          dropSupply={product.totalSupply}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function Note({
  children,
  icon: Icon = Layers,
  tone,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "warning";
}) {
  return (
    <p
      className={[
        "flex items-start gap-2 border-b border-[var(--hairline)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]",
        tone === "warning" ? "bg-[var(--warning-dim)]" : "bg-[var(--surface-2)]",
      ].join(" ")}
    >
      <Icon
        className={[
          "mt-[1px] h-3.5 w-3.5 shrink-0",
          tone === "warning" ? "text-[var(--warning)]" : "text-[var(--text-3)]",
        ].join(" ")}
      />
      <span>{children}</span>
    </p>
  );
}

/** Two-step remove. The server deletes, or archives when anything points at it. */
function RemoveVariant({ productId, variant }: { productId: string; variant: DropVariant }) {
  const remove = useRemoveVariant(productId);
  const [confirming, setConfirming] = React.useState(false);

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${variant.label}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Button
        variant="danger"
        size="sm"
        loading={remove.isPending}
        onClick={() =>
          remove.mutate(variant.id, {
            onSuccess: (r) =>
              toast.success(
                r.outcome === "archived"
                  ? `${variant.label} archived — units or orders still point at it`
                  : `${variant.label} removed`
              ),
            onError: (err) => {
              setConfirming(false);
              toast.error(err instanceof ApiError ? err.friendly : "Could not remove the variant.");
            },
          })
        }
      >
        Remove
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  );
}

function EditVariantDialog({
  productId,
  variant,
  dropSupply,
  onClose,
}: {
  productId: string;
  variant: DropVariant;
  dropSupply: number;
  onClose: () => void;
}) {
  const update = useUpdateVariant(productId);
  const [label, setLabel] = React.useState(variant.label);
  const [supply, setSupply] = React.useState(variant.totalSupply != null ? String(variant.totalSupply) : "");
  const [isActive, setIsActive] = React.useState(variant.isActive);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (update.isPending) return;
    const next: Record<string, string> = {};
    const supplyN = supply ? Number(supply) : null;
    if (!label.trim()) next.label = "A label is required.";
    if (supplyN !== null && supplyN < variant.mintedUnits) {
      next.totalSupply = `At least ${formatNumber(variant.mintedUnits)} — that many are already minted.`;
    } else if (supplyN !== null && dropSupply > 0 && supplyN > dropSupply) {
      next.totalSupply = `More than the drop's declared supply of ${formatNumber(dropSupply)}.`;
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: Record<string, unknown> = {};
    if (label.trim() !== variant.label) body.label = label.trim();
    if (supplyN !== variant.totalSupply) body.totalSupply = supplyN;
    if (isActive !== variant.isActive) body.isActive = isActive;
    if (!Object.keys(body).length) {
      onClose();
      return;
    }
    update.mutate(
      { variantId: variant.id, body },
      {
        onSuccess: () => {
          toast.success(`${label.trim()} saved`);
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "PRODUCTS_VARIANT_SUPPLY_EXCEEDED") {
            setErrors({ totalSupply: err.friendly });
            return;
          }
          if (err instanceof ApiError && err.status === 422) {
            setErrors(err.fieldErrors);
          }
          toast.error(err instanceof ApiError ? err.friendly : "Could not save the variant.");
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Edit variant
              </Dialog.Title>
              <Dialog.Description asChild>
                <div className="mt-1 space-y-1">
                  <Mono className="text-[10.5px]">{variant.variantCode}</Mono>
                  <OptionChips options={variant.options} />
                </div>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="space-y-4 px-4 py-4">
            <Field label="Label" htmlFor="v-label" error={errors.label} required>
              <Input id="v-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field
              label="Supply cap"
              htmlFor="v-supply"
              error={errors.totalSupply}
              hint={`Blank draws from the drop's total. Can't go below the ${formatNumber(variant.mintedUnits)} already minted.`}
            >
              <Input
                id="v-supply"
                inputMode="numeric"
                value={supply}
                invalid={!!errors.totalSupply}
                onChange={(e) => setSupply(e.target.value.replace(/\D/g, ""))}
                placeholder="No cap"
              />
            </Field>
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              Active — new units can be minted for it
            </label>
            <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
              Options can&rsquo;t be changed — they are the variant&rsquo;s identity, and units and
              orders point at it. Remove it and add a new combination instead.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" variant="primary" size="sm" loading={update.isPending}>
                Save
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
