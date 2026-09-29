"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Check, FileWarning, Lock, RotateCcw, ScrollText, ShieldAlert, Users, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAmendRelease,
  useRelease,
  useReleaseDecision,
  useReopenRelease,
} from "@/lib/api/hooks";
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
import type {
  ComplianceStatus,
  ReleaseApprovalDetail,
  ReleaseAuthority,
  ReleaseHistoryEntry,
} from "@/lib/types";

/**
 * The release review: amend while undecided, then approve or reject.
 *
 * The two buttons are driven from `canApprove` and `canReject` SEPARATELY,
 * never from one flag, because for an administrator looking at a brand's drop
 * they differ: refusal is broader than consent. Neither is re-derived from
 * `status` — the real rule turns on the drop's frozen authority and on
 * whether the caller holds release-approval:override:global, and only the
 * server knows the second.
 *
 * The version history is append-only: resubmitting a rejected drop creates
 * version N+1 rather than overwriting the rejection, which is what makes
 * "why was this bounced twice" answerable six months later. Reopening works
 * the same way, and leaves the rejection it came from intact.
 */

const COMPLIANCE: ComplianceStatus[] = ["PENDING", "CLEARED", "FLAGGED"];

/**
 * Who the frozen authority names. Worth spelling out on screen: an approver
 * who does not know why they are blocked will ask an administrator to do it
 * for them, which is the one thing the rule exists to prevent.
 */
const AUTHORITY: Record<string, { label: string; who: string }> = {
  ARTIST: {
    label: "Artist",
    who: "the artist named on this drop",
  },
  ORGANIZATION: {
    label: "Brand",
    who: "someone holding a role in the owning brand",
  },
  PLATFORM: {
    label: "Platform",
    who: "HitBox staff",
  },
  NONE: {
    label: "Auto-passed",
    who: "nobody — the drop names no artist and no organization",
  },
};

/**
 * Never index AUTHORITY directly. The list rows in the API sample carry no
 * `authority`, so a row that predates the field — or a value added
 * server-side later — would otherwise crash the drawer on open rather than
 * degrade to a vaguer sentence.
 */
function authorityOf(value: ReleaseAuthority | null | undefined) {
  if (value && AUTHORITY[value]) return AUTHORITY[value];
  return {
    label: value ? humanize(value) : "Unresolved",
    who: "the party that owns this drop",
  };
}

