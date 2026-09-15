"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Check, FileWarning, Lock, ShieldAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAmendRelease, useRelease, useReleaseDecision } from "@/lib/api/hooks";
import { formatDateTime, humanize } from "@/lib/format";
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
import { ErrorState } from "@/components/ui/states";
import type { ComplianceStatus, ReleaseHistoryEntry } from "@/lib/types";

/**
 * The release review: amend while undecided, then approve or reject.
 *
 * `canDecide` / `blockedReason` come from the server and drive the buttons.
 * The console does not re-derive them from `status`, because the real rule
 * includes whether the caller holds release-approval:override:global — which
 * only the server knows.
 *
 * The version history is append-only: resubmitting a rejected drop creates
 * version N+1 rather than overwriting the rejection, which is what makes
 * "why was this bounced twice" answerable six months later.
 */

const COMPLIANCE: ComplianceStatus[] = ["PENDING", "CLEARED", "FLAGGED"];

export function ReleaseDrawer({
  approvalId,
  onClose,
}: {
  approvalId: string;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const query = useRelease(approvalId);
  const amend = useAmendRelease(approvalId);
  const decide = useReleaseDecision(approvalId);
  const approval = query.data;

  const canManage = perms.can("release-approval", "manage");

  const [mode, setMode] = React.useState<"APPROVED" | "REJECTED" | null>(null);
  const [comment, setComment] = React.useState("");
  const [compliance, setCompliance] = React.useState<ComplianceStatus | "">("");

  /**
   * Null means "untouched, show whatever the server has". Deriving it this
   * way rather than seeding state from an effect means a refetch that changes
   * the stored reference is reflected immediately, and an edit in progress is
   * never silently overwritten by one.
   */
  const [oddsRefEdit, setOddsRefEdit] = React.useState<string | null>(null);
  const oddsRef = oddsRefEdit ?? approval?.oddsDisclosureRef ?? "";
  const setOddsRef = setOddsRefEdit;

  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.friendly : "Could not update the review.");

  const submitDecision = () => {
    if (!mode) return;
    // The API refuses a rejection with no comment (422
    // RELEASES_COMMENT_REQUIRED); block it here so the operator is not
    // bounced by a validation error they could have been told about.
    if (mode === "REJECTED" && !comment.trim()) return;

    decide.mutate(
      {
        status: mode,
        comment: comment.trim() || undefined,
        complianceStatus: (compliance || undefined) as ComplianceStatus | undefined,
        oddsDisclosureRef: oddsRef.trim() || null,
      },
      {
        onSuccess: (detail) => {
          toast.success(
            detail.status === "APPROVED"
              ? "Approved — the drop is cleared for release"
              : "Rejected"
          );
          setMode(null);
          setComment("");
        },
        onError,
      }
    );
  };

  const saveNotes = () => {
    amend.mutate(
      {
        comment: comment.trim() || undefined,
        complianceStatus: (compliance || undefined) as ComplianceStatus | undefined,
        oddsDisclosureRef: oddsRef.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Review notes saved");
          setComment("");
        },
        onError,
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
              <Dialog.Title className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {approval ? approval.product.name : "Release review"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                {approval ? (
                  <>
                    <Mono className="text-[10px]">{approval.product.groupCode}</Mono>
                    <span>v{approval.version}</span>
                    <Badge tone={toneForStatus(approval.status)} dot>
                      {humanize(approval.status)}
                    </Badge>
                  </>
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
            ) : approval ? (
              <>
                {/* The three facts the approver is personally accountable for. */}
                <Panel>
                  <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                    Compliance sign-off
                  </p>
                  <div className="space-y-2 px-3 pb-3">
                    <Row label="Compliance status">
                      <Badge tone={toneForStatus(approval.complianceStatus)}>
                        {humanize(approval.complianceStatus)}
                      </Badge>
                    </Row>
                    <Row label="Age restriction">
                      {approval.product.isAgeSpecific ? (
                        <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--warning-dim)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warning)]">
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          {approval.product.minimumAge
                            ? `${approval.product.minimumAge}+`
                            : "Age-specific, no minimum set"}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[var(--text-3)]">None</span>
                      )}
                    </Row>
                    <Row label="Odds disclosure">
                      {approval.oddsDisclosureRef ? (
                        <Mono className="text-[10px]">{approval.oddsDisclosureRef}</Mono>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--text-3)]">
                          <FileWarning className="h-3 w-3" aria-hidden />
                          None
                        </span>
                      )}
                    </Row>
                    <Row label="Total supply">
                      <span className="tnum text-[12px] text-[var(--text-1)]">
                        {approval.product.totalSupply}
                      </span>
                    </Row>
                    <Row label="Drop status">
                      <Badge tone={toneForStatus(approval.product.status)}>
                        {humanize(approval.product.status)}
                      </Badge>
                    </Row>
                    {approval.approverEmail ? (
                      <Row label="Approver">
                        <span className="text-[12px] text-[var(--text-1)]">
                          {approval.approverName ?? approval.approverEmail}
                        </span>
                      </Row>
                    ) : null}
                    {approval.decidedAt ? (
                      <Row label="Decided">
                        <span className="tnum text-[12px] text-[var(--text-1)]">
                          {formatDateTime(approval.decidedAt)}
                        </span>
                      </Row>
                    ) : null}
                  </div>
                </Panel>

                {approval.product.isAgeSpecific && !approval.product.minimumAge ? (
                  <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
                    <ShieldAlert className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                    This drop is age-restricted with no minimum age set. Approving
                    it is refused with RELEASES_COMPLIANCE_INCOMPLETE until the
                    product carries one.
                  </p>
                ) : null}

                {approval.comment ? (
                  <Panel className="px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                      Current note
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-1)]">
                      {approval.comment}
                    </p>
                  </Panel>
                ) : null}

                <History entries={approval.history} />
              </>
            ) : null}
          </div>

          {approval ? (
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              {!canManage ? (
                <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                  <Lock className="h-3 w-3" aria-hidden />
                  Deciding a review needs release-approval:manage
                </p>
              ) : !approval.canDecide ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
                  <Lock className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                  {approval.blockedReason ??
                    "This review has already been decided."}
                </p>
              ) : mode ? (
                <>
                  <Field
                    label={mode === "REJECTED" ? "Reason for rejecting" : "Comment"}
                    htmlFor="decision-comment"
                    hint={
                      mode === "REJECTED"
                        ? "Required — the API rejects a rejection without one."
                        : "Optional."
                    }
                  >
                    <Textarea
                      id="decision-comment"
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={
                        mode === "REJECTED" ? "Odds disclosure missing." : "Cleared."
                      }
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Compliance status" htmlFor="decision-compliance">
                      <select
                        id="decision-compliance"
                        value={compliance}
                        onChange={(e) =>
                          setCompliance(e.target.value as ComplianceStatus | "")
                        }
                        className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
                      >
                        <option value="">
                          Default ({mode === "APPROVED" ? "Cleared" : "Flagged"})
                        </option>
                        {COMPLIANCE.map((c) => (
                          <option key={c} value={c}>
                            {humanize(c)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="Odds disclosure"
                      htmlFor="decision-odds"
                      hint="A non-randomised drop legitimately has none."
                    >
                      <Input
                        id="decision-odds"
                        value={oddsRef}
                        onChange={(e) => setOddsRef(e.target.value)}
                        placeholder="https://…"
                      />
                    </Field>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={mode === "REJECTED" ? "danger" : "primary"}
                      size="sm"
                      loading={decide.isPending}
                      disabled={mode === "REJECTED" && !comment.trim()}
                      onClick={submitDecision}
                    >
                      Confirm {mode === "APPROVED" ? "approval" : "rejection"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
                      Back
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      loading={amend.isPending}
                      onClick={saveNotes}
                    >
                      Save as notes only
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => setMode("APPROVED")}>
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setMode("REJECTED")}>
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <span className="ml-auto text-[11px] text-[var(--text-3)]">
                    Approving clears the drop for release; publishing is separate.
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] text-[var(--text-3)]">{label}</span>
      {children}
    </div>
  );
}

function History({ entries }: { entries: ReleaseHistoryEntry[] }) {
  if (!entries.length) return null;

  return (
    <Panel>
      <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        Version history ({entries.length})
      </p>
      <ul className="divide-y divide-[var(--hairline)]">
        {entries.map((h) => (
          <li key={h.id} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-[var(--text-1)]">
                  v{h.version}
                </span>
                <Badge tone={toneForStatus(h.status)} dot>
                  {humanize(h.status)}
                </Badge>
                <Badge tone={toneForStatus(h.complianceStatus)} className="px-1 py-0 text-[10px]">
                  {humanize(h.complianceStatus)}
                </Badge>
              </span>
              <span className="tnum shrink-0 text-[11px] text-[var(--text-3)]">
                {formatDateTime(h.decidedAt ?? h.createdAt)}
              </span>
            </div>
            {h.comment ? (
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-2)]">
                {h.comment}
              </p>
            ) : null}
            {h.approverEmail ? (
              <p className="mt-0.5 text-[10.5px] text-[var(--text-3)]">{h.approverEmail}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
