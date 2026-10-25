"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Info, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCreateSupplyBatch, useProductVariants, useVendors } from "@/lib/api/hooks";
import { formatNumber, humanize } from "@/lib/format";
import { DropPicker } from "@/components/finance/entity-pickers";
import { Button, Field, Input, Mono, Textarea } from "@/components/ui/primitives";
import {
  SUPPLY_ITEM_TYPES,
  type SupplyBatchInput,
  type SupplyItemType,
} from "@/lib/types";

/**
 * Book a carton in. Lands as UPLOADED — the chips are registered against it
 * next, and only then is the acceptance decision taken.
 */
export function NewConsignmentDrawer({ onClose }: { onClose: () => void }) {
  const create = useCreateSupplyBatch();
  /* Only an unarchived vendor can take a new consignment: the API answers
     409 SUPPLY_VENDOR_ARCHIVED, so do not offer one. */
  const vendorsQuery = useVendors({ isActive: true, limit: 200 });
  const vendors = vendorsQuery.data?.data ?? [];
  const [vendorId, setVendorId] = React.useState("");
  const [dropId, setDropId] = React.useState<string | undefined>();
  /* A drop with live variants may be split per variant, as the vendor portal
     does. Optional for staff, and staff bookings are not capped by allotments. */
  const variantsQuery = useProductVariants(dropId);
  const liveVariants = (variantsQuery.data ?? []).filter((v) => v.isActive && !v.archived);
  const [split, setSplit] = React.useState(false);
  const [lineQty, setLineQty] = React.useState<Record<string, string>>({});
  const splitting = split && liveVariants.length > 0;
  const lines = liveVariants
    .map((v) => ({ variantId: v.id, quantity: Number(lineQty[v.id] || 0) }))
    .filter((l) => l.quantity > 0);
  const lineTotal = lines.reduce((sum, l) => sum + l.quantity, 0);
  const [itemType, setItemType] = React.useState<SupplyItemType>("FIGURE");
  const [quantity, setQuantity] = React.useState("");
  const [batchRef, setBatchRef] = React.useState("");
  const [invoiceRef, setInvoiceRef] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState("");
  const [sourceFileRef, setSourceFileRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;

    const next: Record<string, string> = {};
    if (!vendorId) next.vendorId = "Required.";
    const qty = Number(quantity);
    if (splitting) {
      if (lines.length === 0) next.lines = "Enter at least one variant's quantity.";
    } else if (!quantity.trim() || !Number.isInteger(qty) || qty < 1) {
      next.quantity = "A whole number of units, at least 1.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload: SupplyBatchInput = {
      vendorId,
      dropId: dropId || undefined,
      itemType,
      // With lines, quantity is their sum server-side — sending both invites a mismatch.
      ...(splitting ? { lines } : { quantity: qty }),
      batchRef: batchRef.trim() || undefined,
      vendorInvoiceRef: invoiceRef.trim() || undefined,
      // Defaults to now server-side, and batchDate then follows it, so a
      // same-day intake needs neither.
      receivedAt: receivedAt || undefined,
      sourceFileRef: sourceFileRef.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    create.mutate(payload, {
      onSuccess: () => {
        toast.success("Consignment booked in");
        onClose();
      },
      onError: (err: unknown) =>
        toast.error(
          err instanceof ApiError ? err.friendly : "Could not book the consignment."
        ),
    });
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[520px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Book a consignment in
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                Record the carton, then register what was in it.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form
            id="consignment-form"
            onSubmit={submit}
            className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            <Field label="Vendor" htmlFor="c-vendor" error={errors.vendorId} required>
              <select
                id="c-vendor"
                value={vendorId}
                disabled={vendorsQuery.isPending}
                onChange={(e) => setVendorId(e.target.value)}
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] disabled:opacity-60"
              >
                <option value="">
                  {vendorsQuery.isPending ? "Loading vendors…" : "Choose a vendor"}
                </option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {humanize(v.vendorType)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Drop"
              htmlFor="c-drop"
              hint="Optional. Leave empty for platform stock bought ahead of any drop."
            >
              <DropPicker
                id="c-drop"
                value={dropId}
                onChange={(v) => {
                  setDropId(v);
                  setSplit(false);
                  setLineQty({});
                }}
              />
            </Field>

            {dropId && liveVariants.length > 0 ? (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={split}
                    onChange={(e) => setSplit(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  Split by variant
                  <span className="text-[11px] text-[var(--text-3)]">
                    — each chip row will then name its variant
                  </span>
                </label>
                {split ? (
                  <>
                    <ul className="divide-y divide-[var(--hairline)] rounded-[8px] border border-[var(--hairline)]">
                      {liveVariants.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] text-[var(--text-1)]">{v.label}</p>
                            <Mono className="text-[9.5px]">{v.variantCode}</Mono>
                          </div>
                          <Input
                            aria-label={`Units of ${v.label}`}
                            inputMode="numeric"
                            value={lineQty[v.id] ?? ""}
                            onChange={(e) =>
                              setLineQty((q) => ({ ...q, [v.id]: e.target.value.replace(/\D/g, "") }))
                            }
                            placeholder="—"
                            className="h-7 w-24 text-right text-[12.5px]"
                          />
                        </li>
                      ))}
                    </ul>
                    {errors.lines ? (
                      <p className="text-[11px] text-[var(--danger)]">{errors.lines}</p>
                    ) : (
                      <p className="text-[11px] text-[var(--text-3)]">
                        Total {formatNumber(lineTotal)} — staff bookings are not capped by vendor allotments.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Contains"
                htmlFor="c-type"
                required
                hint="The product category of the goods in the carton."
              >
                <select
                  id="c-type"
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as SupplyItemType)}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
                >
                  {SUPPLY_ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Declared quantity"
                htmlFor="c-qty"
                error={errors.quantity}
                required
                hint="A ceiling — a manifest cannot exceed it."
              >
                <Input
                  id="c-qty"
                  inputMode="numeric"
                  disabled={splitting}
                  value={splitting ? String(lineTotal) : quantity}
                  invalid={!!errors.quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
                  placeholder="500"
                />
              </Field>
            </div>

            <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]">
              <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
              The chips arrive embedded in the goods, so register them against
              this consignment next. An item with no chip in it gets no row —
              the quantity is still the declared ceiling.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Batch reference" htmlFor="c-ref">
                <Input
                  id="c-ref"
                  value={batchRef}
                  onChange={(e) => setBatchRef(e.target.value)}
                  placeholder="CW-2026-0914"
                />
              </Field>
              <Field label="Vendor invoice" htmlFor="c-inv">
                <Input
                  id="c-inv"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="INV-88213"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Received" htmlFor="c-received" hint="Defaults to today.">
                <Input
                  id="c-received"
                  type="date"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                />
              </Field>
              <Field
                label="Source file"
                htmlFor="c-file"
                hint="A pointer to the vendor's manifest."
              >
                <Input
                  id="c-file"
                  value={sourceFileRef}
                  onChange={(e) => setSourceFileRef(e.target.value)}
                  placeholder="manifests/cw-2026-0914.xlsx"
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="c-notes">
              <Textarea
                id="c-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Two reels short against the packing list."
              />
            </Field>
          </form>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              type="submit"
              form="consignment-form"
              variant="primary"
              size="sm"
              loading={create.isPending}
            >
              Book in
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
