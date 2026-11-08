"use client";

import * as React from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Hash,
  Loader2,
  Nfc,
  Printer,
  ScanLine,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAdminOrder, useOrderUnitCandidates, useProductVariants } from "@/lib/api/hooks";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  detectScanKind,
  nfcSerialToTagId,
  packerError,
  playError,
  playSuccess,
  readNfcTag,
  useDuplicateGuard,
  webNfcSupported,
  type PackerError,
} from "@/lib/packing";
import { COMPANY } from "@/lib/company";
import { ShipmentForm } from "@/components/orders/shipment-ui";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Mono, Skeleton, Tooltip } from "@/components/ui/primitives";
import type { AdminOrderDetail, OrderAddress, OrderPackingState, UnitScan } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* What to pick                                                        */
/* ------------------------------------------------------------------ */

/** The largest text on the packing screen: what to take off the shelf. */
export function PickCard({ state, className }: { state: OrderPackingState; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[14px] border-2 border-[var(--accent)] bg-[var(--accent-dim)] px-5 py-4",
        className
      )}
    >
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-text)]">Pick</p>
      <p className="text-[40px] font-bold leading-tight tracking-[-0.02em] text-[var(--text-1)] sm:text-[52px]">
        {state.variantLabel ?? state.productName}
      </p>
      <p className="mt-1 text-[13px] text-[var(--text-2)]">
        {state.variantLabel ? `${state.productName} · ` : ""}
        <span className="font-mono">{state.variantCode ?? state.productCode}</span>
      </p>
      {state.unitState === "PROVISIONAL" ? (
        <p className="mt-2 text-[12px] text-[var(--text-3)]">
          Take <strong className="text-[var(--text-2)]">any</strong> item matching this label and scan it.
        </p>
      ) : null}
    </div>
  );
}

export function UnitStateChip({ state }: { state: OrderPackingState["unitState"] }) {
  if (state === "PROVISIONAL") return <Badge tone="warning" dot>To pack</Badge>;
  if (state === "ASSIGNED") return <Badge tone="positive" dot>Packed</Badge>;
  return <Badge tone="neutral">Nothing to pack</Badge>;
}

const FLOW = ["PAID", "PROCESSING", "SHIPPED"] as const;
const FLOW_LABEL = { PAID: "Paid", PROCESSING: "Packed", SHIPPED: "Shipped" } as const;

/** PAID → (scan) → PROCESSING → (ship) → SHIPPED. */
export function StatusFlow({ status }: { status: string }) {
  const at = status === "DELIVERED" ? 3 : FLOW.indexOf(status as (typeof FLOW)[number]);
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Packing progress">
      {FLOW.map((s, i) => {
        const done = at > i || (at === i && s === "SHIPPED");
        const here = at === i && s !== "SHIPPED";
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium",
                done
                  ? "bg-[var(--positive-dim)] text-[var(--positive)]"
                  : here
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-3)] text-[var(--text-3)]"
              )}
            >
              {done ? <Check className="h-3 w-3" aria-hidden /> : null}
              {FLOW_LABEL[s]}
            </span>
            {i < FLOW.length - 1 ? (
              <span className="flex items-center gap-1 text-[10.5px] text-[var(--text-3)]">
                {i === 0 ? "scan" : "ship"}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </span>
            ) : null}
          </li>
        );
      })}
      {at === -1 ? <Badge tone="neutral">{status}</Badge> : null}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Scan station — keyboard wedge first, NFC tap where supported        */
/* ------------------------------------------------------------------ */

export interface ScanStationHandle {
  focus: () => void;
}

/**
 * The always-ready scan box.
 *
 * Barcode scanners type the code fast and press Enter, so this is a plain
 * input that submits on Enter. It is disabled while a request is in flight
 * and takes focus back the moment it isn't — the packer never reaches for the
 * mouse. A duplicate of the same value within 1.5 s is dropped (scanners can
 * double-fire).
 */
