"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCreateAdjustment } from "@/lib/api/hooks";
import { humanize } from "@/lib/format";
import {
  Button,
  Field,
  Input,
  Segmented,
  Textarea,
} from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import {
  FINANCE_CURRENCIES,
  type AdjustmentInput,
  type AdjustmentReasonCode,
  type AdjustmentTargetType,
  type FinanceCurrency,
} from "@/lib/types";

/**
 * Posting a correction.
 *
 * The signed amount is the whole subtlety of this endpoint: "-11.25" reverses
 * and "5.00" posts a make-good, and a UI that let an operator type "11.25"
 * meaning "take 11.25 away" would be posting the opposite of what they
 * intended into an immutable ledger. So the direction is a segmented control
 * — an explicit choice with two words on it — and the magnitude is unsigned.
 * The preview line underneath shows the exact signed string that will be sent.
 */

const TARGET_TYPES: { value: AdjustmentTargetType; label: string }[] = [
  { value: "ROYALTY_LEDGER_ENTRY", label: "Royalty entry" },
  { value: "FINANCE_LEDGER_ENTRY", label: "Ledger line" },
  { value: "ORDER", label: "Order" },
  { value: "PAYMENT_TRANSACTION", label: "Payment" },
  { value: "ROYALTY_PAYOUT", label: "Payout" },
];

const REASON_CODES: { value: AdjustmentReasonCode; label: string; hint: string }[] = [
  {
    value: "CALCULATION_ERROR",
    label: "Calculation error",
    hint: "The arithmetic was wrong — a double-counted cost, a stale price.",
  },
  {
    value: "RULE_CORRECTION",
    label: "Rule correction",
    hint: "The wrong rule was applied, or its terms were entered incorrectly.",
  },
  {
    value: "REFUND_REVERSAL",
    label: "Refund reversal",
    hint: "Booked automatically when a refund processes. Use only to fix one that did not.",
  },
  {
    value: "DISPUTE_LOSS",
    label: "Dispute loss",
    hint: "Booked automatically on a lost chargeback. Use only to fix one that did not.",
  },
  {
    value: "CHARGEBACK_FEE",
    label: "Chargeback fee",
    hint: "The fee the network kept, posted separately from the disputed amount.",
  },
  {
    value: "GOODWILL",
    label: "Goodwill",
    hint: "A deliberate make-good. Positive, and worth saying why in full.",
  },
  {
    value: "MANUAL_CORRECTION",
    label: "Manual correction",
    hint: "Anything else. The written reason carries the explanation.",
  },
];

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export function AdjustmentDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateAdjustment();

  const [targetType, setTargetType] =
    React.useState<AdjustmentTargetType>("ROYALTY_LEDGER_ENTRY");
  const [targetId, setTargetId] = React.useState("");
  const [orderId, setOrderId] = React.useState("");
  const [direction, setDirection] = React.useState<"reverse" | "credit">("reverse");
  const [magnitude, setMagnitude] = React.useState("");
  const [currency, setCurrency] = React.useState<FinanceCurrency>("USD");
  const [reasonCode, setReasonCode] =
    React.useState<AdjustmentReasonCode>("CALCULATION_ERROR");
  const [reason, setReason] = React.useState("");

  const amountInvalid = magnitude.trim() !== "" && !MONEY.test(magnitude.trim());
  const signed =
    magnitude.trim() && !amountInvalid
      ? `${direction === "reverse" ? "-" : ""}${magnitude.trim()}`
      : null;

  const valid = !!signed && targetId.trim() !== "" && reason.trim() !== "";

  const submit = () => {
    if (!valid || !signed) return;

    const payload: AdjustmentInput = {
      targetType,
      targetId: targetId.trim(),
      ...(orderId.trim() ? { orderId: orderId.trim() } : {}),
      amountAdjustment: signed,
      currency,
      reasonCode,
      reason: reason.trim(),
    };

    create.mutate(payload, {
      onSuccess: () => {
        toast.success("Adjustment posted beside the record it corrects.");
        onClose();
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.friendly : "Could not post the adjustment."
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
                Post an adjustment
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-3)]">
                This writes a correction beside the record. It does not change the
                record, and it cannot be undone — only corrected again.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            <Field label="What it corrects" htmlFor="adj-target-type">
              <select
                id="adj-target-type"
                value={targetType}
                onChange={(e) =>
                  setTargetType(e.target.value as AdjustmentTargetType)
                }
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={`${humanize(targetType)} id`} htmlFor="adj-target-id" required>
                <Input
                  id="adj-target-id"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder="uuid"
                />
              </Field>
              <Field
                label="Order id"
                htmlFor="adj-order-id"
                hint="Optional — links the correction to the order it belongs to."
              >
                <Input
                  id="adj-order-id"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="uuid"
                />
              </Field>
            </div>

            <div className="space-y-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-3">
              <Field label="Direction">
                <Segmented
                  value={direction}
                  onChange={setDirection}
                  size="sm"
                  options={[
                    { value: "reverse" as const, label: "Take away" },
                    { value: "credit" as const, label: "Add back" },
                  ]}
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Amount"
                  htmlFor="adj-amount"
                  required
                  error={amountInvalid ? "Use an amount like 11.25." : undefined}
                  hint="Unsigned — the direction above decides the sign."
                >
                  <Input
                    id="adj-amount"
                    value={magnitude}
                    invalid={amountInvalid}
                    onChange={(e) => setMagnitude(e.target.value)}
                    placeholder="11.25"
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Currency" htmlFor="adj-currency">
                  <select
                    id="adj-currency"
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
              </div>

              <p className="flex items-baseline justify-between gap-3 border-t border-[var(--hairline)] pt-2.5 text-[11px] text-[var(--text-3)]">
                <span>Will be posted as</span>
                {signed ? (
                  <Amount
                    signed
                    amount={signed}
                    currency={currency}
                    className="text-[12.5px] font-medium"
                  />
                ) : (
                  <span className="text-[var(--text-3)]">—</span>
                )}
              </p>
            </div>

            <Field
              label="Reason code"
              htmlFor="adj-reason-code"
              hint={REASON_CODES.find((c) => c.value === reasonCode)?.hint}
            >
              <select
                id="adj-reason-code"
                value={reasonCode}
                onChange={(e) =>
                  setReasonCode(e.target.value as AdjustmentReasonCode)
                }
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
              >
                {REASON_CODES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Reason"
              htmlFor="adj-reason"
              required
              hint="Permanent, and the only explanation anyone gets later."
            >
              <Textarea
                id="adj-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="COGS was recorded twice on this order"
              />
            </Field>
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              variant="primary"
              size="sm"
              loading={create.isPending}
              disabled={!valid}
              onClick={submit}
            >
              Post adjustment
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
