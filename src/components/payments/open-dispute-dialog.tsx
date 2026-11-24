"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Info, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useOpenDispute } from "@/lib/api/hooks";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import {
  FINANCE_CURRENCIES,
  type DisputeReasonCode,
  type FinanceCurrency,
  type OpenDisputeInput,
} from "@/lib/types";

/**
 * Recording a chargeback by hand.
 *
 * The normal path for a dispute is the provider's webhook — `charge.dispute.created`
 * opens the case automatically. This form is for the one that arrived another
 * way: a letter, a phone call, a deployment where the webhook route is not
 * mounted because no signing secret is configured. The notice at the top says
 * so, because an operator recording a case that the webhook is also about to
 * record would end up with two.
 */

const REASON_CODES: DisputeReasonCode[] = [
  "FRAUDULENT",
  "PRODUCT_NOT_RECEIVED",
  "PRODUCT_UNACCEPTABLE",
  "DUPLICATE",
  "SUBSCRIPTION_CANCELED",
  "CREDIT_NOT_PROCESSED",
  "UNRECOGNIZED",
  "OTHER",
];

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export function OpenDisputeDialog({ onClose }: { onClose: () => void }) {
  const open = useOpenDispute();

  const [orderId, setOrderId] = React.useState("");
  const [paymentTransactionId, setPaymentTransactionId] = React.useState("");
  const [gatewayCaseRef, setGatewayCaseRef] = React.useState("");
  const [reasonCode, setReasonCode] = React.useState<DisputeReasonCode>("FRAUDULENT");
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState<FinanceCurrency>("USD");
  const [feeAmount, setFeeAmount] = React.useState("");
  const [evidenceDueBy, setEvidenceDueBy] = React.useState("");

  const amountInvalid = amount.trim() !== "" && !MONEY.test(amount.trim());
  const feeInvalid = feeAmount.trim() !== "" && !MONEY.test(feeAmount.trim());
  const valid = orderId.trim() !== "" && amount.trim() !== "" && !amountInvalid && !feeInvalid;

  const submit = () => {
    if (!valid) return;

    const payload: OpenDisputeInput = {
      orderId: orderId.trim(),
      ...(paymentTransactionId.trim()
        ? { paymentTransactionId: paymentTransactionId.trim() }
        : {}),
      ...(gatewayCaseRef.trim() ? { gatewayCaseRef: gatewayCaseRef.trim() } : {}),
      reasonCode,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      amount: amount.trim(),
      currency,
      ...(feeAmount.trim() ? { feeAmount: feeAmount.trim() } : {}),
      ...(evidenceDueBy
        ? { evidenceDueBy: new Date(`${evidenceDueBy}T23:59:59Z`).toISOString() }
        : {}),
    };

    open.mutate(payload, {
      onSuccess: () => {
        toast.success("Dispute recorded.");
        onClose();
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.friendly : "Could not record the dispute."
        ),
    });
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Record a dispute
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-3)]">
                For a case that did not arrive by webhook.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            <div className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
              <Info
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]"
                aria-hidden
              />
              <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
                Disputes normally open themselves from the provider&apos;s
                <span className="font-mono text-[11px]"> charge.dispute.created </span>
                webhook. Check the case is not already in the queue before recording
                it here.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Order id" htmlFor="dispute-order" required>
                <Input
                  id="dispute-order"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="uuid"
                />
              </Field>
              <Field
                label="Payment id"
                htmlFor="dispute-payment"
                hint="Optional — links the case to the charge it contests."
              >
                <Input
                  id="dispute-payment"
                  value={paymentTransactionId}
                  onChange={(e) => setPaymentTransactionId(e.target.value)}
                  placeholder="uuid"
                />
              </Field>
              <Field
                label="Amount"
                htmlFor="dispute-amount"
                required
                error={amountInvalid ? "Use an amount like 100.00." : undefined}
              >
                <Input
                  id="dispute-amount"
                  value={amount}
                  invalid={amountInvalid}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100.00"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Currency" htmlFor="dispute-currency">
                <select
                  id="dispute-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as FinanceCurrency)}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                >
                  {FINANCE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Network fee"
                htmlFor="dispute-fee"
                error={feeInvalid ? "Use an amount like 15.00." : undefined}
                hint="Optional."
              >
                <Input
                  id="dispute-fee"
                  value={feeAmount}
                  invalid={feeInvalid}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  placeholder="15.00"
                  inputMode="decimal"
                />
              </Field>
              <Field
                label="Evidence due by"
                htmlFor="dispute-due"
                hint="Optional, but it is what orders the queue."
              >
                <Input
                  id="dispute-due"
                  type="date"
                  value={evidenceDueBy}
                  onChange={(e) => setEvidenceDueBy(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Reason code" htmlFor="dispute-reason-code">
              <select
                id="dispute-reason-code"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as DisputeReasonCode)}
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
              >
                {REASON_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Provider case reference"
              htmlFor="dispute-case-ref"
              hint="Optional — the provider's own id for the case."
            >
              <Input
                id="dispute-case-ref"
                value={gatewayCaseRef}
                onChange={(e) => setGatewayCaseRef(e.target.value)}
                placeholder="dp_1abc…"
              />
            </Field>

            <Field label="What the cardholder claims" htmlFor="dispute-reason">
              <Textarea
                id="dispute-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </Field>
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              variant="primary"
              size="sm"
              loading={open.isPending}
              disabled={!valid}
              onClick={submit}
            >
              Record dispute
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