export const ScanStation = React.forwardRef<
  ScanStationHandle,
  {
    busy: boolean;
    disabled?: boolean;
    /** The order's productCode — makes the SKU-code/tag decision exact. */
    productCode?: string | null;
    onScan: (scan: UnitScan) => void;
    /** Show the "enter serial number" fallback (order-first only). */
    allowSerial?: boolean;
    size?: "md" | "xl";
    placeholder?: string;
  }
>(function ScanStation(
  { busy, disabled, productCode, onScan, allowSerial, size = "md", placeholder },
  ref
) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState("");
  const [serial, setSerial] = React.useState("");
  const [nfcState, setNfcState] = React.useState<"idle" | "waiting">("idle");
  const nfcAbort = React.useRef<AbortController | null>(null);
  const fresh = useDuplicateGuard(1500);
  const [nfcAvailable, setNfcAvailable] = React.useState(false);

  React.useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  // Detected after mount — `window` doesn't exist during the server render.
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setNfcAvailable(webNfcSupported()));
    return () => cancelAnimationFrame(id);
  }, []);

  // Back to the input as soon as a request settles.
  React.useEffect(() => {
    if (!busy && !disabled) inputRef.current?.focus();
  }, [busy, disabled]);

  React.useEffect(() => () => nfcAbort.current?.abort(), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    setValue("");
    if (!v || busy || disabled || !fresh(v)) return;
    onScan(detectScanKind(v, productCode) === "skuCode" ? { skuCode: v } : { tagId: v });
  };

  const submitSerial = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(serial.replace(/^#/, ""));
    if (!Number.isInteger(n) || n < 1 || busy || disabled) return;
    setSerial("");
    onScan({ serialNumber: n });
  };

  const tap = async () => {
    if (nfcState === "waiting") {
      nfcAbort.current?.abort();
      setNfcState("idle");
      return;
    }
    const ctrl = new AbortController();
    nfcAbort.current = ctrl;
    setNfcState("waiting");
    try {
      const sn = await readNfcTag(ctrl.signal);
      const tagId = nfcSerialToTagId(sn);
      if (fresh(tagId)) onScan({ tagId });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error(err instanceof Error ? err.message : "NFC read failed.");
      }
    } finally {
      ctrl.abort();
      setNfcState("idle");
    }
  };

  const xl = size === "xl";

  return (
    <div className="space-y-2">
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          {busy ? (
            <Loader2
              className={cn(
                "pointer-events-none absolute top-1/2 -translate-y-1/2 animate-spin text-[var(--accent-text)]",
                xl ? "left-4 h-6 w-6" : "left-3 h-5 w-5"
              )}
            />
          ) : (
            <ScanLine
              className={cn(
                "pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-3)]",
                xl ? "left-4 h-6 w-6" : "left-3 h-5 w-5"
              )}
            />
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy || disabled}
            placeholder={placeholder ?? "Scan a tag or barcode…"}
            aria-label="Scan a tag or barcode"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            className={cn(
              "w-full rounded-[12px] border-2 border-[var(--hairline-strong)] bg-[var(--surface-2)] font-mono text-[var(--text-1)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60",
              xl ? "h-16 pl-14 pr-4 text-[22px]" : "h-12 pl-11 pr-3 text-[16px]"
            )}
          />
        </div>
        {nfcAvailable ? (
          <Button
            type="button"
            variant={nfcState === "waiting" ? "primary" : "secondary"}
            className={xl ? "h-16 px-5" : "h-12 px-4"}
            disabled={busy || disabled}
            onClick={tap}
          >
            <Nfc className="h-4 w-4" />
            {nfcState === "waiting" ? "Hold tag to phone…" : "Tap NFC"}
          </Button>
        ) : null}
      </form>

      {allowSerial ? (
        <form onSubmit={submitSerial} className="flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 text-[var(--text-3)]" aria-hidden />
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value.replace(/[^\d#]/g, ""))}
            disabled={busy || disabled}
            inputMode="numeric"
            placeholder="or enter serial number"
            aria-label="Serial number"
            className="h-7 w-[180px] rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)]"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={!serial || busy || disabled}>
            Use serial
          </Button>
        </form>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export type Feedback =
  | { kind: "success"; state: OrderPackingState; scanned: string }
  | { kind: "error"; error: PackerError; raw: unknown; scanned: string };

/** Builds feedback from a failure, plays the error sound. */
export function failure(err: unknown, scanned: string): Feedback {
  playError();
  return { kind: "error", error: packerError(err), raw: err, scanned };
}

export function success(state: OrderPackingState, scanned: string): Feedback {
  playSuccess();
  return { kind: "success", state, scanned };
}

export function ScanErrorCard({
  feedback,
  expectedLabel,
}: {
  feedback: Extract<Feedback, { kind: "error" }>;
  /** What the order needs, in words — the API sends only ids. */
  expectedLabel?: string | null;
}) {
  const { error } = feedback;
  const wrong = error.code === "ORDERS_WRONG_ITEM";
  return (
    <div
      role="alert"
      className={cn(
        "rounded-[12px] border-2 px-4 py-3",
        error.tone === "danger"
          ? "border-[var(--danger)] bg-[var(--danger-dim)]"
          : "border-[var(--warning)] bg-[var(--warning-dim)]"
      )}
    >
      <p
        className={cn(
          "flex items-start gap-2 text-[17px] font-semibold",
          error.tone === "danger" ? "text-[var(--danger)]" : "text-[var(--warning)]"
        )}
      >
        {error.tone === "danger" ? <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
        {error.title}
      </p>
      {error.detail ? <p className="mt-1 text-[12.5px] text-[var(--text-2)]">{error.detail}</p> : null}
      {error.link ? (
        <Link href={error.link.href} className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--text-1)] underline-offset-2 hover:underline">
          {error.link.label} →
        </Link>
      ) : null}
      {wrong ? <WrongItem raw={feedback.raw} expectedLabel={expectedLabel} /> : null}
      <p className="mt-1.5 text-[11px] text-[var(--text-3)]">
        Scanned <span className="font-mono">{feedback.scanned}</span>
      </p>
    </div>
  );
}

/**
 * details: { expected: { productId, variantId }, scanned: { productId,
 * variantId, skuCode } } — resolved to variant labels through the drop's
 * variants so the packer reads "M / Black" vs "S / Black", not uuids.
 */
function WrongItem({ raw, expectedLabel }: { raw: unknown; expectedLabel?: string | null }) {
  const d = (raw instanceof ApiError ? raw.details : null) as {
    expected?: { productId?: string; variantId?: string | null };
    scanned?: { productId?: string; variantId?: string | null; skuCode?: string };
  } | null;
  const expectedVariants = useProductVariants(d?.expected?.productId, false, !!d?.expected?.productId);
  const scannedSame = d?.scanned?.productId && d.scanned.productId === d?.expected?.productId;
  const scannedVariants = useProductVariants(
    d?.scanned?.productId,
    false,
    !!d?.scanned?.productId && !scannedSame
  );
  const label = (list: typeof expectedVariants.data, id?: string | null) =>
    id ? list?.find((v) => v.id === id)?.label : null;

  const expected =
    expectedLabel ?? label(expectedVariants.data, d?.expected?.variantId) ?? "The order's item";
  const scanned =
    label(scannedSame ? expectedVariants.data : scannedVariants.data, d?.scanned?.variantId) ??
    (scannedSame ? "Another variant of this drop" : "An item from a different drop");

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="rounded-[10px] border border-[var(--positive)] bg-[var(--surface-1)] px-3 py-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--positive)]">Order needs</p>
        <p className="text-[20px] font-bold text-[var(--text-1)]">{expected}</p>
      </div>
      <div className="rounded-[10px] border border-[var(--danger)] bg-[var(--surface-1)] px-3 py-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--danger)]">You scanned</p>
        <p className="text-[20px] font-bold text-[var(--text-1)]">{scanned}</p>
        {d?.scanned?.skuCode ? <p className="font-mono text-[11px] text-[var(--text-3)]">{d.scanned.skuCode}</p> : null}
      </div>
    </div>
  );
}

export function PackedCard({ state, children }: { state: OrderPackingState; children?: React.ReactNode }) {
  if (state.unitState !== "ASSIGNED" || !state.unit) return null;
  return (
    <div className="rounded-[12px] border-2 border-[var(--positive)] bg-[var(--positive-dim)] px-4 py-3">
      <p className="flex items-center gap-2 text-[17px] font-semibold text-[var(--positive)]">
        <CheckCircle2 className="h-5 w-5" />
        Packed: <span className="font-mono">{state.unit.skuCode}</span>
        <span className="text-[var(--text-2)]">(#{state.unit.serialNumber})</span>
      </p>
      <p className="mt-0.5 text-[12px] text-[var(--text-3)]">
        {state.unit.tagId ? <>Tag <Mono className="text-[10.5px]">{state.unit.tagId}</Mono> · </> : null}
        Scanned {formatDateTime(state.unitAssignedAt)}
      </p>
      {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ship                                                                */
/* ------------------------------------------------------------------ */

/**
 * PATCH status SHIPPED, with an optional tracking note. Disabled until the
 * unit is scanned — the server refuses it (ORDERS_UNIT_NOT_ASSIGNED) anyway.
 */
export function ShipAction({
  orderId,
  readyToShip,
  status,
  onShipped,
  compact,
}: {
  orderId: string;
  readyToShip: boolean;
  status: string;
  onShipped?: () => void;
  compact?: boolean;
}) {
  const perms = usePermissions();
  const [open, setOpen] = React.useState(false);
  // The caller's packing state may be a snapshot (scan-first result card),
  // so a ship made here is remembered rather than offered again.
  const [justShipped, setJustShipped] = React.useState(false);

  if (!perms.can("order", "manage")) return null;
  if (justShipped || status === "SHIPPED" || status === "DELIVERED") {
    return (
      <Badge tone="positive" dot>
        {status === "DELIVERED" ? "Delivered" : "Shipped"}
      </Badge>
    );
  }

  if (!open) {
    return (
      <Tooltip content={readyToShip ? null : "Scan the item before shipping."}>
        <span>
          <Button
            variant="primary"
            size={compact ? "sm" : "md"}
            disabled={!readyToShip}
            onClick={() => setOpen(true)}
          >
            <Truck className="h-3.5 w-3.5" />
            Ship (add tracking)
          </Button>
        </span>
      </Tooltip>
    );
  }

  // Shipping = recording the carrier and tracking number
  // (POST /admin/orders/:id/shipment); a bare status change is refused.
  return (
    <div className="w-full rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-1)] p-3">
      <ShipmentForm
        orderId={orderId}
        compact
        onDone={() => {
          playSuccess();
          setOpen(false);
          setJustShipped(true);
          onShipped?.();
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm                                                             */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-3)]">
          <Dialog.Title className="text-[15px] font-semibold text-[var(--text-1)]">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-2)]">{body}</div>
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={busy} onClick={onConfirm} autoFocus>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Available units — read from the SKU API                             */
/* ------------------------------------------------------------------ */

/**
 * Units a packer could take for this order, straight from
 * GET /admin/orders/:orderId/unit/candidates — only units a scan would
 * accept, so nothing is filtered here. The one already held for this order
 * (checkout's placeholder, or the confirmed unit) is marked. Choosing one is
 * the same as scanning its SKU code.
 */
export function AvailableUnits({
  state,
  onPick,
  busy,
}: {
  state: OrderPackingState;
  onPick: (skuCode: string) => void;
  busy: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const limit = 8;

  const list = useOrderUnitCandidates(state.orderId, {
    page,
    limit,
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const assignedId = state.unitState === "ASSIGNED" ? state.unit?.skuId : null;

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--hairline)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2">
        <p className="text-[12px] font-medium text-[var(--text-2)]">
          Available units
          {list.data ? (
            <span className="ml-1.5 font-normal text-[var(--text-3)]">
              {formatNumber(total)} can go in this parcel{state.variantLabel ? ` · ${state.variantLabel}` : ""}
            </span>
          ) : null}
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Serial or code"
            aria-label="Search available units"
            className="h-7 w-[170px] rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] pl-7 pr-2 text-[12px] text-[var(--text-1)]"
          />
        </div>
      </div>

      {list.isLoading ? (
        <div className="space-y-1.5 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <p className="px-3 py-3 text-[12px] text-[var(--text-3)]">
          {list.error instanceof ApiError ? list.error.friendly : "Units could not be loaded."}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-[12px] text-[var(--text-3)]">
          {search ? "No available unit matches." : "No unit in stock can go in this parcel."}
        </p>
      ) : (
        <ul className={cn("divide-y divide-[var(--hairline)]", list.isFetching && "opacity-60")}>
          {rows.map((u) => {
            const isAssigned = u.skuId === assignedId;
            return (
              <li
                key={u.skuId}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2",
                  u.heldForThisOrder && "bg-[var(--info-dim)]"
                )}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--text-1)]">
                    <span className="font-mono">{u.skuCode}</span>
                    <span className="text-[var(--text-3)]">#{u.serialNumber}</span>
                    {isAssigned ? (
                      <Badge tone="positive" className="px-1 py-0 text-[10px]">In parcel</Badge>
                    ) : u.heldForThisOrder ? (
                      <Tooltip content="Already held for this order. Choosing it confirms it as-is.">
                        <span>
                          <Badge tone="info" className="px-1 py-0 text-[10px]">Reserved for this order</Badge>
                        </span>
                      </Tooltip>
                    ) : null}
                  </p>
                  {u.tagId ? <Mono className="text-[10px]">{u.tagId}</Mono> : null}
                </div>
                <Button
                  variant={u.heldForThisOrder && !isAssigned ? "secondary" : "ghost"}
                  size="sm"
                  disabled={isAssigned || busy}
                  onClick={() => onPick(u.skuCode)}
                >
                  Use this one
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-[var(--hairline)] px-3 py-1.5 text-[11.5px] text-[var(--text-3)]">
          <span>
            Page {page} of {totalPages}
          </span>
          <span className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Packing slip                                                        */
/* ------------------------------------------------------------------ */

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Prints once the unit is ASSIGNED. Reads the order itself (addresses, buyer,
 * market) when the caller doesn't pass it, and waits for it — so the slip
 * never prints with empty address boxes because an order was still loading.
 */
export function PackingSlipButton({
  state,
  order: given,
  size = "sm",
}: {
  state: OrderPackingState;
  order?: AdminOrderDetail | null;
  size?: "sm" | "md";
}) {
  const fetched = useAdminOrder(given ? undefined : state.orderId);
  const order = given ?? fetched.data ?? null;
  if (state.unitState !== "ASSIGNED") return null;
  const loading = !given && fetched.isLoading;
  return (
    <Button
      variant="secondary"
      size={size}
      loading={loading}
      disabled={loading}
      onClick={() => printPackingSlip(state, order)}
    >
      <Printer className="h-3.5 w-3.5" />
      Packing slip
    </Button>
  );
}

function addressHtml(a: OrderAddress | undefined, extra: (string | null | undefined)[] = []) {
  if (!a) return null;
  const lines = [
    `<strong>${esc(a.recipientName)}</strong>`,
    esc(a.line1),
    a.line2 ? esc(a.line2) : null,
    esc([a.city, a.state, a.postalCode].filter(Boolean).join(", ")),
    esc(a.countryCode),
    a.phone ? `Phone: ${esc(a.phone)}` : null,
    ...extra.filter(Boolean).map((x) => esc(String(x))),
  ];
  return lines.filter(Boolean).join("<br>");
}

/**
 * A professional packing slip for the ASSIGNED unit — never the placeholder.
 * Seller details come from configuration (src/lib/company.ts); prices are
 * deliberately absent, as on any slip that travels inside the parcel.
 */
export function printPackingSlip(state: OrderPackingState, order?: AdminOrderDetail | null) {
  if (state.unitState !== "ASSIGNED" || !state.unit) return;

  const shipping = order?.addresses.find((a) => a.usage === "SHIPPING");
  const billing = order?.addresses.find((a) => a.usage === "BILLING");
  const buyerLine = order?.buyerEmail ? `Email: ${order.buyerEmail}` : null;

  const shipHtml =
    addressHtml(shipping ?? billing) ??
    `<span class="muted">No shipping address on file for this order.</span>`;
  const billHtml = billing
    ? addressHtml(billing, [buyerLine])
    : shipping
      ? `${addressHtml(shipping, [buyerLine])}<div class="muted small" style="margin-top:4px">Same as shipping address</div>`
      : order?.buyerName || order?.buyerEmail
        ? [order?.buyerName ? `<strong>${esc(order.buyerName)}</strong>` : null, buyerLine ? esc(buyerLine) : null]
            .filter(Boolean)
            .join("<br>")
        : `<span class="muted">No billing address on file.</span>`;

  const c = COMPANY;
  const companyContact = [c.phone && `Tel ${esc(c.phone)}`, c.email && esc(c.email), c.website && esc(c.website)]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");
  const companyIds = [c.taxId && `${esc(c.taxLabel)}: ${esc(c.taxId)}`, c.regNo && `CIN: ${esc(c.regNo)}`]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  // The brand mark is white on transparent (made for the dark console); the
  // slip inverts it to black, so it prints crisply without "print backgrounds".
  const logoUrl = `${window.location.origin}/brand/hitbox-mark-256.png`;

  const meta: [string, string][] = [
    ["Order date", formatDateTime(state.placedAt)],
    ["Packed on", formatDateTime(state.unitAssignedAt)],
    ["Printed on", formatDateTime(new Date().toISOString())],
    ...(order?.market ? ([["Market", `${order.market.name} (${order.market.code})`]] as [string, string][]) : []),
    ...(order?.shipment
      ? ([["Tracking", `${order.shipment.carrierName} ${order.shipment.trackingNumber}`]] as [string, string][])
      : order?.trackingNote
        ? ([["Tracking", order.trackingNote]] as [string, string][])
        : []),
  ];

  const qtyOrdered = order?.quantity ?? 1;

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Packing slip — ${esc(state.publicCode)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 12px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; color: #111; margin: 0; background: #fff; }
  .page { max-width: 780px; margin: 0 auto; padding: 28px 16px 24px; }
  @media print { .page { padding: 0; } .noprint { display: none !important; } }
  .muted { color: #6b7280; } .small { font-size: 10.5px; }
  .mono { font-family: ui-monospace, "Cascadia Mono", Menlo, monospace; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; }
  .toolbar span { margin-right: auto; align-self: center; color: #6b7280; }
  .toolbar button { padding: 7px 16px; border: 0; border-radius: 6px; background: #111; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #111; }
  .brand { display: flex; gap: 14px; align-items: flex-start; }
  .logo { width: 58px; height: 58px; flex: none; filter: invert(1); object-fit: contain; }
  .co-name { font-size: 30px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.15; }
  .co-tag { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b7280; margin-top: 2px; }
  .co-legal { font-weight: 600; margin-top: 6px; }
  .co-lines { margin-top: 4px; color: #374151; }
  .doc { text-align: right; min-width: 250px; }
  .doc h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  .order-code { display: inline-block; margin: 8px 0 8px; padding: 5px 12px; border: 1.5px solid #111; border-radius: 4px; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
  .order-code small { display: block; font: 600 8.5px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: #6b7280; text-align: left; margin-bottom: 1px; }
  .doc table { margin-left: auto; border-collapse: collapse; }
  .doc td { padding: 1px 0 1px 14px; text-align: right; white-space: nowrap; }
  .doc td:first-child { color: #6b7280; }
  .addr { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 20px 0 18px; }
  .box { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; min-height: 96px; }
  .box h2 { margin: 0 0 6px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items th { text-align: left; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #fff; background: #111; padding: 7px 8px; }
  table.items td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; vertical-align: top; }
  table.items .pick { font-size: 15px; font-weight: 700; }
  .num { text-align: right; }
  .note { margin-top: 14px; padding: 10px 12px; background: #f9fafb; border-left: 3px solid #111; }
  .sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 44px; }
  .sign div { border-top: 1px solid #9ca3af; padding-top: 4px; font-size: 10.5px; color: #6b7280; }
  footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; gap: 10px; text-align: center; }
  footer img { width: 20px; height: 20px; filter: invert(1); opacity: 0.85; }
</style></head><body>
<div class="toolbar noprint"><span>Packing slip · ${esc(state.publicCode)}</span><button onclick="window.print()">Print</button></div>
<div class="page">
  <header>
    <div class="brand">
      <img class="logo" src="${logoUrl}" alt="${esc(c.name)}">
      <div>
        <div class="co-name">${esc(c.name)}</div>
        <div class="co-tag">Authentic collectibles</div>
        ${c.legalName && c.legalName !== c.name ? `<div class="co-legal">${esc(c.legalName)}</div>` : ""}
        ${c.addressLines.length ? `<div class="co-lines">${c.addressLines.map(esc).join("<br>")}</div>` : ""}
        ${companyContact ? `<div class="muted" style="margin-top:4px">${companyContact}</div>` : ""}
        ${companyIds ? `<div class="muted small">${companyIds}</div>` : ""}
      </div>
    </div>
    <div class="doc">
      <h1>Packing slip</h1>
      <div class="order-code mono"><small>Order no.</small>${esc(state.publicCode)}</div>
      <table>${meta.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
    </div>
  </header>

  <section class="addr">
    <div class="box"><h2>Bill to</h2>${billHtml}</div>
    <div class="box"><h2>Ship to</h2>${shipHtml}</div>
  </section>

  <table class="items">
    <thead><tr>
      <th style="width:28px">#</th><th>Item</th><th>Unit code</th><th>Serial</th><th>NFC tag</th><th class="num">Qty</th>
    </tr></thead>
    <tbody><tr>
      <td>1</td>
      <td>
        <div class="pick">${esc(state.variantLabel ?? state.productName)}</div>
        <div>${esc(state.productName)}</div>
        <div class="muted small mono">${esc(state.variantCode ?? state.productCode)}</div>
      </td>
      <td class="mono">${esc(state.unit.skuCode)}</td>
      <td>#${state.unit.serialNumber}</td>
      <td class="mono">${esc(state.unit.tagId ?? "—")}</td>
      <td class="num">1</td>
    </tr></tbody>
  </table>
  ${qtyOrdered > 1 ? `<p class="muted small">This order is for ${qtyOrdered} units; this slip covers the unit scanned above.</p>` : ""}

  <div class="note">
    <strong>Authenticity.</strong> This item carries a unique NFC tag
    (<span class="mono">${esc(state.unit.tagId ?? "—")}</span>). The buyer claims ownership by tapping it
    with their phone. Do not swap the item after this slip is printed.
  </div>
  ${c.returnsNote ? `<div class="note" style="border-left-color:#9ca3af"><strong>Returns.</strong> ${esc(c.returnsNote)}</div>` : ""}

  <div class="sign"><div>Packed by</div><div>Checked by</div><div>Date</div></div>

  <footer>
    <img src="${logoUrl}" alt="">
    <div>
      <div>Thank you for your order from ${esc(c.name)}.</div>
      ${c.email || c.phone ? `<div class="muted small">Questions? ${[c.email && esc(c.email), c.phone && esc(c.phone)].filter(Boolean).join(" · ")} — quote order ${esc(state.publicCode)}.</div>` : ""}
    </div>
  </footer>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=860,height=1000");
  if (!w) {
    toast.error("Allow pop-ups to print the packing slip.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