type Mode = "APPROVED" | "REJECTED" | "REOPEN" | null;

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
  const reopen = useReopenRelease(approvalId);
  const approval = query.data;
  // Rendered verbatim from the server — the wording is versioned there.
  const legalStatement = approval?.legalComplianceStatement?.trim() || null;

  /*
   * The decision route admits approve, reject OR manage. Gating the footer on
   * manage alone locked out the two roles the authority rule exists to serve
   * — Artist and Brand Admin hold approve/reject, never manage.
   */
  const canReachDecision = perms.canReachReleaseDecision();
  // Working notes (PATCH) are the queue administrator's: manage, exactly.
  const canAmend = perms.canAmendRelease();
  /*
   * Reopening is the override path, and an exact-action check: a manage grant
   * does not imply it, so can() would offer the button to a role the
   * controller then refuses. The server's canReopen is the real answer; the
   * grant check covers a response that predates the field.
   */
  const canOverride = perms.canReopenRelease();
  const canReopen = approval
    ? (approval.canReopen ?? (canOverride && !!approval.decidedAt))
    : false;

  const [mode, setMode] = React.useState<Mode>(null);
  const [comment, setComment] = React.useState("");
  const [compliance, setCompliance] = React.useState<ComplianceStatus | "">("");
  /*
   * Starts false on every entry into the approve flow and is never seeded
   * from the server. A pre-ticked box records an acceptance nobody made.
   */
  const [acceptLegal, setAcceptLegal] = React.useState(false);
  const [reopenReason, setReopenReason] = React.useState("");

  const enterMode = (next: Mode) => {
    setMode(next);
    setAcceptLegal(false);
  };

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
    if (mode !== "APPROVED" && mode !== "REJECTED") return;
    // The API refuses a rejection with no comment (422
    // RELEASES_COMMENT_REQUIRED); block it here so the operator is not
    // bounced by a validation error they could have been told about.
    if (mode === "REJECTED" && !comment.trim()) return;
    // Likewise 422 RELEASES_LEGAL_ACCEPTANCE_REQUIRED.
    if (mode === "APPROVED" && (!acceptLegal || !legalStatement)) return;

    decide.mutate(
      {
        status: mode,
        // Sent only on an approval. Refusing to publish something carries no
        // liability, so a rejection needs no acceptance.
        acceptLegalCompliance: mode === "APPROVED" ? true : undefined,
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
          setAcceptLegal(false);
        },
        onError,
      }
    );
  };

  const submitReopen = () => {
    if (!reopenReason.trim()) return;
    reopen.mutate(
      { reason: reopenReason.trim() },
      {
        onSuccess: (detail) => {
          toast.success(
            `Reopened as v${detail.version} — back with ${
              authorityOf(detail.authority).who
            } to decide`
          );
          setReopenReason("");
          setMode(null);
          // The reopen created a NEW approval row; this drawer is looking at
          // the old one, which is now history.
          onClose();
        },
        onError: (err: unknown) =>
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not reopen the review."
          ),
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
                <AuthorityPanel approval={approval} />

                {approval.reopenedFromVersion !== null ? (
                  <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]">
                    <RotateCcw className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                      Reopened from v{approval.reopenedFromVersion}
                      {approval.reopenedAt
                        ? ` on ${formatDateTime(approval.reopenedAt)}`
                        : ""}
                      .{" "}
                      {approval.reopenReason ? (
                        <span className="text-[var(--text-1)]">
                          “{approval.reopenReason}”
                        </span>
                      ) : null}
                    </span>
                  </p>
                ) : null}

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
                    {/*
                      What was accepted and when, not merely that it was. An
                      approval with no acceptance on it is the thing an audit
                      is looking for, so show its absence too.
                    */}
                    {approval.status === "APPROVED" ? (
                      <Row label="Legal compliance">
                        {approval.legalComplianceAccepted ? (
                          <span className="text-[12px] text-[var(--text-1)]">
                            Accepted
                            {approval.legalComplianceVersion
                              ? ` (${approval.legalComplianceVersion})`
                              : ""}
                            {approval.legalComplianceAcceptedAt
                              ? ` · ${formatDateTime(approval.legalComplianceAcceptedAt)}`
                              : ""}
                          </span>
                        ) : approval.authority === "NONE" ? (
                          // The auto-pass: nobody accepted anything, and the
                          // row says so rather than implying a signature.
                          <span className="text-[12px] text-[var(--text-3)]">
                            Not required — auto-passed
                          </span>
                        ) : (
                          <span className="text-[12px] text-[var(--danger)]">
                            Not recorded
                          </span>
                        )}
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
              {!canReachDecision && !canReopen ? (
                <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                  <Lock className="h-3 w-3" aria-hidden />
                  Read-only — deciding a review needs release-approval:approve,
                  :reject or :manage
                </p>
              ) : mode === "REOPEN" ? (
                <>
                  <Field
                    label="Why send it back"
                    htmlFor="reopen-reason"
                    hint="Recorded on the new version, and visible to whoever decides it next."
                  >
                    <Textarea
                      id="reopen-reason"
                      rows={3}
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="The rights query was resolved — please take another look."
                      autoFocus
                    />
                  </Field>

                  <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]">
                    <RotateCcw className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                    This opens v{approval.version + 1} as pending and puts the drop
                    back to submitted. It approves nothing —{" "}
                    {authorityOf(approval.authority).who} still has to decide, tickmark
                    and all. The {humanize(approval.status).toLowerCase()} on
                    v{approval.version} stays on the record.
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
                </>
              ) : !approval.canApprove && !approval.canReject ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
                  <Lock className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                  {approval.blockedReason ??
                    approval.approveBlockedReason ??
                    "This review has already been decided."}
                  {canReopen ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto shrink-0"
                      onClick={() => enterMode("REOPEN")}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reopen
                    </Button>
                  ) : null}
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

                  {/*
                    The acceptance itself. Unticked on every entry, never a
                    hidden field: what gets stored is which wording was
                    accepted, so the operator has to have been shown it.
                  */}
                  {mode === "APPROVED" && !legalStatement ? (
                    /*
                      Never a hard-coded fallback: the stored version would
                      then sit next to wording the approver was never shown.
                    */
                    <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]">
                      <FileWarning className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--danger)]" aria-hidden />
                      The server did not send the legal compliance statement, so there is
                      nothing to accept. Reload the review before approving.
                    </p>
                  ) : mode === "APPROVED" ? (
                    <div className="rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5">
                      <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-[var(--text-1)]">
                        <input
                          type="checkbox"
                          checked={acceptLegal}
                          onChange={(e) => setAcceptLegal(e.target.checked)}
                          className="mt-[2px] h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                        />
                        <span>{legalStatement}</span>
                      </label>
                      <p className="mt-1.5 flex items-center gap-1.5 pl-6 text-[10.5px] text-[var(--text-3)]">
                        <ScrollText className="h-3 w-3 shrink-0" aria-hidden />
                        Recorded against{" "}
                        {approval.legalComplianceVersionRequired ?? "the current terms"},
                        with your name and the time.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <Button
                      variant={mode === "REJECTED" ? "danger" : "primary"}
                      size="sm"
                      loading={decide.isPending}
                      disabled={
                        mode === "REJECTED"
                          ? !comment.trim()
                          : !acceptLegal || !legalStatement
                      }
                      onClick={submitDecision}
                    >
                      Confirm {mode === "APPROVED" ? "approval" : "rejection"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
                      Back
                    </Button>
                    {canAmend && !approval.decidedAt ? (
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
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {approval.canApprove ? (
                      <Button
                        variant="primary"
                        size="sm"
                        // RELEASES_COMPLIANCE_INCOMPLETE — refused outright
                        // server-side, so not offered as clickable here.
                        disabled={
                          approval.product.isAgeSpecific && !approval.product.minimumAge
                        }
                        onClick={() => enterMode("APPROVED")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </Button>
                    ) : null}
                    {approval.canReject ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => enterMode("REJECTED")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    ) : null}
                    {canReopen ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => enterMode("REOPEN")}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reopen
                      </Button>
                    ) : null}
                  </div>

                  {/*
                    The case this whole screen turns on: an administrator who
                    may refuse a brand's drop but may not consent on its
                    behalf. Saying nothing would read as a bug.
                  */}
                  {!approval.canApprove ? (
                    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
                      <Lock className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                      {approval.approveBlockedReason ??
                        `Only ${authorityOf(approval.authority).who} can approve this drop.`}
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--text-3)]">
                      Approving clears the drop for release; publishing is separate.
                    </p>
                  )}
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
 * Who owns this drop and who therefore decides it. Above the compliance facts
 * deliberately: it is the first thing that determines whether the rest of the
 * screen is actionable for the person reading it.
 */
