"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, Info, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/client";
import {
  useCreateMyVendorBatch,
  useMyVendorBatch,
  useRegisterMyVendorManifest,
} from "@/lib/api/hooks";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { Badge, Button, Field, Input, Mono, Panel, Textarea, toneForStatus } from "@/components/ui/primitives";
import {
  BatchLines,
  Reconciliation,
  Row,
  TabButton,
} from "@/components/supply/consignment-drawer";
import { ManifestForm } from "@/components/supply/manifest-form";
import {
  ConsignmentStepper,
  chipProgressText,
  manifestComplete,
  rejectionNote,
} from "@/components/supply/consignment-lifecycle";
import { AllotmentCoverageBanner } from "@/components/supply/allotment-coverage";
import {
  SUPPLY_ITEM_TYPES,
  type SupplyBatch,
  type SupplyBatchStatus,
  type SupplyItemType,
  type VendorBatchInput,
  type VendorDropAssignment,
  type VendorMe,
} from "@/lib/types";

/**
 * The vendor's side of a consignment (vendor-portal-api.md §5–6).
 *
 * A vendor books a shipment for one of its assigned drops and uploads the
 * chip manifest for it. Deciding it — accept or reject — is HitBox's, and so
 * is any QC change after registration; neither is offered here.
 */

const ACCEPTS_ROWS: SupplyBatchStatus[] = ["UPLOADED", "VALIDATED"];

/**
 * Booked past the allotment and not yet decided: HitBox has to raise the
 * allotment before it can accept. Once decided the question is moot.
 */
/** What the vendor is waiting on, or has to do next, in one sentence. */
function StatusMessage({ batch }: { batch: SupplyBatch }) {
  let tone: "info" | "positive" | "danger" = "info";
  let text: React.ReactNode;
  switch (batch.status) {
    case "UPLOADED":
      text = "Waiting for HitBox to validate. You can check your chip file now (dry run).";
      break;
    case "VALIDATED":
      text = manifestComplete(batch)
        ? "All chips uploaded. Waiting for HitBox to accept."
        : `Upload your chip file. ${chipProgressText(batch)}.`;
      break;
    case "ACCEPTED":
      tone = "positive";
      text = "Accepted. Units added to the drop.";
      break;
    case "REJECTED": {
      tone = "danger";
      const why = rejectionNote(batch.notes);
      text = why ? `Rejected by HitBox: ${why}` : "Rejected by HitBox.";
      break;
    }
    default:
      text = humanize(batch.status);
  }
  return (
    <p
      className={cn(
        "rounded-[6px] px-2.5 py-1.5 text-[12px] leading-relaxed",
        tone === "positive"
          ? "bg-[var(--positive-dim)] text-[var(--positive)]"
          : tone === "danger"
            ? "bg-[var(--danger-dim)] text-[var(--danger)]"
            : "bg-[var(--surface-2)] text-[var(--text-2)]"
      )}
    >
      {text}
    </p>
  );
}

export function awaitingIncrease(batch: SupplyBatch): boolean {
  return (
    !!batch.allotment &&
    !batch.allotment.covered &&
    ACCEPTS_ROWS.includes(batch.status)
  );
}

const DRAWER =
  "rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]";

/* ------------------------------------------------------------------ */
/* One consignment                                                      */
/* ------------------------------------------------------------------ */

