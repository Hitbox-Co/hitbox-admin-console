"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileWarning, Lock, RotateCcw, ScrollText, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAmendRelease, useReleaseDecision, useReopenRelease } from "@/lib/api/hooks";
import { formatDateTime, humanize } from "@/lib/format";
import { useAuthz, usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Input,
  Panel,
  PanelHeader,
  Textarea,
  toneForStatus,
} from "@/components/ui/primitives";
import type {
  ComplianceStatus,
  ReleaseApprovalDetail,
  ReleaseDecisionInput,
} from "@/lib/types";

/**
 * Recording the decision (drop-approval-lifecycle.md §6–8).
 *
 * Buttons are driven by the server's `canApprove` and `canReject`
 * SEPARATELY — an administrator looking at a brand's drop may reject it and
 * may not approve it. A button the caller may not use is shown DISABLED with
 * the server's own reason beneath it, never hidden: an artist who cannot see
 * why they are blocked asks an administrator to do it for them, which is the
 * one thing the rule exists to prevent.
 *
 * The body is strict server-side — anything outside status, comment,
 * acceptLegalCompliance, complianceStatus and oddsDisclosureRef is a 400 — and
 * `oddsDisclosureRef` is a string there, not nullable, so it is sent only when
 * it carries a value.
 */

const COMPLIANCE: ComplianceStatus[] = ["PENDING", "CLEARED", "FLAGGED"];

type Mode = "APPROVED" | "REJECTED" | "REOPEN" | null;

