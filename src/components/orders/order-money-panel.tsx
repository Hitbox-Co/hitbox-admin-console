"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CreditCard, ExternalLink, RotateCcw, Undo2, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useRequestRefund } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Field, Input, Panel, PanelHeader, Textarea, Tooltip, toneForStatus } from "@/components/ui/primitives";
import type { AdminOrderDetail, OrderMoneySummary, RefundReasonCode } from "@/lib/types";

/**
 * The order's money: what was charged, collected and given back, every
 * payment attempt, every refund — and the Refund button
 * (order-payments-and-refunds-api.md §2, §3, §14).
 *
 * Two server fields mean nothing here re-implements a business rule:
 * `money.canRequestRefund` / `refundBlockedReason` decide the button, and
 * each refund's own page drives its workflow from `allowedActions`.
 *
 * `money`, `payments` and `refunds` arrive only with payment-royalty:read;
 * without it the card is absent, not empty.
 */

export const REFUND_REASONS: { value: RefundReasonCode; label: string; noReturn?: boolean }[] = [
  { value: "DEFECTIVE_ITEM", label: "Defective item" },
  { value: "DEFECTIVE_TAG", label: "Defective NFC tag" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "NOT_DELIVERED", label: "Not delivered", noReturn: true },
  { value: "DUPLICATE_CHARGE", label: "Duplicate charge", noReturn: true },
  { value: "BUYER_CHANGED_MIND", label: "Buyer changed their mind" },
  { value: "FRAUDULENT_CHARGE", label: "Fraudulent charge", noReturn: true },
  { value: "OTHER", label: "Other" },
];

const STRIPE = "https://dashboard.stripe.com";

function stripeLink(ref: string | null | undefined) {
  if (!ref) return null;
  if (ref.startsWith("pi_") || ref.startsWith("ch_")) return `${STRIPE}/payments/${ref}`;
  if (ref.startsWith("re_")) return `${STRIPE}/refunds/${ref}`;
  return null;
}

/** Statuses an order can be refunded from (§3, ORDER_NOT_REFUNDABLE). */
const REFUNDABLE_STATUSES = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);

