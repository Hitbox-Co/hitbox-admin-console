"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Undo2, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useReverseRoyaltyEntry, useRoyaltyEntry } from "@/lib/api/hooks";
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
import { Amount } from "@/components/ui/money";
import { ErrorState, NotPermitted } from "@/components/ui/states";
import type { ReversalReasonCode, RoyaltyEntryDetail } from "@/lib/types";

/**
 * One royalty entry, the arithmetic behind it, and every correction posted
 * against it.
 *
 * The calculation block is the point of this drawer. An artist cannot always
 * see the RULE that priced them — rule listing filters by organization, so a
 * rule scoped to an artist alone is invisible to them — but `basis`,
 * `percentage`, `grossRevenue`, `costOfGoods` and `netProfit` are carried on
 * the entry row itself. This screen is therefore the authoritative answer to
 * "why is this number what it is", for every persona.
 */

const REASON_CODES: { value: ReversalReasonCode; label: string; hint: string }[] = [
  {
    value: "CALCULATION_ERROR",
    label: "Calculation error",
    hint: "The arithmetic was wrong — a double-counted cost, a stale price.",
  },
  {
    value: "RULE_CORRECTION",
    label: "Rule correction",
    hint: "The wrong rule priced this, or its terms were entered incorrectly.",
  },
  {
    value: "REFUND_REVERSAL",
    label: "Refund reversal",
    hint: "Normally automatic when a refund processes. Use only to fix one that did not.",
  },
  {
    value: "DISPUTE_LOSS",
    label: "Dispute loss",
    hint: "Normally automatic on a lost chargeback. Use only to fix one that did not.",
  },
  {
    value: "MANUAL_CORRECTION",
    label: "Manual correction",
    hint: "Anything else. The written reason carries the explanation.",
  },
];