export function ReviewDecisionPanel({
  approval,
  onReopened,
}: {
  approval: ReleaseApprovalDetail;
  /** A reopen opens a NEW review row; the caller navigates to it. */
  onReopened: (newApprovalId: string) => void;
}) {
  const perms = usePermissions();
  const qc = useQueryClient();
  const decide = useReleaseDecision(approval.id);
  const amend = useAmendRelease(approval.id);
  const reopen = useReopenRelease(approval.id);

  const [mode, setMode] = React.useState<Mode>(null);
  const [comment, setComment] = React.useState("");
  const [compliance, setCompliance] = React.useState<ComplianceStatus | "">("");
  const [oddsRef, setOddsRef] = React.useState(approval.oddsDisclosureRef ?? "");
  // Never seeded, never pre-ticked: a ticked box records an acceptance.
  const [acceptLegal, setAcceptLegal] = React.useState(false);
  const [reopenReason, setReopenReason] = React.useState("");

  const legalStatement = approval.legalComplianceStatement?.trim() || null;
  const pending = approval.status === "PENDING";
  const ageIncomplete = approval.product.isAgeSpecific && !approval.product.minimumAge;
  const canApprove = approval.canApprove && !ageIncomplete;
  const canReopen = approval.canReopen ?? false;
  // Working notes (PATCH) take release-approval:manage — artists hold none.
  const canAmend = perms.canAmendRelease() && pending;

  const enter = (next: Mode) => {
    setMode(next);
    setAcceptLegal(false);
  };

  const onDecisionError = (err: unknown) => {
    if (err instanceof ApiError && err.code === "RELEASES_ALREADY_DECIDED") {
      toast.error("Someone decided this review first. Showing the latest.");
      qc.invalidateQueries({ queryKey: ["release", approval.id] });
      setMode(null);
      return;
    }
    // RELEASES_NOT_THE_APPROVER's message is written for display.
    toast.error(err instanceof ApiError ? err.friendly : "Could not record the decision.");
  };

  const submitDecision = () => {
    if (mode !== "APPROVED" && mode !== "REJECTED") return;
    if (mode === "REJECTED" && !comment.trim()) return;
    if (mode === "APPROVED" && (!acceptLegal || !legalStatement)) return;

    const body: ReleaseDecisionInput = { status: mode };
    if (mode === "APPROVED") body.acceptLegalCompliance = true;
    if (comment.trim()) body.comment = comment.trim();
    if (compliance) body.complianceStatus = compliance;
    if (oddsRef.trim()) body.oddsDisclosureRef = oddsRef.trim();

    decide.mutate(body, {
      onSuccess: (detail) => {
        // The hook writes the response into the cache — the page re-renders
        // from it rather than refetching.
        toast.success(
          detail.status === "APPROVED"
            ? "Approved — the drop is cleared for release."
            : "Rejected — the note goes back to the submitter."
        );
        setMode(null);
        setComment("");
      },
      onError: onDecisionError,
    });
  };

  const submitReopen = () => {
    if (!reopenReason.trim()) return;
    reopen.mutate(
      { reason: reopenReason.trim() },
      {
        onSuccess: (detail) => {
          toast.success(`Reopened as v${detail.version} — the same party decides again.`);
          setReopenReason("");
          setMode(null);
          onReopened(detail.id);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.friendly : "Could not reopen the review."),
      }
    );
  };

  const saveNotes = () =>
    amend.mutate(
      {
        comment: comment.trim() || undefined,
        complianceStatus: compliance || undefined,
        oddsDisclosureRef: oddsRef.trim() || null,
      },
      {
        onSuccess: () => toast.success("Review notes saved"),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.friendly : "Could not save the notes."),
      }
    );

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Your decision"
        description={
          pending
            ? "Approve to clear the drop for release, or reject it with a note the submitter will read."
            : `Decided ${formatDateTime(approval.decidedAt)}.`
        }
      />

      <div className="space-y-3 px-4 py-4">
        {!pending ? (
          <Decided approval={approval} />
        ) : mode === null ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="primary"
                disabled={!canApprove}
                onClick={() => enter("APPROVED")}
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </Button>
              <Button
                variant="danger"
                disabled={!approval.canReject}
                onClick={() => enter("REJECTED")}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </div>

            {!canApprove ? (
              <Reason>
                {ageIncomplete && approval.canApprove
                  ? "This drop is age-restricted with no minimum age. It cannot be approved until the drop carries one."
                  : approval.approveBlockedReason ??
                    approval.blockedReason ??
                    "You are not the party entitled to approve this drop."}
              </Reason>
            ) : null}
            {!approval.canReject && approval.blockedReason ? (
              <Reason>{approval.blockedReason}</Reason>
            ) : null}
          </>
        ) : mode === "REOPEN" ? null : (
          <>
            <Field
              label={mode === "REJECTED" ? "Why it is rejected" : "Comment"}
              htmlFor="decision-comment"
              required={mode === "REJECTED"}
              hint={
                mode === "REJECTED"
                  ? "Required — this is what the submitter reads to know what to change."
                  : "Optional."
              }
            >
              <Textarea
                id="decision-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  mode === "REJECTED" ? "The cover art is the wrong version." : "Looks good."
                }
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Compliance" htmlFor="decision-compliance">
                <select
                  id="decision-compliance"
                  value={compliance}
                  onChange={(e) => setCompliance(e.target.value as ComplianceStatus | "")}
                  className="h-8 w-full rounded-[6px] border border-hairline bg-surface-2 px-2 text-[13px] text-text-1"
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
                hint="A non-randomised drop has none."
              >
                <Input
                  id="decision-odds"
                  value={oddsRef}
                  onChange={(e) => setOddsRef(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>

            {mode === "APPROVED" ? (
              legalStatement ? (
                <div className="rounded-[8px] border border-hairline-strong bg-surface-2 px-3 py-2.5">
                  <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-text-1">
                    <input
                      type="checkbox"
                      checked={acceptLegal}
                      onChange={(e) => setAcceptLegal(e.target.checked)}
                      className="mt-0.75 h-3.5 w-3.5 shrink-0 accent-accent"
                    />
                    <span>{legalStatement}</span>
                  </label>
                  <p className="mt-1.5 flex items-center gap-1.5 pl-6 text-[10.5px] text-text-3">
                    <ScrollText className="h-3 w-3 shrink-0" aria-hidden />
                    Recorded with your name and the time.
                  </p>
                </div>
              ) : (
                <Reason danger>
                  The server did not send the legal compliance statement, so there is
                  nothing to accept. Reload the review before approving.
                </Reason>
              )
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={mode === "REJECTED" ? "danger" : "primary"}
                size="sm"
                loading={decide.isPending}
                disabled={
                  mode === "REJECTED" ? !comment.trim() : !acceptLegal || !legalStatement
                }
                onClick={submitDecision}
              >
                Confirm {mode === "APPROVED" ? "approval" : "rejection"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
                Back
              </Button>
              {canAmend ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  loading={amend.isPending}
                  onClick={saveNotes}
                >
                  Save as notes only
                </Button>
              ) : null}
            </div>
          </>
        )}

        {/* Reopen — administrators, on a decided review. */}
        {!pending && canReopen ? (
          mode === "REOPEN" ? (
            <div className="space-y-2 border-t border-hairline pt-3">
              <Field
                label="Why send it back"
                htmlFor="reopen-reason"
                required
                hint="Recorded on the new version and shown to whoever decides it next."
              >
                <Textarea
                  id="reopen-reason"
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Clearance has since been provided by the label."
                  autoFocus
                />
              </Field>
              <p className="text-[11px] leading-relaxed text-text-3">
                Opens v{approval.version + 1} as pending for the same party. It approves
                nothing — the {humanize(approval.status).toLowerCase()} on v
                {approval.version} stays on the record.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={reopen.isPending}
                  disabled={!reopenReason.trim()}
                  onClick={submitReopen}
                >
                  Reopen for another decision
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => enter("REOPEN")}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen
            </Button>
          )
        ) : null}
      </div>
    </Panel>
  );
}

