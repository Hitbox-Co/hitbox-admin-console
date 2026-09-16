"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { FileText, Gavel, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useDispute, useResolveDispute, useSubmitEvidence } from "@/lib/api/hooks";
import { formatCurrency, formatDateTime, humanize, shortId } from "@/lib/format";
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
import { Countdown } from "./countdown";
import type { DisputeOutcome } from "@/lib/types";

/**
 * One chargeback: submit evidence, then record the outcome.
 *
 * The outcome is not a label — it books money:
 *
 *   LOST / ACCEPTED  book the chargeback and its fee, mark the order refunded
 *                    and reverse the artist's royalty
 *   WON / WITHDRAWN  change nothing but the case's own status
 *
 * So the resolve form says which of those the operator is about to do before
 * they do it, rather than after.
 */

const OUTCOMES: { value: DisputeOutcome; label: string; effect: string }[] = [
  {
    value: "WON",
    label: "Won",
    effect: "Nothing moves. The money stays with the platform and the royalty stands.",
  },
  {
    value: "LOST",
    label: "Lost",
    effect:
      "Books the chargeback and its fee, marks the order refunded and reverses the artist's royalty.",
  },
  {
    value: "ACCEPTED",
    label: "Accepted",
    effect:
      "Same financial effect as a loss — the platform chose not to contest it rather than being beaten.",
  },
  {
    value: "WITHDRAWN",
    label: "Withdrawn",
    effect: "The cardholder dropped the case. Nothing moves.",
  },
];

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export function DisputeDrawer({
  disputeId,
  onClose,
}: {
  disputeId: string;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const query = useDispute(disputeId);
  const dispute = query.data;

  const evidence = useSubmitEvidence(disputeId);
  const resolve = useResolveDispute(disputeId);

  const [mode, setMode] = React.useState<"evidence" | "resolve" | null>(null);
  const [evidenceText, setEvidenceText] = React.useState("");
  const [evidenceNote, setEvidenceNote] = React.useState("");
  const [outcome, setOutcome] = React.useState<DisputeOutcome>("WON");
  const [resolutionNote, setResolutionNote] = React.useState("");
  const [feeAmount, setFeeAmount] = React.useState("");

  const canManage = perms.canManageFinance();
  const settled = !!dispute?.resolvedAt;

  /**
   * `evidence` is a free-form JSON object on the wire. Parsing it here means
   * a malformed brace is a message beside the field rather than a 422 after
   * the submit, and it is the only way to be sure what gets sent is what the
   * operator meant.
   */
  const evidenceParsed = React.useMemo(() => {
    const text = evidenceText.trim();
    if (!text) return { ok: false as const, error: null };
    try {
      const value = JSON.parse(text) as unknown;
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false as const, error: "Must be a JSON object, e.g. { \"tracking\": \"…\" }." };
      }
      return { ok: true as const, value: value as Record<string, unknown> };
    } catch {
      return { ok: false as const, error: "Not valid JSON." };
    }
  }, [evidenceText]);

  const feeInvalid = feeAmount.trim() !== "" && !MONEY.test(feeAmount.trim());

  const reset = () => {
    setMode(null);
    setEvidenceText("");
    setEvidenceNote("");
    setResolutionNote("");
    setFeeAmount("");
  };

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.friendly : "Could not update the dispute.");

  const submitEvidence = () => {
    if (!evidenceParsed.ok) return;
    evidence.mutate(
      { evidence: evidenceParsed.value, note: evidenceNote.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Evidence submitted.");
          reset();
        },
        onError,
      }
    );
  };

  const submitResolution = () => {
    if (!resolutionNote.trim() || feeInvalid) return;
    resolve.mutate(
      {
        outcome,
        resolutionNote: resolutionNote.trim(),
        feeAmount: feeAmount.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Recorded as ${humanize(outcome).toLowerCase()}.`);
          reset();
        },
        onError,
      }
    );
  };

  const chosen = OUTCOMES.find((o) => o.value === outcome);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[600px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {dispute ? humanize(dispute.reasonCode) : "Dispute"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                <Mono className="text-[10px]">{shortId(disputeId, 12)}</Mono>
                {dispute ? (
                  <Badge tone={toneForStatus(dispute.status)} dot>
                    {humanize(dispute.status)}
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
            ) : dispute ? (
              <>
                <Panel className="flex flex-wrap items-end justify-between gap-4 px-4 py-3.5">
                  <div>
                    <p className="text-[11px] text-[var(--text-3)]">Disputed amount</p>
                    <p className="tnum mt-0.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]">
                      {formatCurrency(dispute.amount, dispute.currency)}
                    </p>
                    {dispute.feeAmount ? (
                      <p className="mt-1 text-[12px] text-[var(--text-3)]">
                        plus a {formatCurrency(dispute.feeAmount, dispute.currency)} fee
                      </p>
                    ) : null}
                  </div>
                  <Countdown iso={dispute.evidenceDueBy} settled={settled} />
                </Panel>

                {dispute.reason ? (
                  <Panel className="px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                      What the cardholder claims
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-2)]">
                      {dispute.reason}
                    </p>
                  </Panel>
                ) : null}

                <Facts
                  rows={[
                    ["Order", dispute.orderId],
                    ["Payment", dispute.paymentTransactionId ?? "—"],
                    ["Gateway", dispute.gateway],
                    ["Provider case", dispute.gatewayCaseRef ?? "—"],
                    ["Opened", formatDateTime(dispute.openedAt)],
                    ["Evidence submitted", formatDateTime(dispute.evidenceSubmittedAt)],
                    ["Resolved", formatDateTime(dispute.resolvedAt)],
                  ]}
                />

                {dispute.resolutionNote ? (
                  <Panel className="px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                      Resolution
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-2)]">
                      {dispute.resolutionNote}
                    </p>
                  </Panel>
                ) : null}
              </>
            ) : null}
          </div>

          {dispute ? (
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              {!canManage ? (
                <NotPermitted
                  compact
                  what="Working a dispute"
                  requires="payment-royalty:manage:global"
                />
              ) : settled ? (
                <p className="text-[11px] text-[var(--text-3)]">
                  Resolved as {humanize(dispute.status).toLowerCase()}. Corrections go
                  through an adjustment, never a second resolution.
                </p>
              ) : mode === "evidence" ? (
                <>
                  <Field
                    label="Evidence"
                    htmlFor="dispute-evidence"
                    required
                    error={evidenceText.trim() ? evidenceParsed.error ?? undefined : undefined}
                    hint='A JSON object of what is being sent to the provider, e.g. {"trackingNumber": "…", "deliveryConfirmation": "…"}.'
                  >
                    <Textarea
                      id="dispute-evidence"
                      rows={5}
                      value={evidenceText}
                      onChange={(e) => setEvidenceText(e.target.value)}
                      className="font-mono text-[12px]"
                      placeholder={'{\n  "trackingNumber": "DHL 7741…",\n  "deliveredAt": "2026-09-14"\n}'}
                    />
                  </Field>
                  <Field label="Note" htmlFor="dispute-evidence-note" hint="Optional.">
                    <Textarea
                      id="dispute-evidence-note"
                      rows={2}
                      value={evidenceNote}
                      onChange={(e) => setEvidenceNote(e.target.value)}
                      maxLength={1000}
                    />
                  </Field>
                  <Actions
                    label="Submit evidence"
                    loading={evidence.isPending}
                    disabled={!evidenceParsed.ok}
                    onCommit={submitEvidence}
                    onCancel={reset}
                  />
                </>
              ) : mode === "resolve" ? (
                <>
                  <Field label="Outcome" htmlFor="dispute-outcome" hint={chosen?.effect}>
                    <select
                      id="dispute-outcome"
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value as DisputeOutcome)}
                      className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                    >
                      {OUTCOMES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Fee kept by the network"
                    htmlFor="dispute-fee"
                    error={feeInvalid ? "Use an amount like 15.00." : undefined}
                    hint="Optional. Charged regardless of outcome on most networks."
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

                  <Field label="Resolution note" htmlFor="dispute-resolution" required>
                    <Textarea
                      id="dispute-resolution"
                      rows={2}
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      maxLength={1000}
                      placeholder="Provider found for the cardholder; delivery proof was not accepted."
                    />
                  </Field>

                  <Actions
                    label={`Record as ${humanize(outcome).toLowerCase()}`}
                    danger={outcome === "LOST" || outcome === "ACCEPTED"}
                    loading={resolve.isPending}
                    disabled={!resolutionNote.trim() || feeInvalid}
                    onCommit={submitResolution}
                    onCancel={reset}
                  />
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMode("evidence")}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {dispute.evidenceSubmittedAt ? "Resubmit evidence" : "Submit evidence"}
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setMode("resolve")}>
                    <Gavel className="h-3.5 w-3.5" />
                    Record outcome
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
