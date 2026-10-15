"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  Check,
  CircleDashed,
  PackageCheck,
  Send,
  ShieldAlert,
  TriangleAlert,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAdminOrder,
  useApproveRefund,
  useConfirmReturn,
  useProcessRefund,
  useRefund,
  useRejectRefund,
} from "@/lib/api/hooks";
import { formatCurrency, formatDate, formatDateTime, humanize, shortId } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
  PanelHeader,
  Skeleton,
  Textarea,
  toneForStatus,
} from "@/components/ui/primitives";
import { ErrorState, NotPermitted } from "@/components/ui/states";
import { StripeRef } from "@/components/orders/order-money-panel";
import type { NfcTagCondition, Refund, RefundActionCode } from "@/lib/types";

/**
 * One refund, as a page (order-payments-and-refunds-api.md §5, §6).
 *
 *   REQUESTED ─confirm-return─▶ AWAITING_RETURN ─approve─▶ APPROVED ─process─▶ PROCESSED
 *        └──────────────────── reject (any open state) ─────────────▶ REJECTED
 *
 * **One button per `allowedActions` entry**, computed by the server for THIS
 * caller — it knows the return rule ("money never moves before the item is
 * back") and the caller's permission, so nothing here re-derives either.
 * Older backends without `allowedActions` fall back to mapping
 * `allowedTransitions`. Every action answers with the updated refund, which
 * replaces the page state; a 409 means someone else moved it — reload.
 */

const TAG_CONDITIONS: { value: NfcTagCondition; label: string; hint: string }[] = [
  { value: "INTACT", label: "Intact", hint: "The tag works and is undamaged. No resale block." },
  { value: "DAMAGED", label: "Damaged", hint: "The unit is blocked from resale for a period and the tag goes to DISPUTED." },
  { value: "MISSING", label: "Missing", hint: "The unit is blocked from resale for a period and the tag goes to DISPUTED." },
  { value: "TAMPERED", label: "Tampered", hint: "Blocked from resale. A tag that 'stopped responding' may have been cloned." },
];

/** Older payloads carry only allowedTransitions; map them to actions. */
function actionsOf(r: Refund): RefundActionCode[] {
  if (r.allowedActions) return r.allowedActions;
  const out: RefundActionCode[] = [];
  const t = r.allowedTransitions.map(String);
  const returnPending = r.physicalReturnRequired && !r.physicalReturnConfirmedAt;
  if (t.includes("AWAITING_RETURN") && returnPending) out.push("CONFIRM_RETURN");
  if (t.includes("APPROVED")) out.push(returnPending ? "APPROVE_WITH_OVERRIDE" : "APPROVE");
  if (t.includes("PROCESSED")) out.push("PROCESS");
  if (t.includes("REJECTED")) out.push("REJECT");
  return out;
}

export function RefundDetailView({ refundId }: { refundId: string }) {
  const query = useRefund(refundId);
  const refund = query.data;

  usePageChrome({
    title: refund ? `Refund ${formatCurrency(refund.amount, refund.currency)}` : "Refund",
    description: refund ? `${humanize(refund.reasonCode)} · ${humanize(refund.status)}` : undefined,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (query.isError || !refund) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackLink />
      <Header refund={refund} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Panel className="px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">Why</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-1)]">{refund.reason}</p>
          </Panel>
          <Timeline refund={refund} />
          <Facts refund={refund} />
        </div>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <ActionPanel refund={refund} onConflict={() => query.refetch()} />
          <OrderCard orderId={refund.orderId} />
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/payments/refunds"
      className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All refunds
    </Link>
  );
}

