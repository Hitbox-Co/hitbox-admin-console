"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Ban, Check, PackageCheck, ShieldAlert, Send, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useApproveRefund,
  useConfirmReturn,
  useProcessRefund,
  useRefund,
  useRejectRefund,
} from "@/lib/api/hooks";
import { formatCurrency, formatDate, formatDateTime, humanize, shortId } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
  Skeleton,
  Textarea,
  toneForStatus,
} from "@/components/ui/primitives";
import { ErrorState, NotPermitted } from "@/components/ui/states";
import { RefundCapabilityNotice } from "@/components/finance/scope-notice";
import type { NfcTagCondition, Refund } from "@/lib/types";

/**
 * The refund workflow — D4-35, in order.
 *
 *   1. requested          (by the buyer, or by support on their behalf)
 *   2. confirm-return     the item is physically back, and the tag's condition
 *   3. approve / reject   an operator decides
 *   4–6. process          ownership revoked, tag quarantined, money sent, the
 *                         artist's royalty reversed
 *
 * **The buttons come from `allowedTransitions`, which the server computes.**
 * Hardcoding the state machine here would mean discovering its rules by
 * getting a 400, and would drift the moment the graph changes. The mapping
 * below turns a target STATUS into the ACTION that reaches it, which is the
 * only translation this component does.
 *
 * The rule the whole screen is built around: money does not move before the
 * item is back. AWAITING_RETURN is not a status that can be skipped by
 * pressing approve — approving without the item requires an explicit override
 * and a written reason, so a lost shipment or a goodwill refund is visible as
 * the decision it was rather than indistinguishable from a normal approval.
 */

type RefundAction = "confirm-return" | "approve" | "reject" | "process";

/**
 * Which action reaches a given target status.
 *
 * `allowedTransitions` names STATUSES (the server's own
 * `REFUND_TRANSITIONS` map), and the four routes are named after ACTS. They
 * line up one-to-one except that PROCESSED is reached by `process`, which is
 * three steps in one call.
 */
const ACTION_FOR_STATUS: Record<string, RefundAction> = {
  AWAITING_RETURN: "confirm-return",
  APPROVED: "approve",
  REJECTED: "reject",
  PROCESSED: "process",
};

const TAG_CONDITIONS: { value: NfcTagCondition; label: string; hint: string }[] = [
  {
    value: "INTACT",
    label: "Intact",
    hint: "The item is genuinely fine. No resale block — holding it off sale would cost a unit for nothing.",
  },
  {
    value: "DAMAGED",
    label: "Damaged",
    hint: "Quarantined against resale for 90 days.",
  },
  {
    value: "MISSING",
    label: "Missing",
    hint: "Quarantined against resale for 90 days.",
  },
  {
    value: "TAMPERED",
    label: "Tampered",
    hint: "Quarantined against resale for 90 days. A tag that 'stopped responding' may equally have been cloned.",
  },
];

