"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { BadgeCheck, Banknote, TriangleAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useApprovePayout,
  useExecutePayout,
  useFailPayout,
  usePayout,
} from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, formatNumber, humanize, shortId } from "@/lib/format";
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
import type { Payout } from "@/lib/types";

/**
 * One payout batch and the three acts that can move it.
 *
 * Approve, execute and fail are separate calls on the API and separate
 * buttons here, in that order, because they are separate decisions:
 *
 *   approve  — finance signs off on the batch's contents
 *   execute  — the money has actually left, and the provider's reference is
 *              recorded so the two sides can be reconciled
 *   fail     — the transfer bounced; the entries go back to ACCRUED and the
 *              next sweep picks them up
 *
 * The available action is derived from `status`. The API has no
 * `allowedTransitions` on a payout the way a refund does, so the mapping is
 * here — and it is deliberately conservative: SCHEDULED offers approve or
 * fail, APPROVED offers execute or fail, and the two terminal states offer
 * nothing at all.
 */

type PayoutAction = "approve" | "execute" | "fail";

function actionsFor(status: string): PayoutAction[] {
  switch (status) {
    case "SCHEDULED":
      return ["approve", "fail"];
    case "APPROVED":
      return ["execute", "fail"];
    default:
      return [];
  }
}

export function PayoutDrawer({
  payoutId,
  onClose,
}: {
  payoutId: string;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const query = usePayout(payoutId);
  const payout = query.data;

  const approve = useApprovePayout(payoutId);
  const execute = useExecutePayout(payoutId);
  const fail = useFailPayout(payoutId);

  const [pending, setPending] = React.useState<PayoutAction | null>(null);
  const [note, setNote] = React.useState("");
  const [gatewayRef, setGatewayRef] = React.useState("");
  const [failureReason, setFailureReason] = React.useState("");

  const canManage = perms.canManageFinance();
  const busy = approve.isPending || execute.isPending || fail.isPending;

  const reset = () => {
    setPending(null);
    setNote("");
    setGatewayRef("");
    setFailureReason("");
  };

  const onError = (err: unknown) =>
    toast.error(
      err instanceof ApiError ? err.friendly : "Could not update this payout."
    );

  const commit = () => {
    if (pending === "approve") {
      approve.mutate(
        { note: note.trim() || undefined },
        {
          onSuccess: () => {
            toast.success("Batch approved. Execute it once the transfer is sent.");
            reset();
          },
          onError,
        }
      );
    } else if (pending === "execute") {
      if (!gatewayRef.trim()) return;
      execute.mutate(
        { gatewayPayoutRef: gatewayRef.trim() },
        {
          onSuccess: () => {
            toast.success("Payout recorded as paid.");
            reset();
          },
          onError,
        }
      );
    } else if (pending === "fail") {
      if (!failureReason.trim()) return;
      fail.mutate(
        { failureReason: failureReason.trim() },
        {
          onSuccess: () => {
            toast.success("Marked failed. The entries are back in the accrued pool.");
            reset();
          },
          onError,
        }
      );
    }
  };

  const available = payout ? actionsFor(payout.status) : [];

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[560px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {payout ? payout.payee.name ?? humanize(payout.payee.type) : "Payout"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                <Mono className="text-[10px]">{shortId(payoutId, 12)}</Mono>
                {payout ? (
                  <Badge tone={toneForStatus(payout.status)} dot>
                    {humanize(payout.status)}
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
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-[8px]" />
                ))}
              </div>
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            ) : payout ? (
              <>
                <Panel className="px-4 py-3.5">
                  <p className="text-[11px] text-[var(--text-3)]">Batch amount</p>
                  <p className="tnum mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]">
                    {formatCurrency(payout.amount, payout.currency)}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-3)]">
                    {formatNumber(payout.entryCount)} accrued{" "}
                    {payout.entryCount === 1 ? "entry" : "entries"} in {payout.currency}
                  </p>
                </Panel>

                <Facts rows={factsFor(payout)} />

                {payout.failureReason ? (
                  <div className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5">
                    <TriangleAlert
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[var(--text-1)]">
                        This payout failed
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-2)]">
                        {payout.failureReason}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-3)]">
                        Its entries were released back to accrued, so the next sweep
                        will batch them again.
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {payout ? (
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              {!canManage ? (
                <NotPermitted
                  compact
                  what="Running the payout cycle"
                  requires="payment-royalty:manage:global"
                />
              ) : !available.length ? (
                <p className="text-[11px] text-[var(--text-3)]">
                  {payout.status === "PAID"
                    ? "This batch is paid. Corrections go through an adjustment, never an edit."
                    : `No action is available from ${humanize(payout.status).toLowerCase()}.`}
                </p>
              ) : pending === "approve" ? (
                <>
                  <Field label="Note" htmlFor="payout-note" hint="Optional.">
                    <Textarea
                      id="payout-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      placeholder="Checked against the November statement"
                    />
                  </Field>
                  <Actions
                    label="Confirm approval"
                    loading={busy}
                    onCommit={commit}
                    onCancel={reset}
                  />
                </>
              ) : pending === "execute" ? (
                <>
                  <Field
                    label="Provider payout reference"
                    htmlFor="payout-ref"
                    required
                    hint="Required — this is what reconciles the platform's record against the provider's."
                  >
                    <Input
                      id="payout-ref"
                      value={gatewayRef}
                      onChange={(e) => setGatewayRef(e.target.value)}
                      maxLength={200}
                      placeholder="po_1abc…"
                    />
                  </Field>
                  <Actions
                    label="Record as paid"
                    loading={busy}
                    disabled={!gatewayRef.trim()}
                    onCommit={commit}
                    onCancel={reset}
                  />
                </>
              ) : pending === "fail" ? (
                <>
                  <Field
                    label="What went wrong"
                    htmlFor="payout-failure"
                    required
                    hint="Required. The entries return to accrued and the next sweep re-batches them."
                  >
                    <Textarea
                      id="payout-failure"
                      rows={2}
                      value={failureReason}
                      onChange={(e) => setFailureReason(e.target.value)}
                      maxLength={500}
                      placeholder="Bank account rejected the transfer"
                    />
                  </Field>
                  <Actions
                    label="Mark failed"
                    danger
                    loading={busy}
                    disabled={!failureReason.trim()}
                    onCommit={commit}
                    onCancel={reset}
                  />
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {available.includes("approve") ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setPending("approve")}
                    >
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                  ) : null}
                  {available.includes("execute") ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setPending("execute")}
                    >
                      <Banknote className="h-3.5 w-3.5" />
                      Record as paid
                    </Button>
                  ) : null}
                  {available.includes("fail") ? (
                    <Button variant="danger" size="sm" onClick={() => setPending("fail")}>
                      Mark failed
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

function factsFor(payout: Payout): [string, string][] {
  return [
    ["Payee type", humanize(payout.payee.type)],
    [
      "Payee id",
      payout.payee.artistId ?? payout.payee.organizationId ?? "—",
    ],
    ["Threshold applied", payout.thresholdApplied ?? "The payee's own rule"],
    ["Scheduled", formatDateTime(payout.scheduledAt)],
    ["Approved", formatDateTime(payout.approvedAt)],
    ["Paid", formatDateTime(payout.paidAt)],
    ["Provider reference", payout.gatewayPayoutRef ?? "—"],
  ];
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
