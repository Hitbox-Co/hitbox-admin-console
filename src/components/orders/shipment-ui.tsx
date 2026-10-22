"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  History,
  Nfc,
  Package,
  PackageCheck,
  Pencil,
  ShoppingCart,
  Truck,
  Undo2,
  UserCog,
  XCircle,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCorrectShipment, useRecordShipment } from "@/lib/api/hooks";
import { formatDateTime, humanize, shortId } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAuthz, usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Field, Input, Panel, PanelHeader, Textarea, toneForStatus } from "@/components/ui/primitives";
import type { AdminOrderDetail, OrderHistoryEntry, OrderShipment } from "@/lib/types";

/**
 * Shipping and history (order-history-and-shipments.md).
 *
 *   PROCESSING ─(record shipment: carrier + tracking no.)─▶ SHIPPED
 *              ─(staff confirms, or buyer taps the NFC tag)─▶ DELIVERED
 *
 * There is no carrier integration: the operator types in what the carrier
 * gave them. Shipping happens ONLY by recording a shipment, so an order can
 * never be shipped without a tracking number for the buyer.
 */

/** Carriers offered as suggestions; anything else can be typed. */
const DEFAULT_CARRIERS = [
  "Delhivery",
  "Blue Dart",
  "DTDC",
  "India Post",
  "Ecom Express",
  "Xpressbees",
  "Shadowfax",
  "DHL",
  "FedEx",
  "UPS",
  "Royal Mail",
  "USPS",
];
const CARRIER_KEY = "hitbox.recentCarriers";