function Header({ refund }: { refund: Refund }) {
  return (
    <Panel className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={toneForStatus(refund.status)} dot>
            {humanize(refund.status)}
          </Badge>
          <Badge tone="neutral">{humanize(refund.reasonCode)}</Badge>
          {refund.physicalReturnRequired ? (
            <Badge tone={refund.physicalReturnConfirmedAt ? "positive" : "warning"}>
              {refund.physicalReturnConfirmedAt ? "Item returned" : "Return required"}
            </Badge>
          ) : (
            <Badge tone="neutral" outline>
              No return needed
            </Badge>
          )}
        </div>
        <p className="text-[12px] text-[var(--text-3)]">
          Refund <Mono className="text-[10.5px]">{shortId(refund.id, 12)}</Mono> · requested{" "}
          {formatDateTime(refund.createdAt)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">Amount</p>
        <p className="tnum text-[28px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          {formatCurrency(refund.amount, refund.currency)}
        </p>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

type StepState = "done" | "current" | "todo" | "skipped" | "failed";

function Timeline({ refund: r }: { refund: Refund }) {
  const rejected = r.status === "REJECTED";
  const overridden = r.physicalReturnRequired && !r.physicalReturnConfirmedAt && !!r.approvedAt;

  const steps: { label: string; state: StepState; at?: string | null; detail?: React.ReactNode }[] = [
    { label: "Requested", state: "done", at: r.createdAt },
    {
      label: "Item returned",
      state: !r.physicalReturnRequired
        ? "skipped"
        : r.physicalReturnConfirmedAt
          ? "done"
          : overridden
            ? "skipped"
            : rejected
              ? "todo"
              : "current",
      at: r.physicalReturnConfirmedAt,
      detail: !r.physicalReturnRequired
        ? "Not required for this refund."
        : r.nfcTagCondition
          ? <>Tag condition: <strong>{humanize(String(r.nfcTagCondition))}</strong></>
          : overridden
            ? "Approved without the item back (override recorded)."
            : "Waiting for the item to arrive at the warehouse.",
    },
    {
      label: "Approved",
      state: r.approvedAt ? "done" : rejected ? "todo" : r.physicalReturnConfirmedAt || !r.physicalReturnRequired ? "current" : "todo",
      at: r.approvedAt,
    },
    rejected
      ? { label: "Rejected", state: "failed", detail: r.rejectionReason }
      : {
          label: "Paid back",
          state: r.processedAt ? "done" : r.approvedAt ? "current" : "todo",
          at: r.processedAt,
          detail: r.gatewayRefundId ? <StripeRef value={r.gatewayRefundId} /> : null,
        },
  ];

  const dot: Record<StepState, string> = {
    done: "border-[var(--positive)] bg-[var(--positive)] text-white",
    current: "border-[var(--accent)] bg-[var(--surface-1)] text-[var(--accent-text)]",
    todo: "border-[var(--hairline-strong)] bg-[var(--surface-1)] text-[var(--text-3)]",
    skipped: "border-[var(--warning)] bg-[var(--surface-1)] text-[var(--warning)]",
    failed: "border-[var(--danger)] bg-[var(--danger)] text-white",
  };

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Progress" />
      <ol className="px-4 py-3">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 ? (
              <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%-18px)] w-0.5 bg-[var(--hairline-strong)]" />
            ) : null}
            <span className={cn("relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", dot[s.state])}>
              {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : s.state === "failed" ? <X className="h-3.5 w-3.5" /> : s.state === "skipped" ? <CircleDashed className="h-3 w-3" /> : null}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-[13px]", s.state === "current" ? "font-semibold text-[var(--text-1)]" : s.state === "todo" ? "text-[var(--text-3)]" : "font-medium text-[var(--text-1)]")}>
                {s.label}
                {s.state === "skipped" ? <span className="ml-1.5 text-[11px] font-normal text-[var(--warning)]">skipped</span> : null}
                {s.state === "current" ? <span className="ml-1.5 text-[11px] font-normal text-[var(--accent-text)]">next</span> : null}
              </p>
              {s.at ? <p className="tnum text-[11.5px] text-[var(--text-3)]">{formatDateTime(s.at)}</p> : null}
              {s.detail ? <p className="mt-0.5 text-[12px] text-[var(--text-2)]">{s.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      {r.claimRevokedAt || r.resaleBlockedUntil ? (
        <div className="space-y-1 border-t border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-2.5 text-[12px] text-[var(--text-2)]">
          {r.claimRevokedAt ? (
            <p>Buyer&rsquo;s ownership taken back {formatDateTime(r.claimRevokedAt)} — the claim is stamped revoked, not deleted.</p>
          ) : null}
          {r.resaleBlockedUntil ? (
            <p className="text-[var(--warning)]">Unit blocked from resale until {formatDate(r.resaleBlockedUntil)} (tag not intact).</p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function Facts({ refund: r }: { refund: Refund }) {
  const rows: [string, React.ReactNode][] = [
    ["Reason code", humanize(r.reasonCode)],
    ["Requested by", <Mono key="by" className="text-[10.5px]">{shortId(r.requestedById, 12)}</Mono>],
    ["Physical return", r.physicalReturnRequired ? "Required" : "Not required"],
    ["Item received", formatDateTime(r.physicalReturnConfirmedAt)],
    ["Tag condition", r.nfcTagCondition ? humanize(String(r.nfcTagCondition)) : "—"],
    ["Approved", formatDateTime(r.approvedAt)],
    ["Processed", formatDateTime(r.processedAt)],
    ["Stripe refund", r.gatewayRefundId ? <StripeRef key="g" value={r.gatewayRefundId} /> : "—"],
    ...(r.rejectionReason ? ([["Rejected because", r.rejectionReason]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Details" />
      <dl className="divide-y divide-[var(--hairline)]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2">
            <dt className="shrink-0 text-[12px] text-[var(--text-3)]">{k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-[var(--text-1)]">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** The order behind the refund, when the caller can read orders. */
function OrderCard({ orderId }: { orderId: string }) {
  const perms = usePermissions();
  const canOrders = perms.canOpen("/orders");
  const order = useAdminOrder(canOrders ? orderId : undefined);
  const o = order.data;
  const m = o?.money;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Order"
        action={
          canOrders ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/orders/${orderId}`}>
                Open <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="space-y-1.5 px-4 py-3 text-[12.5px]">
        {o ? (
          <>
            <p className="font-medium text-[var(--text-1)]">{o.productName}</p>
            <p className="flex items-center gap-2 text-[var(--text-3)]">
              <Badge tone={toneForStatus(o.status)} dot>
                {humanize(o.status)}
              </Badge>
              {o.buyerEmail ? <span className="truncate">{o.buyerEmail}</span> : null}
            </p>
            {m ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <dt className="text-[var(--text-3)]">Charged</dt>
                <dd className="tnum text-right">{formatCurrency(m.charged, m.currency)}</dd>
                <dt className="text-[var(--text-3)]">Refunded</dt>
                <dd className="tnum text-right">{formatCurrency(m.refunded, m.currency)}</dd>
                <dt className="text-[var(--text-3)]">Still refundable</dt>
                <dd className="tnum text-right">{formatCurrency(m.refundable, m.currency)}</dd>
              </dl>
            ) : null}
          </>
        ) : (
          <Mono className="text-[10.5px]">{orderId}</Mono>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Actions — one per allowedActions entry                              */
/* ------------------------------------------------------------------ */

function ActionPanel({ refund, onConflict }: { refund: Refund; onConflict: () => void }) {
  const perms = usePermissions();
  const confirmReturn = useConfirmReturn(refund.id);
  const approve = useApproveRefund(refund.id);
  const reject = useRejectRefund(refund.id);
  const process = useProcessRefund(refund.id);
  const busy = confirmReturn.isPending || approve.isPending || reject.isPending || process.isPending;

  const [pending, setPending] = React.useState<RefundActionCode | null>(null);
  const [tagCondition, setTagCondition] = React.useState<NfcTagCondition>("INTACT");
  const [note, setNote] = React.useState("");
  const [overrideReason, setOverrideReason] = React.useState("");
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [needsGatewayId, setNeedsGatewayId] = React.useState(false);
  const [gatewayRefundId, setGatewayRefundId] = React.useState("");

  const actions = actionsOf(refund);
  const amount = formatCurrency(refund.amount, refund.currency);

  const reset = () => {
    setPending(null);
    setNote("");
    setOverrideReason("");
    setRejectionReason("");
    setNeedsGatewayId(false);
    setGatewayRefundId("");
  };

  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.code === "PAYMENTS_GATEWAY_UNAVAILABLE") {
      // No provider wired: refund in the Stripe dashboard, then record its id.
      setNeedsGatewayId(true);
      return;
    }
    if (err instanceof ApiError && err.status === 409) {
      toast.error("Someone else changed this refund. Reloaded with the latest.");
      onConflict();
      reset();
      return;
    }
    toast.error(err instanceof ApiError ? err.validationSummary ?? err.friendly : "Could not update the refund.");
  };

  const commit = () => {
    switch (pending) {
      case "CONFIRM_RETURN":
        confirmReturn.mutate(
          { nfcTagCondition: tagCondition, note: note.trim() || undefined },
          {
            onSuccess: (r) => {
              toast.success(
                r.resaleBlockedUntil
                  ? `Return confirmed. Unit blocked from resale until ${formatDate(r.resaleBlockedUntil)}.`
                  : "Return confirmed — it can be approved now."
              );
              reset();
            },
            onError,
          }
        );
        break;
      case "APPROVE":
        approve.mutate(
          { note: note.trim() || undefined },
          { onSuccess: () => (toast.success("Approved — ready to pay back."), reset()), onError }
        );
        break;
      case "APPROVE_WITH_OVERRIDE":
        if (!overrideReason.trim()) return;
        approve.mutate(
          { overridePhysicalReturn: true, overrideReason: overrideReason.trim(), note: note.trim() || undefined },
          { onSuccess: () => (toast.success("Approved without the return — override recorded."), reset()), onError }
        );
        break;
      case "REJECT":
        if (!rejectionReason.trim()) return;
        reject.mutate(
          { rejectionReason: rejectionReason.trim() },
          { onSuccess: () => (toast.success("Refund rejected."), reset()), onError }
        );
        break;
      case "PROCESS":
        if (needsGatewayId && !gatewayRefundId.trim()) return;
        process.mutate(needsGatewayId ? { gatewayRefundId: gatewayRefundId.trim() } : {}, {
          onSuccess: (r) => {
            toast.success(
              r.claimRevokedAt
                ? `${amount} paid back. Ownership taken back and the royalty reversed.`
                : `${amount} paid back. The order is now refunded.`
            );
            reset();
          },
          onError,
        });
        break;
    }
  };

  const header = <PanelHeader title="Next step" />;

  if (!actions.length) {
    const lacksPermission = !perms.hasAction("order", "refund", "global");
    return (
      <Panel className="overflow-hidden">
        {header}
        <div className="px-4 py-3">
          {refund.status === "PROCESSED" ? (
            <p className="text-[12.5px] text-[var(--text-2)]">Done — the money is back with the buyer.</p>
          ) : refund.status === "REJECTED" ? (
            <p className="text-[12.5px] text-[var(--text-2)]">Rejected. Nothing further happens to this refund.</p>
          ) : lacksPermission ? (
            <NotPermitted compact what="Working refunds" requires="order:refund:global" />
          ) : (
            <p className="text-[12.5px] text-[var(--text-3)]">No action is available to you right now.</p>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      {header}
      <div className="space-y-3 px-4 py-3">
        {pending === null ? (
          <div className="space-y-2">
            {actions.includes("CONFIRM_RETURN") ? (
              <ActionButton icon={PackageCheck} primary title="Item received" help="It's back at the warehouse — record the tag's condition." onClick={() => setPending("CONFIRM_RETURN")} />
            ) : null}
            {actions.includes("APPROVE") ? (
              <ActionButton icon={Check} primary title="Approve" help="Nothing outstanding — approve the refund." onClick={() => setPending("APPROVE")} />
            ) : null}
            {actions.includes("PROCESS") ? (
              <ActionButton icon={Send} primary title={`Pay back ${amount}`} help="Moves the money and closes the order as refunded." onClick={() => setPending("PROCESS")} />
            ) : null}
            {actions.includes("APPROVE_WITH_OVERRIDE") ? (
              <ActionButton icon={TriangleAlert} title="Approve without the item" help="Override the return — needs a written reason." onClick={() => setPending("APPROVE_WITH_OVERRIDE")} />
            ) : null}
            {actions.includes("REJECT") ? (
              <Button variant="ghost" size="sm" className="text-[var(--danger)]" onClick={() => setPending("REJECT")}>
                <Ban className="h-3.5 w-3.5" />
                Reject refund
              </Button>
            ) : null}
          </div>
        ) : pending === "CONFIRM_RETURN" ? (
          <>
            <Field label="NFC tag condition" required hint={TAG_CONDITIONS.find((c) => c.value === tagCondition)?.hint}>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="NFC tag condition">
                {TAG_CONDITIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={tagCondition === c.value}
                    onClick={() => setTagCondition(c.value)}
                    className={cn(
                      "pressable h-8 rounded-[6px] border text-[12.5px] transition-colors",
                      tagCondition === c.value
                        ? c.value === "INTACT"
                          ? "border-[var(--positive)] bg-[var(--positive-dim)] font-medium text-[var(--text-1)]"
                          : "border-[var(--warning)] bg-[var(--warning-dim)] font-medium text-[var(--text-1)]"
                        : "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--text-2)]"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Note" htmlFor="rd-note" hint="Optional.">
              <Textarea id="rd-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Box dented, item fine." />
            </Field>
            <Confirm label="Confirm item received" busy={busy} onCommit={commit} onCancel={reset} />
          </>
        ) : pending === "APPROVE" ? (
          <>
            <Field label="Note" htmlFor="rd-note" hint="Optional.">
              <Textarea id="rd-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Damage confirmed from photos." autoFocus />
            </Field>
            <Confirm label={`Approve ${amount}`} busy={busy} onCommit={commit} onCancel={reset} />
          </>
        ) : pending === "APPROVE_WITH_OVERRIDE" ? (
          <>
            <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.3)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-1)]">
              <ShieldAlert className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--danger)]" aria-hidden />
              The item has <strong>not</strong> been returned yet. Money normally never moves before it&rsquo;s back
              — this override is recorded with your reason.
            </p>
            <Field label="Override reason" htmlFor="rd-override" required>
              <Textarea id="rd-override" rows={2} maxLength={500} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Courier confirmed the parcel was lost in transit." autoFocus />
            </Field>
            <Confirm label="Approve without return" danger busy={busy} disabled={!overrideReason.trim()} onCommit={commit} onCancel={reset} />
          </>
        ) : pending === "REJECT" ? (
          <>
            <Field label="Rejection reason" htmlFor="rd-reject" required hint="On the record, and the buyer-facing explanation.">
              <Textarea id="rd-reject" rows={3} maxLength={1000} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Returned item doesn't match the order (different serial)." autoFocus />
            </Field>
            <Confirm label="Reject refund" danger busy={busy} disabled={!rejectionReason.trim()} onCommit={commit} onCancel={reset} />
          </>
        ) : pending === "PROCESS" ? (
          <>
            <p className="text-[13px] text-[var(--text-1)]">
              Pay back <strong>{amount}</strong> to the buyer?
            </p>
            <ul className="space-y-0.5 rounded-[8px] bg-[var(--surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-2)]">
              <li>· The refund is issued at Stripe and the order becomes Refunded</li>
              <li>· The buyer&rsquo;s ownership is taken back if they claimed the item</li>
              <li>· A tag that came back damaged blocks resale for a period</li>
              <li>· The artist&rsquo;s royalty for this sale is reversed</li>
            </ul>
            {needsGatewayId ? (
              <Field
                label="Stripe refund id"
                htmlFor="rd-gateway"
                required
                hint="No payment provider is wired on this server. Issue the refund in the Stripe dashboard first, then paste its id here."
              >
                <Input id="rd-gateway" value={gatewayRefundId} onChange={(e) => setGatewayRefundId(e.target.value.trim())} placeholder="re_3Q…" autoFocus />
              </Field>
            ) : null}
            <Confirm
              label={needsGatewayId ? "Record refund" : `Pay back ${amount}`}
              busy={busy}
              disabled={needsGatewayId && !gatewayRefundId}
              onCommit={commit}
              onCancel={reset}
            />
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function ActionButton({
  icon: Icon,
  title,
  help,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  help: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "pressable flex w-full items-start gap-3 rounded-[8px] border px-3 py-2.5 text-left transition-colors",
        primary
          ? "border-[var(--accent)] bg-[var(--accent-dim)]"
          : "border-[var(--hairline)] bg-[var(--surface-2)] hover:border-[var(--hairline-strong)]"
      )}
    >
      <Icon className="mt-[1px] h-4 w-4 shrink-0 text-[var(--text-2)]" />
      <span>
        <span className="block text-[13px] font-medium text-[var(--text-1)]">{title}</span>
        <span className="block text-[11.5px] text-[var(--text-3)]">{help}</span>
      </span>
    </button>
  );
}

function Confirm({
  label,
  busy,
  disabled,
  danger,
  onCommit,
  onCancel,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  danger?: boolean;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant={danger ? "danger" : "primary"} size="sm" loading={busy} disabled={disabled} onClick={onCommit}>
        {label}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Back
      </Button>
    </div>
  );
}