export function OrderMoneyPanel({ order }: { order: AdminOrderDetail }) {
  const perms = usePermissions();
  const canOpenRefunds = perms.canOpen("/payments/refunds");
  const money = order.money;
  const payments = order.payments ?? [];
  const refunds = order.refunds ?? [];
  const [requesting, setRequesting] = React.useState(false);

  // Without payment-royalty:read nothing money-shaped is sent. A caller who
  // may still refund (order:refund:global) gets the button on its own.
  const canRefundBlind =
    !money && perms.hasAction("order", "refund", "global") && REFUNDABLE_STATUSES.has(order.status);
  if (!money && !order.payments && !order.refunds) {
    return canRefundBlind ? (
      <Panel className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-[12.5px] text-[var(--text-2)]">
          Refunds — amounts are hidden from your role, but you can raise one for the buyer.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setRequesting(true)}>
          <RotateCcw className="h-3.5 w-3.5" />
          Refund
        </Button>
        {requesting ? <RequestRefundDialog order={order} onClose={() => setRequesting(false)} /> : null}
      </Panel>
    ) : null;
  }

  const currency = money?.currency ?? order.currency ?? payments[0]?.currency ?? "USD";
  const fmt = (v: string) => formatCurrency(v, currency);

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Payments & refunds"
        description={order.paidAt ? `Paid ${formatDateTime(order.paidAt)}` : "Not paid yet."}
        action={money ? <RefundButton money={money} onRequest={() => setRequesting(true)} /> : null}
      />

      {money ? (
        <>
          <dl className="grid grid-cols-2 divide-[var(--hairline)] border-b border-[var(--hairline)] sm:grid-cols-4 sm:divide-x">
            {(
              [
                ["Charged", money.charged, "What the buyer was charged."],
                ["Paid", money.paid, "Succeeded payments only."],
                ["Refunded", money.refunded, "Processed refunds — money actually given back."],
                ["Refundable", money.refundable, "The most a new refund may ask for."],
              ] as const
            ).map(([k, v, help]) => (
              <Tooltip key={k} content={help}>
                <div className="cursor-help px-4 py-3">
                  <dt className="text-[11px] text-[var(--text-3)]">{k}</dt>
                  <dd
                    className={cn(
                      "tnum text-[17px] font-semibold tracking-[-0.01em]",
                      k === "Refunded" && Number(v) > 0 ? "text-[var(--info)]" : "text-[var(--text-1)]"
                    )}
                  >
                    {fmt(v)}
                  </dd>
                </div>
              </Tooltip>
            ))}
          </dl>
          {Number(money.refundInProgress) > 0 ? (
            <p className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] bg-[var(--warning-dim)] px-4 py-2 text-[12px] text-[var(--text-2)]">
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" aria-hidden />
              A refund of <strong className="font-medium text-[var(--text-1)]">{fmt(money.refundInProgress)}</strong> is in
              progress.
              {money.openRefundId && canOpenRefunds ? (
                <Link
                  href={`/payments/refunds/${money.openRefundId}`}
                  className="ml-auto inline-flex items-center gap-1 text-[var(--accent-text)] hover:underline"
                >
                  View refund <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Payment attempts */}
      <Section title="Payments" count={payments.length}>
        {payments.length === 0 ? (
          <Empty>No payment attempts recorded yet.</Empty>
        ) : (
          payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <Icon kind="payment" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--text-1)]">
                    <Badge tone={toneForStatus(p.status)} dot>
                      {humanize(p.status)}
                    </Badge>
                    {p.needsReview ? (
                      <Badge tone="warning" className="px-1 py-0 text-[10px]">
                        Needs review
                      </Badge>
                    ) : p.reviewedAt ? (
                      <Tooltip content={p.reviewNote ?? "Reviewed"}>
                        <span>
                          <Badge tone="neutral" className="px-1 py-0 text-[10px]">Reviewed</Badge>
                        </span>
                      </Tooltip>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--text-3)]">
                    {p.gateway ? humanize(p.gateway) : "—"} · {formatDateTime(p.createdAt)}
                    {p.gatewayRef ? <StripeRef value={p.gatewayRef} /> : null}
                  </p>
                  {p.failureReason ? (
                    <p className="mt-0.5 text-[11.5px] text-[var(--danger)]">{p.failureReason}</p>
                  ) : null}
                </div>
              </div>
              <span className="tnum text-[13px] font-medium text-[var(--text-1)]">
                {formatCurrency(p.amount, p.currency)}
              </span>
            </li>
          ))
        )}
      </Section>

      {/* Refunds */}
      <Section title="Refunds" count={refunds.length}>
        {refunds.length === 0 ? (
          <Empty>No refunds on this order.</Empty>
        ) : (
          refunds.map((r) => {
            const body = (
              <>
                <div className="flex min-w-0 items-start gap-2.5">
                  <Icon kind="refund" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--text-1)]">
                      <Badge tone={toneForStatus(r.status)} dot>
                        {humanize(r.status)}
                      </Badge>
                      <span>{humanize(r.reasonCode ?? "")}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--text-3)]">
                      Requested {formatDateTime(r.createdAt)}
                      {r.processedAt ? ` · paid back ${formatDateTime(r.processedAt)}` : ""}
                      {r.gatewayRefundId ? <StripeRef value={r.gatewayRefundId} /> : null}
                    </p>
                    {r.rejectionReason ? (
                      <p className="mt-0.5 text-[11.5px] text-[var(--danger)]">Rejected: {r.rejectionReason}</p>
                    ) : null}
                  </div>
                </div>
                <span className="flex items-center gap-2">
                  <span className="tnum text-[13px] font-medium text-[var(--info)]">
                    −{formatCurrency(r.amount, r.currency)}
                  </span>
                  {canOpenRefunds ? <ArrowRight className="h-3.5 w-3.5 text-[var(--text-3)]" /> : null}
                </span>
              </>
            );
            return (
              <li key={r.id}>
                {canOpenRefunds ? (
                  <Link
                    href={`/payments/refunds/${r.id}`}
                    className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })
        )}
      </Section>

      {requesting ? <RequestRefundDialog order={order} onClose={() => setRequesting(false)} /> : null}
    </Panel>
  );
}