function recentCarriers(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CARRIER_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function rememberCarrier(name: string) {
  try {
    const next = [name, ...recentCarriers().filter((c) => c.toLowerCase() !== name.toLowerCase())].slice(0, 8);
    localStorage.setItem(CARRIER_KEY, JSON.stringify(next));
  } catch {
    /* a convenience only */
  }
}

/** The server strips spaces, then wants 4–40 letters, digits or dashes. */
const cleanTracking = (v: string) => v.replace(/\s+/g, "");
const TRACKING_RE = /^[A-Za-z0-9-]{4,40}$/;

/* ------------------------------------------------------------------ */
/* Ship / correct form                                                 */
/* ------------------------------------------------------------------ */

export function ShipmentForm({
  orderId,
  mode = "record",
  current,
  onDone,
  onCancel,
  compact,
}: {
  orderId: string;
  mode?: "record" | "correct";
  /** The shipment being corrected — prefills the form. */
  current?: OrderShipment | null;
  onDone?: (detail: AdminOrderDetail) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const record = useRecordShipment(orderId);
  const correct = useCorrectShipment(orderId);
  const busy = record.isPending || correct.isPending;

  const [carrier, setCarrier] = React.useState(current?.carrierName ?? "");
  const [tracking, setTracking] = React.useState(current?.trackingNumber ?? "");
  const [url, setUrl] = React.useState(current?.trackingUrl ?? "");
  const [note, setNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [inUse, setInUse] = React.useState<string | null>(null);
  const [carriers, setCarriers] = React.useState<string[]>(DEFAULT_CARRIERS);
  const listId = React.useId();

  // Recently used carriers first — read after mount (localStorage).
  React.useEffect(() => {
    const id = requestAnimationFrame(() =>
      setCarriers([...new Set([...recentCarriers(), ...DEFAULT_CARRIERS])])
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const submit = (allowDuplicate = false) => {
    const next: Record<string, string> = {};
    const c = carrier.trim();
    const t = cleanTracking(tracking);
    const u = url.trim();
    if (c.length < 2 || c.length > 60) next.carrierName = "The carrier's name, 2–60 characters.";
    if (!TRACKING_RE.test(t)) next.trackingNumber = "4–40 letters, digits or dashes (spaces are removed).";
    if (u && !/^https:\/\/\S+$/.test(u)) next.trackingUrl = "Must start with https:// — the buyer will open it.";
    if (mode === "correct" && reason.trim().length < 3) next.reason = "Say why it's being corrected (3–500 characters).";
    setErrors(next);
    if (Object.keys(next).length) return;

    const body = {
      carrierName: c,
      trackingNumber: t,
      ...(u ? { trackingUrl: u } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(allowDuplicate ? { allowDuplicate: true } : {}),
    };
    const handlers = {
      onSuccess: (detail: AdminOrderDetail) => {
        rememberCarrier(c);
        setInUse(null);
        toast.success(mode === "correct" ? "Tracking corrected" : `Shipped with ${c} · ${t}`);
        onDone?.(detail);
      },
      onError: (err: unknown) => {
        if (err instanceof ApiError && err.code === "ORDERS_TRACKING_IN_USE") {
          const d = (err.details ?? {}) as { orderId?: string };
          setInUse(d.orderId ?? "another order");
          return;
        }
        if (err instanceof ApiError && err.status === 422) setErrors(err.fieldErrors);
        toast.error(err instanceof ApiError ? err.validationSummary ?? err.friendly : "Could not record the shipment.");
      },
    };
    if (mode === "correct") correct.mutate({ ...body, reason: reason.trim() }, handlers);
    else record.mutate(body, handlers);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-3"
    >
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
        <Field label="Carrier" htmlFor={`sh-carrier-${orderId}`} required error={errors.carrierName}>
          <Input
            id={`sh-carrier-${orderId}`}
            list={listId}
            value={carrier}
            invalid={!!errors.carrierName}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="Delhivery"
            autoFocus
          />
          <datalist id={listId}>
            {carriers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Tracking number"
          htmlFor={`sh-track-${orderId}`}
          required
          error={errors.trackingNumber}
          hint={tracking && cleanTracking(tracking) !== tracking ? `Saved as ${cleanTracking(tracking)}` : undefined}
        >
          <Input
            id={`sh-track-${orderId}`}
            value={tracking}
            invalid={!!errors.trackingNumber}
            onChange={(e) => {
              setTracking(e.target.value);
              setInUse(null);
            }}
            placeholder="1490 0000 0012 3"
            className="font-mono"
            spellCheck={false}
          />
        </Field>
      </div>
      <Field
        label="Tracking link"
        htmlFor={`sh-url-${orderId}`}
        error={errors.trackingUrl}
        hint="Optional — the carrier's page for this parcel. Shown to the buyer as Track parcel."
      >
        <Input
          id={`sh-url-${orderId}`}
          value={url}
          invalid={!!errors.trackingUrl}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          inputMode="url"
        />
      </Field>
      {mode === "correct" ? (
        <Field label="Why it's being corrected" htmlFor={`sh-reason-${orderId}`} required error={errors.reason}>
          <Textarea
            id={`sh-reason-${orderId}`}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Last digit was mistyped"
          />
        </Field>
      ) : null}
      <Field label="Internal note" htmlFor={`sh-note-${orderId}`} hint="Optional — never shown to the buyer.">
        <Input
          id={`sh-note-${orderId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Fragile — packed with extra foam"
        />
      </Field>

      {inUse ? (
        <div className="space-y-2 rounded-[8px] border border-[var(--warning)] bg-[var(--warning-dim)] px-3 py-2.5 text-[12.5px] text-[var(--text-1)]">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
            <span>
              This carrier and number are already on{" "}
              {inUse.length > 20 ? (
                <Link href={`/orders/${inUse}`} target="_blank" className="font-mono text-[var(--accent-text)] hover:underline">
                  order {shortId(inUse)}
                </Link>
              ) : (
                inUse
              )}
              . That&rsquo;s usually a paste from the wrong row.
            </span>
          </p>
          <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => submit(true)}>
            It&rsquo;s one parcel for both — ship anyway
          </Button>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          <Truck className="h-3.5 w-3.5" />
          {mode === "correct" ? "Save corrected tracking" : "Ship"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Shipment card                                                       */
/* ------------------------------------------------------------------ */

function CopyText({ value }: { value: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      aria-label="Copy tracking number"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Could not copy.");
        }
      }}
      className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
    >
      {done ? <Check className="h-3.5 w-3.5 text-[var(--positive)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function ShipmentCard({ order }: { order: AdminOrderDetail }) {
  const perms = usePermissions();
  const [correcting, setCorrecting] = React.useState(false);
  const s = order.shipment;
  const voided = (order.shipments ?? []).filter((x) => x.status === "VOIDED");
  if (!s && !voided.length) return null;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5" /> Shipment
          </span>
        }
        action={
          order.canCorrectShipment && perms.can("order", "manage") && !correcting ? (
            <Button variant="ghost" size="sm" onClick={() => setCorrecting(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Correct tracking
            </Button>
          ) : null
        }
      />
      {s ? (
        <div className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[14px] font-semibold text-[var(--text-1)]">{s.carrierName}</span>
            <span className="flex items-center font-mono text-[13px] text-[var(--text-1)]">
              {s.trackingNumber}
              <CopyText value={s.trackingNumber} />
            </span>
            {s.trackingUrl ? (
              <Button asChild variant="secondary" size="sm">
                <a href={s.trackingUrl} target="_blank" rel="noreferrer">
                  Track parcel <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            ) : (
              <span className="text-[11.5px] text-[var(--text-3)]">No tracking link — use the carrier&rsquo;s website.</span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-3">
            <div>
              <dt className="text-[var(--text-3)]">Shipped</dt>
              <dd className="text-[var(--text-1)]">{formatDateTime(s.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-3)]">Delivered</dt>
              <dd className="text-[var(--text-1)]">
                {s.deliveredAt ? formatDateTime(s.deliveredAt) : "Not yet"}
              </dd>
            </div>
            {s.deliveredVia ? (
              <div>
                <dt className="text-[var(--text-3)]">Confirmed by</dt>
                <dd className="flex items-center gap-1 text-[var(--text-1)]">
                  {s.deliveredVia === "NFC_CLAIM" ? (
                    <>
                      <Nfc className="h-3.5 w-3.5 text-[var(--positive)]" /> Buyer tapped the tag
                    </>
                  ) : (
                    <>
                      <UserCog className="h-3.5 w-3.5" /> Confirmed by staff
                    </>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {s.note ? (
            <p className="rounded-[6px] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] text-[var(--text-2)]">
              <span className="text-[var(--text-3)]">Internal note: </span>
              {s.note}
            </p>
          ) : null}
        </div>
      ) : null}

      {correcting && s ? (
        <div className="border-t border-[var(--hairline)] px-4 py-3">
          <p className="mb-2 text-[12px] text-[var(--text-3)]">
            The current tracking is voided (kept on record) and replaced by this one.
          </p>
          <ShipmentForm
            orderId={order.id}
            mode="correct"
            current={s}
            onDone={() => setCorrecting(false)}
            onCancel={() => setCorrecting(false)}
          />
        </div>
      ) : null}

      {voided.length ? (
        <div className="border-t border-[var(--hairline)] px-4 py-2.5">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">Previous tracking</p>
          <ul className="space-y-1">
            {voided.map((v) => (
              <li key={v.id} className="text-[12px] text-[var(--text-3)]">
                <span className="line-through">
                  {v.carrierName} · <span className="font-mono">{v.trackingNumber}</span>
                </span>
                {v.voidReason ? <span> — {v.voidReason}</span> : null}
                {v.voidedAt ? <span> ({formatDateTime(v.voidedAt)})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* History timeline                                                    */
/* ------------------------------------------------------------------ */

const SOURCE: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  CHECKOUT: { label: "Checkout", icon: ShoppingCart },
  PAYMENT: { label: "Payment", icon: CreditCard },
  PACKING: { label: "Packing scan", icon: PackageCheck },
  SHIPMENT: { label: "Shipment recorded", icon: Truck },
  ADMIN: { label: "Staff", icon: UserCog },
  NFC_CLAIM: { label: "Buyer tapped the tag", icon: Nfc },
  REFUND: { label: "Refund", icon: Undo2 },
  CHECKOUT_SWEEP: { label: "Checkout expired", icon: XCircle },
  BACKFILL: { label: "Before history", icon: History },
};

export function OrderHistory({ order }: { order: AdminOrderDetail }) {
  const { me } = useAuthz();
  const rows = order.history ?? [];
  if (!rows.length) return null;

  const who = (h: OrderHistoryEntry) => {
    if (!h.actorId) return h.source === "CHECKOUT_SWEEP" || h.source === "PAYMENT" ? "System" : null;
    if (me?.userId && h.actorId === me.userId) return "you";
    if (h.source === "CHECKOUT") return "the buyer";
    return `staff ${shortId(h.actorId)}`;
  };

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="History" description="Every status change, as recorded at the time." />
      <ol className="px-4 py-3">
        {rows.map((h, i) => {
          const src = SOURCE[h.source] ?? { label: humanize(h.source), icon: Package };
          const Icon = src.icon;
          const by = who(h);
          const meta = h.metadata ?? {};
          const tracking =
            h.source === "SHIPMENT" && (meta.carrierName || meta.trackingNumber)
              ? `${String(meta.carrierName ?? "")} ${String(meta.trackingNumber ?? "")}`.trim()
              : null;
          return (
            <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < rows.length - 1 ? (
                <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-[var(--hairline-strong)]" />
              ) : null}
              <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--hairline-strong)] bg-[var(--surface-2)]">
                <Icon className="h-3.5 w-3.5 text-[var(--text-2)]" />
              </span>
              <div className="min-w-0 pt-0.5">
                {h.source === "BACKFILL" ? (
                  <p className="text-[12.5px] text-[var(--text-2)]">
                    Earlier history not recorded — the order was{" "}
                    <Badge tone={toneForStatus(h.toStatus)}>{humanize(h.toStatus)}</Badge> when history began.
                  </p>
                ) : (
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--text-1)]">
                    {h.fromStatus ? (
                      <>
                        <span className="text-[var(--text-3)]">{humanize(h.fromStatus)}</span>
                        <span className="text-[var(--text-3)]">→</span>
                      </>
                    ) : null}
                    <Badge tone={toneForStatus(h.toStatus)} dot>
                      {humanize(h.toStatus)}
                    </Badge>
                    <span className="text-[11.5px] text-[var(--text-3)]">
                      {src.label}
                      {by ? ` · ${by}` : ""}
                    </span>
                  </p>
                )}
                <p className="tnum text-[11px] text-[var(--text-3)]">{formatDateTime(h.occurredAt)}</p>
                {h.reason ? <p className="mt-0.5 text-[12px] text-[var(--text-2)]">“{h.reason}”</p> : null}
                {tracking ? <p className="mt-0.5 font-mono text-[11.5px] text-[var(--text-2)]">{tracking}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