export function RoyaltyEntryDrawer({
  entryId,
  onClose,
}: {
  entryId: string;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const query = useRoyaltyEntry(entryId);
  const reverse = useReverseRoyaltyEntry(entryId);
  const entry = query.data;

  const [reversing, setReversing] = React.useState(false);
  const [reasonCode, setReasonCode] =
    React.useState<ReversalReasonCode>("CALCULATION_ERROR");
  const [reason, setReason] = React.useState("");

  /**
   * The route takes `payment-royalty:manage:global`; the controller then
   * requires `payment-royalty:override:global` ON TOP. `manage` does not
   * imply `override` in `buildFinanceAccess` — cancelling an accrual the
   * calculation says is owed is a different power from running the
   * calculation — so this asks for the exact grant.
   */
  const canReverse = perms.canOverrideRoyalties();
  const alreadyReversed = entry?.status === "REVERSED";

  const commit = () => {
    if (!reason.trim()) return;
    reverse.mutate(
      { reasonCode, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success("Entry reversed. The correction is posted beside it.");
          setReversing(false);
          setReason("");
        },
        onError: (err) => {
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not reverse this entry."
          );
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[620px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {entry ? entry.payee.name ?? humanize(entry.payee.type) : "Royalty entry"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                <Mono className="text-[10px]">{shortId(entryId, 12)}</Mono>
                {entry ? (
                  <Badge tone={toneForStatus(entry.status)} dot>
                    {humanize(entry.status)}
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
            ) : entry ? (
              <>
                <AmountHeader entry={entry} />
                <CalculationPanel entry={entry} />

                <Facts
                  rows={[
                    ["Order", entry.orderId],
                    ["Rule", entry.ruleId],
                    ["Unit", entry.skuId ?? "—"],
                    ["Claim", entry.claimId ?? "—"],
                    ["Entry type", humanize(entry.entryType)],
                    ...(entry.adjustsEntryId
                      ? ([["Adjusts entry", entry.adjustsEntryId]] as [string, string][])
                      : []),
                    ["Payout batch", entry.payoutId ?? "Not batched"],
                    ["Accrued", formatDateTime(entry.accruedAt)],
                    ["Paid", formatDateTime(entry.paidAt)],
                  ]}
                />

                <Adjustments entry={entry} />
              </>
            ) : null}
          </div>

          {entry ? (
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              {!canReverse ? (
                <NotPermitted
                  compact
                  what="Reversing a posting"
                  requires="payment-royalty:override:global"
                />
              ) : alreadyReversed ? (
                <p className="text-[11px] text-[var(--text-3)]">
                  Already reversed. Reversing twice would double-credit it, so the
                  API refuses.
                </p>
              ) : reversing ? (
                <>
                  <Field
                    label="Why"
                    htmlFor="reverse-code"
                    hint={REASON_CODES.find((c) => c.value === reasonCode)?.hint}
                  >
                    <select
                      id="reverse-code"
                      value={reasonCode}
                      onChange={(e) =>
                        setReasonCode(e.target.value as ReversalReasonCode)
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
                    htmlFor="reverse-reason"
                    required
                    hint="Required, and permanent. This is what an auditor reads in three years."
                  >
                    <Textarea
                      id="reverse-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="COGS was recorded twice"
                      maxLength={500}
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={reverse.isPending}
                      disabled={!reason.trim()}
                      onClick={commit}
                    >
                      Reverse this entry
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReversing(false)}
                    >
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
                    Reverses this entry only — the other payees on a split deal keep
                    their earnings.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReversing(true)}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Reverse
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

function AmountHeader({ entry }: { entry: RoyaltyEntryDetail }) {
  return (
    <Panel className="px-4 py-3.5">
      <p className="text-[11px] text-[var(--text-3)]">Royalty amount</p>
      <p className="tnum mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]">
        {formatCurrency(entry.amount, entry.currency)}
      </p>
      <p className="mt-1 text-[12px] text-[var(--text-3)]">
        {entry.currency} · {humanize(entry.payee.type)}
      </p>
    </Panel>
  );
}

/**
 * The arithmetic, laid out as arithmetic.
 *
 * A NET_PROFIT rule pays a percentage of (gross − cost of goods); a
 * GROSS_REVENUE rule pays a percentage of gross and `netProfit` is not part
 * of the sum. Showing the same four rows for both would imply the cost line
 * mattered when it did not, so the basis decides what is rendered.
 */
function CalculationPanel({ entry }: { entry: RoyaltyEntryDetail }) {
  const c = entry.calculation;
  const onNet = c.basis === "NET_PROFIT";

  const rows: [string, string | null][] = onNet
    ? [
        ["Gross revenue", c.grossRevenue],
        ["Cost of goods", c.costOfGoods],
        ["Net profit", c.netProfit],
      ]
    : [["Gross revenue", c.grossRevenue]];

  return (
    <Panel>
      <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        How this was calculated
      </p>
      <dl className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 px-3 py-2"
          >
            <dt className="text-[12px] text-[var(--text-3)]">{label}</dt>
            <dd className="tnum text-[12.5px] text-[var(--text-1)]">
              {value ? formatCurrency(value, entry.currency) : "—"}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 px-3 py-2">
          <dt className="text-[12px] text-[var(--text-3)]">
            {c.percentage ? `${c.percentage}%` : "Share"} of{" "}
            {onNet ? "net profit" : "gross revenue"}
          </dt>
          <dd className="tnum text-[12.5px] font-medium text-[var(--text-1)]">
            {formatCurrency(entry.amount, entry.currency)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/**
 * Corrections posted against this entry.
 *
 * They sit BESIDE the entry and never modify it — a reversal does not zero
 * the original row, it posts a signed adjustment next to it. That is why this
 * list can be non-empty while the amount above is unchanged.
 */
function Adjustments({ entry }: { entry: RoyaltyEntryDetail }) {
  if (!entry.adjustments.length) return null;

  return (
    <Panel>
      <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        Adjustments ({entry.adjustments.length})
      </p>
      <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
        {entry.adjustments.map((a) => (
          <li key={a.id} className="px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <Badge tone="info" className="px-1 py-0 text-[10px]">
                {humanize(a.reasonCode)}
              </Badge>
              <Amount
                signed
                amount={a.amountAdjustment}
                currency={a.currency}
                className="text-[12.5px] font-medium"
              />
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-2)]">
              {a.reason}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
              {formatDateTime(a.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
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