function AuthorityPanel({ approval }: { approval: ReleaseApprovalDetail }) {
  const authority = authorityOf(approval.authority);
  const named =
    approval.authority === "ORGANIZATION"
      ? approval.requiredOrganizationName
      : approval.authority === "ARTIST"
        ? approval.requiredArtistName
        : null;

  return (
    <Panel>
      <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        Entitled to decide
      </p>
      <div className="space-y-2 px-3 pb-3">
        <Row label="Authority">
          <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-1)]">
            <Users className="h-3 w-3" aria-hidden />
            {authority.label}
          </span>
        </Row>
        {named ? (
          <Row label={approval.authority === "ORGANIZATION" ? "Brand" : "Artist"}>
            <span className="text-[12px] text-[var(--text-1)]">{named}</span>
          </Row>
        ) : null}
        {approval.authority === "NONE" ? (
          <p className="text-[11.5px] leading-relaxed text-[var(--text-3)]">
            This drop names neither an artist nor an organization, so there was no
            owner whose consent a review could capture. It was approved on submit
            and filed under HitBox — a real review row, but not a signed one.
          </p>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-[var(--text-3)]">
            Approval must come from {authority.who}. It was resolved from the
            drop&rsquo;s organization when the review opened and does not change
            if the drop later does — the party that was asked is the party asked
            again.
          </p>
        )}
        {approval.reopenedFromVersion ? (
          <p className="text-[11.5px] leading-relaxed text-[var(--text-2)]">
            Reopened from v{approval.reopenedFromVersion}
            {approval.reopenReason ? ` — “${approval.reopenReason}”` : ""}
          </p>
        ) : null}
      </div>
    </Panel>
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
            {h.reopenedFromVersion ? (
              <p className="mt-1 text-[11px] text-[var(--text-3)]">
                Reopened from v{h.reopenedFromVersion}
                {h.reopenReason ? ` — ${h.reopenReason}` : ""}
              </p>
            ) : null}
            {h.status === "APPROVED" ? (
              <p className="mt-0.5 text-[10.5px] text-[var(--text-3)]">
                {h.authority === "NONE"
                  ? "Auto-passed — no acceptance recorded"
                  : h.legalComplianceAccepted
                    ? `Terms accepted${h.legalComplianceVersion ? ` (${h.legalComplianceVersion})` : ""}`
                    : "No acceptance recorded"}
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