export function VendorConsignmentDrawer({
  batch: initial,
  me,
  drops,
  canWrite,
  onClose,
}: {
  batch: SupplyBatch;
  me: VendorMe;
  drops: VendorDropAssignment[];
  canWrite: boolean;
  onClose: () => void;
}) {
  // The row from the list is a snapshot; read the live one so counts move
  // after a manifest commits.
  const live = useMyVendorBatch(initial.id);
  const batch = live.data ?? initial;
  const register = useRegisterMyVendorManifest(batch.id);
  const [tab, setTab] = React.useState<"detail" | "manifest">("detail");

  const stillAssigned = !!batch.dropId && drops.some((d) => d.dropId === batch.dropId);
  const disabledReason = !me.vendor.isActive
    ? "HitBox has deactivated your vendor, so new manifests are refused. Your consignments stay readable — contact HitBox."
    : !stillAssigned
      ? "This consignment's drop is no longer assigned to your vendor, so it takes no more manifests. HitBox can still complete it."
      : !ACCEPTS_ROWS.includes(batch.status)
        ? `This consignment is ${humanize(batch.status).toLowerCase()}. A decided consignment takes no more rows.`
        : null;
  // A real upload only once HitBox has validated; a dry run works before.
  const canCommit = batch.status === "VALIDATED";

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className={`${DRAWER} max-w-[640px]`}>
          <div className="space-y-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                  {batch.batchRef ?? "Consignment"}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                  <span>{batch.drop?.name ?? "No drop"}</span>
                  <Badge tone={toneForStatus(batch.status)} dot>
                    {humanize(batch.status)}
                  </Badge>
                  <Badge tone="neutral">{humanize(batch.itemType)}</Badge>
                  {awaitingIncrease(batch) ? (
                    <Badge tone="warning">Awaiting allotment increase from HitBox</Badge>
                  ) : null}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm" aria-label="Close">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </Dialog.Close>
            </div>
            <ConsignmentStepper batch={batch} />
            <StatusMessage batch={batch} />
          </div>

          {canWrite ? (
            <div className="flex items-center gap-1 border-b border-[var(--hairline)] px-4 py-2">
              <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
                Detail
              </TabButton>
              <TabButton active={tab === "manifest"} onClick={() => setTab("manifest")}>
                <ScanLine className="h-3.5 w-3.5" />
                Upload chip manifest
              </TabButton>
            </div>
          ) : null}

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {tab === "manifest" ? (
              <ManifestForm
                batch={batch}
                disabled={!!disabledReason}
                disabledReason={disabledReason}
                submit={register.mutateAsync}
                allowChunking
                canCommit={canCommit}
                commitBlockedReason="Uploading opens once HitBox validates this consignment. Run a dry run now to check your file."
                onCommitted={() => void live.refetch()}
              />
            ) : (
              <>
                {awaitingIncrease(batch) && batch.allotment ? (
                  <AllotmentCoverageBanner allotment={batch.allotment} audience="vendor" />
                ) : null}

                {/* tagsRegistered needs nfc-tag-claim:read — a vendor never holds it. */}
                <Reconciliation batch={batch} canReadChips={false} />

                <BatchLines batch={batch} />

                <Panel>
                  <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                    Consignment
                  </p>
                  <div className="space-y-2 px-3 pb-3">
                    <Row label="Drop">
                      {batch.drop ? (
                        <span className="text-[12px] text-[var(--text-1)]">
                          {batch.drop.name}{" "}
                          <Mono className="text-[10px]">{batch.drop.groupCode}</Mono>
                        </span>
                      ) : (
                        <span className="text-[12px] text-[var(--text-3)]">—</span>
                      )}
                    </Row>
                    <Row label="Invoice">
                      {batch.vendorInvoiceRef ? (
                        <Mono className="text-[11px]">{batch.vendorInvoiceRef}</Mono>
                      ) : (
                        <span className="text-[12px] text-[var(--text-3)]">—</span>
                      )}
                    </Row>
                    <Row label="Received">
                      <span className="tnum text-[12px] text-[var(--text-1)]">
                        {formatDate(batch.receivedAt)}
                      </span>
                    </Row>
                    <Row label="Batch date">
                      <span className="tnum text-[12px] text-[var(--text-1)]">
                        {formatDate(batch.batchDate)}
                      </span>
                    </Row>
                    <Row label="Last updated">
                      <span className="tnum text-[12px] text-[var(--text-1)]">
                        {formatDateTime(batch.updatedAt)}
                      </span>
                    </Row>
                  </div>
                </Panel>

                {batch.notes ? (
                  <Panel className="px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                      Notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--text-1)]">
                      {batch.notes}
                    </p>
                  </Panel>
                ) : null}

                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
                  <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                  HitBox reviews the consignment once the manifest is in and
                  moves it to Validated, Accepted or Rejected.
                </p>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Booking a consignment                                                */
/* ------------------------------------------------------------------ */

/** Each variant's input starts at what is still to supply — the checklist's default. */
function prefillLines(a: VendorDropAssignment | undefined): Record<string, string> {
  return Object.fromEntries(
    (a?.variants ?? []).map((v) => [v.variantId, v.remaining > 0 ? String(v.remaining) : ""])
  );
}

export function NewVendorConsignmentDrawer({
  me,
  drops,
  onClose,
  onCreated,
}: {
  me: VendorMe;
  drops: VendorDropAssignment[];
  onClose: () => void;
  onCreated: (batch: SupplyBatch) => void;
}) {
  const create = useCreateMyVendorBatch();
  // Every assigned drop is bookable — even one fully booked: going over the
  // allotment is allowed, and HitBox raises it before accepting the extra.
  const [dropId, setDropId] = React.useState(drops.length === 1 ? drops[0].dropId : "");
  const assignment = drops.find((d) => d.dropId === dropId);
  const byVariant = !!assignment?.byVariant;
  // Per-variant quantities, pre-filled with what is still to supply.
  const [lineQty, setLineQty] = React.useState<Record<string, string>>(() =>
    prefillLines(assignment)
  );
  const [itemType, setItemType] = React.useState<SupplyItemType>(me.vendor.vendorType);
  const [quantity, setQuantity] = React.useState("");
  const [batchRef, setBatchRef] = React.useState("");
  const [invoiceRef, setInvoiceRef] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState("");
  const [batchDate, setBatchDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const chooseDrop = (id: string) => {
    setDropId(id);
    setLineQty(prefillLines(drops.find((d) => d.dropId === id)));
  };

  const num = (v: string | undefined) => (v && v.trim() ? Number(v) : 0);
  const lines = (assignment?.variants ?? [])
    .filter((v) => num(lineQty[v.variantId]) > 0)
    .map((v) => ({ variantId: v.variantId, quantity: num(lineQty[v.variantId]) }));
  const lineTotal = lines.reduce((sum, l) => sum + l.quantity, 0);
  const capRemaining = !byVariant ? (assignment?.progress.remaining ?? null) : null;

  // Over the allotment: warned, never blocked (the backend books it and
  // flags `allotment.covered: false`).
  const overLines = (assignment?.variants ?? [])
    .map((v) => ({ v, over: num(lineQty[v.variantId]) - v.remaining }))
    .filter((x) => x.over > 0);
  const qtyNum = Number(quantity) || 0;
  const capOver = capRemaining !== null && qtyNum > capRemaining ? qtyNum - capRemaining : 0;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;

    const next: Record<string, string> = {};
    if (!dropId) next.dropId = "Required.";
    const qty = Number(quantity);
    if (byVariant) {
      if (lines.length === 0) next.lines = "Enter at least one variant's quantity.";
    } else if (!quantity.trim() || !Number.isInteger(qty) || qty < 1 || qty > 1_000_000) {
      next.quantity = "A whole number of units, 1 – 1,000,000.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload: VendorBatchInput = {
      dropId,
      itemType,
      // A by-variant drop takes lines (quantity is their sum, server-side);
      // one without takes a plain quantity. The wrong shape is a 400.
      ...(byVariant ? { lines } : { quantity: qty }),
      batchRef: batchRef.trim() || undefined,
      vendorInvoiceRef: invoiceRef.trim() || undefined,
      receivedAt: receivedAt || undefined,
      batchDate: batchDate || undefined,
      notes: notes.trim() || undefined,
    };

    create.mutate(payload, {
      onSuccess: (batch) => {
        if (batch.allotment && !batch.allotment.covered) {
          toast.warning("Consignment booked — awaiting an allotment increase from HitBox");
        } else {
          toast.success("Consignment booked — upload its chip manifest next");
        }
        onCreated(batch);
      },
      onError: (err: unknown) =>
        toast.error(err instanceof ApiError ? err.friendly : "Could not book the consignment."),
    });
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className={`${DRAWER} max-w-[520px]`}>
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                New consignment
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                One shipment of goods for one drop.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form
            id="vendor-consignment-form"
            onSubmit={submit}
            className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            <Field
              label="Drop"
              htmlFor="vc-drop"
              error={errors.dropId}
              required
              hint="Only drops HitBox has assigned to you."
            >
              <select
                id="vc-drop"
                value={dropId}
                onChange={(e) => chooseDrop(e.target.value)}
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
              >
                <option value="">Choose a drop</option>
                {drops.map((d) => (
                  <option key={d.dropId} value={d.dropId}>
                    {d.drop.name} — {d.drop.groupCode}
                    {d.progress.remaining !== null
                      ? ` (${formatNumber(d.progress.remaining)} left)`
                      : ""}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Contains" htmlFor="vc-type" required>
                <select
                  id="vc-type"
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
              {byVariant ? (
                <Field label="Units shipped" htmlFor="vc-total" hint="The sum of the variant lines.">
                  <Input id="vc-total" value={formatNumber(lineTotal)} disabled readOnly />
                </Field>
              ) : (
                <Field
                  label="Units shipped"
                  htmlFor="vc-qty"
                  error={errors.quantity}
                  required
                  hint={
                    capRemaining !== null
                      ? `${formatNumber(capRemaining)} left on your allotment. The manifest can't exceed what you book.`
                      : "The manifest can't exceed it."
                  }
                >
                  <Input
                    id="vc-qty"
                    inputMode="numeric"
                    value={quantity}
                    invalid={!!errors.quantity}
                    onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
                    placeholder="500"
                  />
                </Field>
              )}
            </div>

            {byVariant && assignment ? (
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium text-[var(--text-2)]">
                  Units per variant
                  <span className="ml-1 font-normal text-[var(--text-3)]">
                    — ship any subset; leave a variant blank to send it later
                  </span>
                </p>
                <ul className="divide-y divide-[var(--hairline)] rounded-[8px] border border-[var(--hairline)]">
                  {assignment.variants.map((v) => {
                    const over = num(lineQty[v.variantId]) > v.remaining;
                    const name = v.label ?? v.variantCode ?? "Variant";
                    return (
                      <li key={v.variantId} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] text-[var(--text-1)]">{name}</p>
                          <p className="text-[10.5px] text-[var(--text-3)]">
                            {v.variantCode ? (
                              <>
                                <Mono className="text-[9.5px]">{v.variantCode}</Mono> ·{" "}
                              </>
                            ) : null}
                            {formatNumber(v.remaining)} of {formatNumber(v.allotted)} left
                            {v.overBooked > 0 ? ` · already ${formatNumber(v.overBooked)} over` : ""}
                          </p>
                        </div>
                        <Input
                          aria-label={`Units of ${name}`}
                          inputMode="numeric"
                          value={lineQty[v.variantId] ?? ""}
                          className={cn(
                            "h-7 w-24 text-right text-[12.5px]",
                            over && "border-[var(--warning)]"
                          )}
                          onChange={(e) =>
                            setLineQty((q) => ({
                              ...q,
                              [v.variantId]: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          placeholder="—"
                        />
                      </li>
                    );
                  })}
                </ul>
                {errors.lines ? (
                  <p className="text-[11px] text-[var(--danger)]">{errors.lines}</p>
                ) : null}
              </div>
            ) : null}

            {overLines.length > 0 || capOver > 0 ? (
              <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--warning)]">
                <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {capOver > 0
                    ? `${formatNumber(capOver)} over your allotment.`
                    : `Over your allotment on ${overLines
                        .map((x) => `${x.v.label ?? x.v.variantCode ?? "a variant"} (+${formatNumber(x.over)})`)
                        .join(", ")}.`}{" "}
                  You can still book it — HitBox has to raise your allotment
                  before it can accept the extra.
                </span>
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Batch label" htmlFor="vc-ref" hint="What's printed on the carton.">
                <Input
                  id="vc-ref"
                  maxLength={100}
                  value={batchRef}
                  onChange={(e) => setBatchRef(e.target.value)}
                  placeholder="SZ-2026-114"
                />
              </Field>
              <Field label="Invoice number" htmlFor="vc-inv">
                <Input
                  id="vc-inv"
                  maxLength={100}
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="INV-88213"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Shipped / received" htmlFor="vc-received" hint="Defaults to today.">
                <Input
                  id="vc-received"
                  type="date"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                />
              </Field>
              <Field label="Batch date" htmlFor="vc-batchdate" hint="Defaults to the received date.">
                <Input
                  id="vc-batchdate"
                  type="date"
                  value={batchDate}
                  onChange={(e) => setBatchDate(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="vc-notes">
              <Textarea
                id="vc-notes"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </form>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              type="submit"
              form="vendor-consignment-form"
              variant="primary"
              size="sm"
              loading={create.isPending}
            >
              Book consignment
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
