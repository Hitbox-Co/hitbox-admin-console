"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Lock, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCloseRoyaltyRule, useRoyaltyRule } from "@/lib/api/hooks";
import { formatDate, formatDateTime, humanize, shortId } from "@/lib/format";
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
} from "@/components/ui/primitives";
import { ErrorState, NotPermitted } from "@/components/ui/states";
import { ruleScopeLabel, splitsOf, totalPercentage } from "./rule-helpers";
import type { RoyaltyRule } from "@/lib/types";

/**
 * One rule, and the single edit it accepts: closing it.
 *
 * There is no PUT, PATCH or DELETE on a royalty rule. A rule that has priced
 * an accrual cannot change its terms retroactively without making every entry
 * posted under it unexplainable, so a renegotiation is two acts: close this
 * rule with an effective date and a reason, then create its successor. This
 * drawer does the first and points at the second.
 */
export function RoyaltyRuleDrawer({
  ruleId,
  onClose,
}: {
  ruleId: string;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const query = useRoyaltyRule(ruleId);
  const close = useCloseRoyaltyRule(ruleId);
  const rule = query.data;

  const [closing, setClosing] = React.useState(false);
  const [effectiveTo, setEffectiveTo] = React.useState("");
  const [reason, setReason] = React.useState("");

  const canManage = perms.canManageFinance();

  const commit = () => {
    if (!effectiveTo || !reason.trim()) return;
    close.mutate(
      // A date input gives "2027-01-01"; the DTO coerces a date, and sending
      // the instant makes the boundary unambiguous across time zones.
      { effectiveTo: new Date(`${effectiveTo}T00:00:00Z`).toISOString(), reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success("Rule closed. Create its successor to carry the new terms.");
          setClosing(false);
          setReason("");
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not close this rule."
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
                {rule ? ruleScopeLabel(rule).label : "Royalty rule"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                <Mono className="text-[10px]">{shortId(ruleId, 12)}</Mono>
                {rule ? (
                  <Badge tone={rule.isInForce ? "positive" : "neutral"} dot>
                    {rule.isInForce ? "In force" : "Closed"}
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
            ) : rule ? (
              <>
                <Terms rule={rule} />
                <Facts
                  rows={[
                    ["Basis", humanize(rule.basis)],
                    ["Split type", humanize(rule.splitType)],
                    ["Payout threshold", rule.payoutThreshold ?? "Platform default"],
                    [
                      "Payout cadence",
                      rule.payoutFrequency ? humanize(rule.payoutFrequency) : "Monthly",
                    ],
                    ["Effective from", formatDate(rule.effectiveFrom)],
                    [
                      "Effective to",
                      rule.effectiveTo ? formatDate(rule.effectiveTo) : "Open-ended",
                    ],
                    ["Created", formatDateTime(rule.createdAt)],
                  ]}
                />

                <div className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
                  <Lock
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]"
                    aria-hidden
                  />
                  <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
                    Terms are versioned, not edited. Every entry accrued under this
                    rule stays explainable because the rule it names cannot change
                    underneath it — so a renegotiation closes this one and creates a
                    successor.
                  </p>
                </div>
              </>
            ) : null}
          </div>

          {rule ? (
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              {!canManage ? (
                <NotPermitted
                  compact
                  what="Closing a rule"
                  requires="payment-royalty:manage:global"
                />
              ) : rule.effectiveTo ? (
                <p className="text-[11px] text-[var(--text-3)]">
                  Already closed as of {formatDate(rule.effectiveTo)}.
                </p>
              ) : closing ? (
                <>
                  <Field
                    label="Effective to"
                    htmlFor="rule-close-date"
                    required
                    hint="The rule prices accruals up to this instant and none after it."
                  >
                    <Input
                      id="rule-close-date"
                      type="date"
                      value={effectiveTo}
                      onChange={(e) => setEffectiveTo(e.target.value)}
                    />
                  </Field>
                  <Field label="Reason" htmlFor="rule-close-reason" required>
                    <Textarea
                      id="rule-close-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                      placeholder="Renegotiated at 18% from January"
                    />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={close.isPending}
                      disabled={!effectiveTo || !reason.trim()}
                      onClick={commit}
                    >
                      Close this rule
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setClosing(false)}>
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setClosing(true)}>
                  Close this rule
                </Button>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Terms({ rule }: { rule: RoyaltyRule }) {
  const splits = splitsOf(rule);

  if (!splits.length) {
    return (
      <Panel className="px-4 py-3.5">
        <p className="text-[11px] text-[var(--text-3)]">Share of {humanize(rule.basis).toLowerCase()}</p>
        <p className="tnum mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]">
          {rule.percentage ? `${rule.percentage}%` : "—"}
        </p>
        <p className="mt-1 text-[12px] text-[var(--text-3)]">
          Paid to whichever party this rule is scoped to.
        </p>
      </Panel>
    );
  }

  const total = totalPercentage(splits);

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--hairline)] px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
          Multi-party deal
        </p>
        <p className="tnum text-[12px] text-[var(--text-2)]">
          {total}% of {humanize(rule.basis).toLowerCase()}
        </p>
      </div>
      <ul className="divide-y divide-[var(--hairline)]">
        {splits.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <Badge tone="neutral" className="px-1 py-0 text-[10px]">
                {humanize(s.payeeType)}
              </Badge>
              <Mono className="ml-1.5 text-[10px]">
                {shortId(s.artistId ?? s.organizationId)}
              </Mono>
            </div>
            <span className="tnum text-[12.5px] font-medium text-[var(--text-1)]">
              {String(s.percentage)}%
            </span>
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