export function RefundDrawer({
  refundId,
  onClose,
}: {
  refundId: string;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const query = useRefund(refundId);
  const refund = query.data;

  const confirmReturn = useConfirmReturn(refundId);
  const approve = useApproveRefund(refundId);
  const reject = useRejectRefund(refundId);
  const process = useProcessRefund(refundId);

  const [pending, setPending] = React.useState<RefundAction | null>(null);
  const [tagCondition, setTagCondition] = React.useState<NfcTagCondition>("INTACT");
  const [note, setNote] = React.useState("");
  const [override, setOverride] = React.useState(false);
  const [overrideReason, setOverrideReason] = React.useState("");
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [gatewayRefundId, setGatewayRefundId] = React.useState("");

  const canWork = perms.canWorkRefunds();
  const busy =
    confirmReturn.isPending || approve.isPending || reject.isPending || process.isPending;

  const reset = () => {
    setPending(null);
    setNote("");
    setOverride(false);
    setOverrideReason("");
    setRejectionReason("");
    setGatewayRefundId("");
  };

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.friendly : "Could not update the refund.");

  const commit = () => {
    if (pending === "confirm-return") {
      confirmReturn.mutate(
        { nfcTagCondition: tagCondition, note: note.trim() || undefined },
        {
          onSuccess: (r) => {
            toast.success(
              r.resaleBlockedUntil
                ? `Return confirmed. The unit is blocked from resale until ${formatDate(r.resaleBlockedUntil)}.`
                : "Return confirmed."
            );
            reset();
          },
          onError,
        }
      );
    } else if (pending === "approve") {
      if (override && !overrideReason.trim()) return;
      approve.mutate(
        {
          note: note.trim() || undefined,
          overridePhysicalReturn: override,
          overrideReason: override ? overrideReason.trim() : undefined,
        },
        {
          onSuccess: () => {
            toast.success("Refund approved. Process it once the money is sent.");
            reset();
          },
          onError,
        }
      );
    } else if (pending === "reject") {
      if (!rejectionReason.trim()) return;
      reject.mutate(
        { rejectionReason: rejectionReason.trim() },
        {
          onSuccess: () => {
            toast.success("Refund rejected.");
            reset();
          },
          onError,
        }
      );
    } else if (pending === "process") {
      process.mutate(
        { gatewayRefundId: gatewayRefundId.trim() || undefined },
        {
          onSuccess: (r) => {
            toast.success(
              r.claimRevokedAt
                ? "Refund processed. Ownership revoked and the royalty reversed."
                : "Refund processed."
            );
            reset();
          },
          onError,
        }
      );
    }
  };

  /** Server-computed statuses, mapped to the acts that reach them. */
  const available = React.useMemo(() => {
    if (!refund) return [] as RefundAction[];
    return refund.allowedTransitions
      .map((s) => ACTION_FOR_STATUS[String(s)])
      .filter((a): a is RefundAction => a !== undefined);
  }, [refund]);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[600px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Refund request
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                <Mono className="text-[10px]">{shortId(refundId, 12)}</Mono>
                {refund ? (
                  <Badge tone={toneForStatus(refund.status)} dot>
                    {humanize(refund.status)}
                  </Badge>
                ) : null}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {query.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-[8px]" />
                ))}
              </div>
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            ) : refund ? (
              <>
                <Panel className="px-4 py-3.5">
                  <p className="text-[11px] text-[var(--text-3)]">Refund amount</p>
                  <p className="tnum mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]">
                    {formatCurrency(refund.amount, refund.currency)}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-3)]">
                    {humanize(refund.reasonCode)}
                  </p>
                </Panel>

                <Panel className="px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                    What the requester said
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-2)]">
                    {refund.reason}
                  </p>
                </Panel>

                <Progress refund={refund} />

                <Facts
                  rows={[
                    ["Order", refund.orderId],
                    ["Requested by", refund.requestedById],
                    ["Requested", formatDateTime(refund.createdAt)],
                    [
                      "Physical return",
                      refund.physicalReturnRequired ? "Required" : "Not required",
                    ],
                    [
                      "Item received",
                      formatDateTime(refund.physicalReturnConfirmedAt),
                    ],
                    [
                      "Tag condition",
                      refund.nfcTagCondition
                        ? humanize(String(refund.nfcTagCondition))
                        : "—",
                    ],
                    ["Approved", formatDateTime(refund.approvedAt)],
                    ["Processed", formatDateTime(refund.processedAt)],
                    ["Provider refund id", refund.gatewayRefundId ?? "—"],
                    ["Ownership revoked", formatDateTime(refund.claimRevokedAt)],
                    [
                      "Resale blocked until",
                      refund.resaleBlockedUntil
                        ? formatDate(refund.resaleBlockedUntil)
                        : "Not blocked",
                    ],
                    ...(refund.rejectionReason
                      ? ([["Rejected because", refund.rejectionReason]] as [
                          string,
                          string,
                        ][])
                      : []),
                  ]}
                />
              </>
            ) : null}
          </div>

          {refund ? (
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              <RefundCapabilityNotice />

              {!canWork ? (
                perms.hasAction("order", "refund", "global") ? null : (
                  <NotPermitted
                    compact
                    what="The refund workflow"
                    requires="order:refund:global"
                  />
                )
              ) : !available.length ? (
                <p className="text-[11px] text-[var(--text-3)]">
                  {refund.status === "PROCESSED"
                    ? "Processed. The money is out, the claim is revoked and the royalty is reversed — corrections go through an adjustment."
                    : `Nothing further happens to a ${humanize(refund.status).toLowerCase()} request.`}
                </p>
              ) : pending === "confirm-return" ? (
                <>
                  <Field
                    label="Condition of the NFC tag"
                    htmlFor="refund-tag"
                    hint={TAG_CONDITIONS.find((c) => c.value === tagCondition)?.hint}
                  >
                    <select
                      id="refund-tag"
                      value={tagCondition}
                      onChange={(e) =>
                        setTagCondition(e.target.value as NfcTagCondition)
                      }
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                    >
                      {TAG_CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Note" htmlFor="refund-return-note" hint="Optional.">
                    <Textarea
                      id="refund-return-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={1000}
                      placeholder="Chip does not respond; packaging intact."
                    />
                  </Field>
                  <Actions
                    label="Confirm the item is back"
                    loading={busy}
                    onCommit={commit}
                    onCancel={reset}
                  />
                </>
              ) : pending === "approve" ? (
                <>
                  <Field label="Note" htmlFor="refund-approve-note" hint="Optional.">
                    <Textarea
                      id="refund-approve-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={1000}
                      placeholder="Tag confirmed dead on arrival."
                    />
                  </Field>

                  {refund.physicalReturnRequired && !refund.physicalReturnConfirmedAt ? (
                    <div className="space-y-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={override}
                          onChange={(e) => setOverride(e.target.checked)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--danger)]"
                        />
                        <span className="text-[12px] leading-relaxed text-[var(--text-1)]">
                          Approve without the item back
                          <span className="mt-0.5 block text-[11px] text-[var(--text-2)]">
                            The item has not been confirmed received. Money does not
                            normally move first — a lost shipment or a goodwill
                            refund is a real decision, and this records it as one.
                          </span>
                        </span>
                      </label>

                      {override ? (
                        <Field label="Why" htmlFor="refund-override" required>
                          <Textarea
                            id="refund-override"
                            rows={2}
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            maxLength={500}
                            placeholder="Carrier confirmed the parcel was lost in transit."
                          />
                        </Field>
                      ) : null}
                    </div>
                  ) : null}

                  <Actions
                    label="Approve refund"
                    loading={busy}
                    disabled={override && !overrideReason.trim()}
                    onCommit={commit}
                    onCancel={reset}
                  />
                </>
              ) : pending === "reject" ? (
                <>
                  <Field
                    label="Why this is being refused"
                    htmlFor="refund-reject"
                    required
                    hint="Required, and the buyer-facing explanation."
                  >
                    <Textarea
                      id="refund-reject"
                      rows={2}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      maxLength={1000}
                      placeholder="Item was returned with a different serial number."
                    />
                  </Field>
                  <Actions
                    label="Reject refund"
                    danger
                    loading={busy}
                    disabled={!rejectionReason.trim()}
                    onCommit={commit}
                    onCancel={reset}
                  />
                </>
              ) : pending === "process" ? (
                <>
                  <div className="rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-1)]">
                      <ShieldAlert className="h-3.5 w-3.5 text-[var(--warning)]" aria-hidden />
                      This does four things at once
                    </p>
                    <ul className="mt-1.5 space-y-0.5 text-[12px] leading-relaxed text-[var(--text-2)]">
                      <li>· Revokes the buyer&apos;s ownership of the unit</li>
                      <li>· Quarantines the tag if it came back anything but intact</li>
                      <li>· Sends the money back through the gateway</li>
                      <li>· Reverses the artist&apos;s royalty on this order</li>
                    </ul>
                  </div>
                  <Field
                    label="Provider refund id"
                    htmlFor="refund-gateway-id"
                    hint="Required on a deployment with no gateway adapter wired — the API answers PAYMENTS_GATEWAY_UNAVAILABLE without it. Leave empty if an adapter will fill it in."
                  >
                    <Input
                      id="refund-gateway-id"
                      value={gatewayRefundId}
                      onChange={(e) => setGatewayRefundId(e.target.value)}
                      maxLength={200}
                      placeholder="re_1abc…"
                    />
                  </Field>
                  <Actions
                    label="Process refund"
                    loading={busy}
                    onCommit={commit}
                    onCancel={reset}
                  />
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {available.includes("confirm-return") ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPending("confirm-return")}
                    >
                      <PackageCheck className="h-3.5 w-3.5" />
                      Item received
                    </Button>
                  ) : null}
                  {available.includes("approve") ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setPending("approve")}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                  ) : null}
                  {available.includes("process") ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setPending("process")}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Process
                    </Button>
                  ) : null}
                  {available.includes("reject") ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setPending("reject")}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Where this request has got to, as a row of steps.
 *
 * Derived from the timestamps the API fills in rather than from `status`
 * alone, so a request approved with the physical-return requirement
 * overridden shows the return step as skipped rather than complete — which is
 * the whole reason that override is recorded separately.
 */