/** The Refund button, from canRequestRefund / refundBlockedReason (§3). */
function RefundButton({ money, onRequest }: { money: OrderMoneySummary; onRequest: () => void }) {
  if (money.canRequestRefund) {
    return (
      <Button variant="secondary" size="sm" onClick={onRequest}>
        <RotateCcw className="h-3.5 w-3.5" />
        Refund
      </Button>
    );
  }
  switch (money.refundBlockedReason) {
    case "NO_PERMISSION":
      return null;
    case "REFUND_IN_PROGRESS":
      return money.openRefundId ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/payments/refunds/${money.openRefundId}`}>
            View refund in progress
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : null;
    case "FULLY_REFUNDED":
      return <Badge tone="info">Fully refunded</Badge>;
    case "ORDER_NOT_REFUNDABLE":
      return (
        <Tooltip content="Only paid, processing, shipped or delivered orders can be refunded.">
          <span>
            <Button variant="secondary" size="sm" disabled>
              <RotateCcw className="h-3.5 w-3.5" />
              Refund
            </Button>
          </span>
        </Tooltip>
      );
    default:
      return null;
  }
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--hairline)] last:border-b-0">
      <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        {title} {count ? <span className="normal-case tracking-normal">· {count}</span> : null}
      </p>
      <ul className="divide-y divide-[var(--hairline)]">{children}</ul>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-4 py-3 text-[12px] text-[var(--text-3)]">{children}</li>;
}

function Icon({ kind }: { kind: "payment" | "refund" }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        kind === "refund" ? "bg-[var(--info-dim)] text-[var(--info)]" : "bg-[var(--surface-3)] text-[var(--text-2)]"
      )}
    >
      {kind === "refund" ? <Undo2 className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}
    </span>
  );
}

/** A gateway reference, linked to the Stripe dashboard when recognisable. */
export function StripeRef({ value }: { value: string }) {
  const href = stripeLink(value);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 font-mono text-[10.5px] text-[var(--accent-text)] hover:underline"
    >
      {value}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  ) : (
    <span className="font-mono text-[10.5px]">{value}</span>
  );
}

/* ------------------------------------------------------------------ */
/* Request a refund — POST /refunds                                    */
/* ------------------------------------------------------------------ */

export function RequestRefundDialog({ order, onClose }: { order: AdminOrderDetail; onClose: () => void }) {
  const router = useRouter();
  const perms = usePermissions();
  const request = useRequestRefund();
  const money = order.money;
  const currency = money?.currency ?? order.currency ?? "";
  const max = money ? Number(money.refundable) : null;

  const [reasonCode, setReasonCode] = React.useState<RefundReasonCode>("DEFECTIVE_ITEM");
  const [reason, setReason] = React.useState("");
  const [partial, setPartial] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [returnRequired, setReturnRequired] = React.useState(true);
  const [touchedReturn, setTouchedReturn] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const pickReason = (code: RefundReasonCode) => {
    setReasonCode(code);
    // Nothing to send back for these — unless the operator chose otherwise.
    if (!touchedReturn) setReturnRequired(!REFUND_REASONS.find((r) => r.value === code)?.noReturn);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (request.isPending) return;
    const next: Record<string, string> = {};
    if (!reason.trim()) next.reason = "Say why — it's on the record and shown to the buyer.";
    let amountOut: string | undefined;
    if (partial) {
      const n = Number(amount);
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || n <= 0) next.amount = "An amount like 500 or 499.50.";
      else if (max !== null && n > max) next.amount = `At most ${formatCurrency(String(max), currency)} is refundable.`;
      else amountOut = n.toFixed(2);
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    request.mutate(
      {
        orderId: order.id,
        reasonCode,
        reason: reason.trim(),
        ...(amountOut ? { amount: amountOut } : {}),
        physicalReturnRequired: returnRequired,
      },
      {
        onSuccess: (r) => {
          toast.success(`Refund of ${formatCurrency(r.amount, r.currency)} requested`);
          onClose();
          if (perms.canOpen("/payments/refunds")) router.push(`/payments/refunds/${r.id}`);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "PAYMENTS_AMOUNT_EXCEEDS_CAPTURE") {
            const d = (err.details ?? {}) as { orderAmount?: string; alreadyRefunded?: string };
            setErrors({
              amount:
                d.orderAmount && d.alreadyRefunded
                  ? `Charged ${d.orderAmount}, already refunded ${d.alreadyRefunded} — that's more than is left.`
                  : err.friendly,
            });
            return;
          }
          if (err instanceof ApiError && err.status === 422) setErrors(err.fieldErrors);
          toast.error(err instanceof ApiError ? err.validationSummary ?? err.friendly : "Could not request the refund.");
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
              <Dialog.Title className="text-[14px] font-semibold text-[var(--text-1)]">Refund this order</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                {order.productName}
                {money ? ` · up to ${formatCurrency(money.refundable, currency)} refundable` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="space-y-4 px-4 py-4">
            <Field label="Reason" htmlFor="rf-code" required>
              <select
                id="rf-code"
                value={reasonCode}
                onChange={(e) => pickReason(e.target.value as RefundReasonCode)}
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
              >
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Details" htmlFor="rf-reason" required error={errors.reason} hint="On the record. 1–1000 characters.">
              <Textarea
                id="rf-reason"
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Print peeled after the first wash — photos in the support ticket."
                autoFocus
              />
            </Field>

            <div className="space-y-2">
              <div className="flex gap-1" role="radiogroup" aria-label="Refund amount">
                {[false, true].map((p) => (
                  <button
                    key={String(p)}
                    type="button"
                    role="radio"
                    aria-checked={partial === p}
                    onClick={() => setPartial(p)}
                    className={cn(
                      "pressable h-7 rounded-[6px] px-2.5 text-[12px] transition-colors",
                      partial === p
                        ? "bg-[var(--surface-3)] font-medium text-[var(--text-1)]"
                        : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                    )}
                  >
                    {p ? "Partial amount" : `Full refund${money ? ` · ${formatCurrency(money.refundable, currency)}` : ""}`}
                  </button>
                ))}
              </div>
              {partial ? (
                <Field
                  label={`Amount${currency ? ` (${currency})` : ""}`}
                  htmlFor="rf-amount"
                  error={errors.amount}
                  hint={max !== null ? `Up to ${formatCurrency(String(max), currency)}.` : undefined}
                >
                  <Input
                    id="rf-amount"
                    inputMode="decimal"
                    value={amount}
                    invalid={!!errors.amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="500.00"
                  />
                </Field>
              ) : null}
            </div>

            <label className="flex items-start gap-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
              <input
                type="checkbox"
                checked={returnRequired}
                onChange={(e) => {
                  setReturnRequired(e.target.checked);
                  setTouchedReturn(true);
                }}
                className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-[12.5px] font-medium text-[var(--text-1)]">Item must be returned</span>
                <span className="block text-[11.5px] leading-relaxed text-[var(--text-3)]">
                  {returnRequired
                    ? "Money moves only after the item is back and its tag condition is recorded."
                    : "Nothing to send back — e.g. not delivered or a duplicate charge."}
                </span>
              </span>
            </label>

            {errors.amount && !partial ? <p className="text-[11px] text-[var(--danger)]">{errors.amount}</p> : null}

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" variant="primary" size="sm" loading={request.isPending}>
                Request refund
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
