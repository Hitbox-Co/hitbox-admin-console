"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Check, Ban, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { usePaymentTransaction, useReviewPayment } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize, shortId } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Mono,
  Panel,
  Skeleton,
  Textarea,
  toneForStatus,
} from "@/components/ui/primitives";
import { ErrorState, NotPermitted } from "@/components/ui/states";

/**
 * One charge, and the review decision if it is parked.
 *
 * `NEEDS_REVIEW` exists so a transaction with something wrong about it stops
 * rather than failing — failing would cancel the order and release the unit,
 * which is the wrong answer when the money may well have arrived. Clearing it
 * is therefore a judgement call, and the API requires a note because a
 * judgement call with no stated reason is not one anybody can audit.
 */
export function TransactionDrawer({
  paymentId,
  onClose,
}: {
  paymentId: string;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const query = usePaymentTransaction(paymentId);
  const review = useReviewPayment(paymentId);
  const payment = query.data;

  const [decision, setDecision] = React.useState<"APPROVE" | "REJECT" | null>(null);
  const [note, setNote] = React.useState("");

  const canManage = perms.canManageFinance();

  const commit = () => {
    if (!decision || !note.trim()) return;
    review.mutate(
      { decision, note: note.trim() },
      {
        onSuccess: () => {
          toast.success(
            decision === "APPROVE"
              ? "Charge approved and cleared for settlement."
              : "Charge rejected."
          );
          setDecision(null);
          setNote("");
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not record the review."
          ),
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[560px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Payment
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                <Mono className="text-[10px]">{shortId(paymentId, 12)}</Mono>
                {payment ? (
                  <Badge tone={toneForStatus(payment.status)} dot>
                    {humanize(payment.status)}
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
            ) : payment ? (
              <>
                <Panel className="px-4 py-3.5">
                  <p className="text-[11px] text-[var(--text-3)]">Charge amount</p>
                  <p className="tnum mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]">
                    {formatCurrency(payment.amount, payment.currency)}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--text-3)]">
                    {payment.gateway} · {payment.currency}
                  </p>
                </Panel>

                {payment.needsReview ? (
                  <div className="rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2.5">
                    <p className="text-[12px] font-medium text-[var(--text-1)]">
                      Parked for review
                    </p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-2)]">
                      Something about this charge did not line up, so it stopped
                      instead of failing. It will not settle until somebody decides.
                    </p>
                  </div>
                ) : null}

                <Panel>
                  <dl className="divide-y divide-[var(--hairline)]">
                    {(
                      [
                        ["Order", payment.orderId],
                        ["Provider reference", payment.gatewayRef ?? "—"],
                        ["Started", formatDateTime(payment.createdAt)],
                        ["Settled", formatDateTime(payment.settledAt)],
                        ["Reviewed", formatDateTime(payment.reviewedAt)],
                        ["Failure reason", payment.failureReason ?? "—"],
                      ] as [string, string][]
                    ).map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-baseline justify-between gap-4 px-3 py-2"
                      >
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

                {payment.reviewNote ? (
                  <Panel className="px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                      Review note
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-2)]">
                      {payment.reviewNote}
                    </p>
                  </Panel>
                ) : null}
              </>
            ) : null}
          </div>

          {payment ? (
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              {!payment.needsReview ? (
                <p className="text-[11px] text-[var(--text-3)]">
                  Nothing to review — this charge is not parked.
                </p>
              ) : !canManage ? (
                <NotPermitted
                  compact
                  what="Reviewing a parked charge"
                  requires="payment-royalty:manage:global"
                />
              ) : decision ? (
                <>
                  <Field
                    label="Note"
                    htmlFor="review-note"
                    required
                    hint="Required. Clearing a parked charge is a decision with a name on it."
                  >
                    <Textarea
                      id="review-note"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      placeholder="Amount matched the provider dashboard; fulfilment confirmed."
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={decision === "APPROVE" ? "primary" : "danger"}
                      size="sm"
                      loading={review.isPending}
                      disabled={!note.trim()}
                      onClick={commit}
                    >
                      Confirm {decision === "APPROVE" ? "approval" : "rejection"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDecision(null)}>
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setDecision("APPROVE")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setDecision("REJECT")}>
                    <Ban className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