function Progress({ refund }: { refund: Refund }) {
  const steps: { label: string; state: "done" | "skipped" | "current" | "todo" }[] = [
    { label: "Requested", state: "done" },
    {
      label: "Item back",
      state: !refund.physicalReturnRequired
        ? "skipped"
        : refund.physicalReturnConfirmedAt
          ? "done"
          : refund.approvedAt
            ? "skipped"
            : "current",
    },
    {
      label: refund.status === "REJECTED" ? "Rejected" : "Approved",
      state:
        refund.status === "REJECTED"
          ? "done"
          : refund.approvedAt
            ? "done"
            : refund.physicalReturnConfirmedAt || !refund.physicalReturnRequired
              ? "current"
              : "todo",
    },
    {
      label: "Processed",
      state: refund.processedAt ? "done" : refund.approvedAt ? "current" : "todo",
    },
  ];

  const tone = {
    done: "bg-[var(--positive-dim)] text-[var(--positive)]",
    skipped: "bg-[var(--warning-dim)] text-[var(--warning)]",
    current: "bg-[var(--accent-dim)] text-[var(--accent-text)]",
    todo: "bg-[var(--surface-2)] text-[var(--text-3)]",
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s) => (
        <span
          key={s.label}
          className={`rounded-[6px] px-2 py-1 text-[11px] font-medium ${tone[s.state]}`}
        >
          {s.label}
          {s.state === "skipped" ? " · skipped" : ""}
        </span>
      ))}
    </div>
  );
}

function Actions({
  label,
  loading,
  disabled,
  danger,
  onCommit,
  onCancel,
}: {
  label: string;
  loading: boolean;
  disabled?: boolean;
  danger?: boolean;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant={danger ? "danger" : "primary"}
        size="sm"
        loading={loading}
        disabled={disabled}
        onClick={onCommit}
      >
        {label}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Back
      </Button>
    </div>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <Panel>
      <dl className="divide-y divide-[var(--hairline)]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="shrink-0 text-[12px] text-[var(--text-3)]">{k}</dt>
            <dd
              className="min-w-0 truncate text-right text-[12.5px] text-[var(--text-1)]"
              title={v}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