/**
 * Who DECIDED, which is not `approverName`.
 *
 * The backend sets `approverId` to whoever SUBMITTED the review (releases
 * service, submit: `approverId: actorId`); the person who approved or rejected
 * is `checkedById`, and the response carries no name for them. So the name is
 * derived from what the rules guarantee:
 *
 *   the caller decided it           → "you"
 *   auto-passed                     → nobody
 *   APPROVED on an ARTIST review    → only that artist can approve
 *   APPROVED on an ORGANIZATION one → a member of that brand
 *   APPROVED on a PLATFORM one      → HitBox staff
 *   REJECTED                        → the owner OR an administrator — no name
 *                                     is sent, so none is guessed
 */
function decidedBy(approval: ReleaseApprovalDetail, myUserId: string | undefined): string | null {
  if (approval.checkedById && approval.checkedById === myUserId) return "by you";
  if (approval.authority === "NONE") return "automatically — no owner to ask";
  if (approval.status !== "APPROVED") return null;
  if (approval.authority === "ARTIST") return approval.requiredArtistName ? `by ${approval.requiredArtistName}` : "by the artist";
  if (approval.authority === "ORGANIZATION")
    return approval.requiredOrganizationName ? `by ${approval.requiredOrganizationName}` : "by the brand";
  if (approval.authority === "PLATFORM") return "by HitBox staff";
  return null;
}

function Decided({ approval }: { approval: ReleaseApprovalDetail }) {
  const { me } = useAuthz();
  const by = decidedBy(approval, me?.userId);
  const submitter = approval.approverName ?? approval.approverEmail;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={toneForStatus(approval.status)} dot>
          {humanize(approval.status)}
        </Badge>
        {by ? <span className="text-[12px] text-text-2">{by}</span> : null}
      </div>
      {submitter ? (
        <p className="text-[12px] text-text-3">Submitted for review by {submitter}.</p>
      ) : null}
      {approval.status === "APPROVED" ? (
        <p className="text-[12px] text-text-3">
          {approval.legalComplianceAccepted
            ? `Legal terms accepted${
                approval.legalComplianceVersion ? ` (${approval.legalComplianceVersion})` : ""
              }${
                approval.legalComplianceAcceptedAt
                  ? ` on ${formatDateTime(approval.legalComplianceAcceptedAt)}`
                  : ""
              }.`
            : approval.authority === "NONE"
              ? "Auto-passed — no owner to ask, so no acceptance was recorded."
              : "No legal acceptance is recorded on this approval."}
        </p>
      ) : null}
      {approval.blockedReason ? <Reason>{approval.blockedReason}</Reason> : null}
    </div>
  );
}

function Reason({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <p
      className={
        danger
          ? "flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-danger-dim px-3 py-2 text-[11.5px] leading-relaxed text-text-2"
          : "flex items-start gap-1.5 text-[11.5px] leading-relaxed text-text-3"
      }
    >
      {danger ? (
        <FileWarning className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
      ) : (
        <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      )}
      <span>{children}</span>
    </p>
  );
}
