"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, Info, Lock, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useBatchUpdateSkus } from "@/lib/api/hooks";
import { formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
  Textarea,
} from "@/components/ui/primitives";
import {
  SKU_BATCH_MAX,
  type SkuBatchResult,
  type SkuUpdateInput,
  type TagLifecycleState,
} from "@/lib/types";

/**
 * Tag states an operator may set by hand.
 *
 * ACTIVE is reached on first claim, by the claims module — writing it here
 * would make the column describe an intention rather than the tag.
 * UNPROVISIONED means no tag was ever written to this unit, a fact about the
 * past. REVOKED is terminal, because if it could be walked back "revoked"
 * would mean "revoked for now".
 */
const SETTABLE_TAG_STATES: TagLifecycleState[] = ["BOUND", "LOST", "DISPUTED", "REVOKED"];

/** The four changes that stop something, and so require a reason. */
function reasonRequired(changes: SkuUpdateInput) {
  return (
    changes.flagged === true ||
    changes.archived === true ||
    changes.tagLifecycleState === "LOST" ||
    changes.tagLifecycleState === "REVOKED"
  );
}

type Tri = "" | "true" | "false";

/**
 * One set of changes, applied to every selected unit, in one transaction.
 *
 * All or nothing: if one selected unit refuses, nothing is written and the
 * error names every refusal at once. Partial application is the state to
 * avoid, not the error — an operator told "312 of your 400 units took the
 * change" has a reconciliation problem only the warehouse can answer.
 */
export function BatchEditDrawer({
  skuIds,
  productId,
  onClose,
  onApplied,
}: {
  skuIds: string[];
  /**
   * Picks the ROUTE, not just a body field. A router with no product in its
   * path has no organization to check a grant against, so the flat endpoint
   * admits global grants only; an organization-scoped caller reaches batch
   * editing through the nested form and is confined to that drop.
   */
  productId?: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const perms = usePermissions();
  const batch = useBatchUpdateSkus();

  const canEditUnits = perms.can("collectible-instance", "manage");
  /* The tag block is a separate grant. A Drop Manager can archive half an
     edition and cannot revoke one tag; a body mixing both is refused in full. */
  const canEditTags = perms.can("nfc-tag-claim", "manage");

  const [isActive, setIsActive] = React.useState<Tri>("");
  const [archived, setArchived] = React.useState<Tri>("");
  const [resaleBlocked, setResaleBlocked] = React.useState<Tri>("");
  const [resaleReason, setResaleReason] = React.useState("");
  const [flagged, setFlagged] = React.useState<Tri>("");
  const [tamperStatus, setTamperStatus] = React.useState("");
  const [tagState, setTagState] = React.useState<TagLifecycleState | "">("");
  const [reason, setReason] = React.useState("");
  const [preview, setPreview] = React.useState<SkuBatchResult | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);

  const changes = React.useMemo(() => {
    /* An ABSENT key means "leave it alone" — only send what was touched. */
    const c: SkuUpdateInput = {};
    if (isActive) c.isActive = isActive === "true";
    if (archived) c.archived = archived === "true";
    if (resaleBlocked) c.resaleBlocked = resaleBlocked === "true";
    if (resaleReason.trim()) c.resaleBlockedReason = resaleReason.trim();
    if (flagged) c.flagged = flagged === "true";
    if (tamperStatus.trim()) c.tamperStatus = tamperStatus.trim();
    if (tagState) c.tagLifecycleState = tagState;
    return c;
  }, [isActive, archived, resaleBlocked, resaleReason, flagged, tamperStatus, tagState]);

  const touched = Object.keys(changes).length > 0;
  const needsReason = reasonRequired(changes);
  /* resaleBlocked is exempt: resaleBlockedReason already IS the reason, and
     asking for both is the same sentence typed twice. */
  const missingResaleReason =
    changes.resaleBlocked === true && !resaleReason.trim();
  const overCap = skuIds.length > SKU_BATCH_MAX;

  const blocked =
    !touched ||
    overCap ||
    (needsReason && !reason.trim()) ||
    missingResaleReason;

  const run = (dryRun: boolean) => {
    if (blocked) return;
    setRefusal(null);

    batch.mutate(
      {
        productId,
        targets: { skuIds },
        changes: { ...changes, ...(reason.trim() ? { reason: reason.trim() } : {}) },
        dryRun,
      },
      {
        onSuccess: (result) => {
          setPreview(result);
          if (!result.dryRun) {
            toast.success(
              `${formatNumber(result.changed)} unit${
                result.changed === 1 ? "" : "s"
              } updated`
            );
            onApplied();
          }
        },
        onError: (err: unknown) => {
          setPreview(null);
          // SKUS_BATCH_REJECTED names every refusal at once, and that list is
          // the whole value — a toast would truncate it out of usefulness.
          setRefusal(
            err instanceof ApiError ? err.friendly : "Could not apply the change."
          );
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[560px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Edit {formatNumber(skuIds.length)} unit
                {skuIds.length === 1 ? "" : "s"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                One set of changes, one transaction. Blank means leave alone.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {overCap ? (
              <Notice tone="danger">
                {formatNumber(skuIds.length)} units selected — the cap is{" "}
                {formatNumber(SKU_BATCH_MAX)} per call. The whole batch is one
                transaction, and one updating ten thousand rows holds locks long
                enough to matter. Narrow the selection.
              </Notice>
            ) : null}

            {!canEditUnits ? (
              <Notice tone="danger">
                Editing units needs collectible-instance:manage.
              </Notice>
            ) : null}

            <TriField
              label="Listed"
              value={isActive}
              onChange={setIsActive}
              trueLabel="Active"
              falseLabel="Inactive"
              hint="Staging a release: mint inactive, then flip the edition on release day."
            />

            <TriField
              label="Archived"
              value={archived}
              onChange={setArchived}
              trueLabel="Archived"
              falseLabel="Live"
              hint="Archiving also delists. It is refused on a unit somebody is holding — archiving hides a real object from the platform while its owner still has it in their hands."
            />

            <TriField
              label="Resale"
              value={resaleBlocked}
              onChange={setResaleBlocked}
              trueLabel="Blocked"
              falseLabel="Allowed"
            />

            {resaleBlocked === "true" ? (
              <Field
                label="Why resale is blocked"
                htmlFor="b-resale-reason"
                hint="Required. This is the reason, which is why a separate audit reason is not also asked for."
              >
                <Input
                  id="b-resale-reason"
                  value={resaleReason}
                  invalid={missingResaleReason}
                  onChange={(e) => setResaleReason(e.target.value)}
                  placeholder="Chargeback on order 3344 — pending investigation"
                />
              </Field>
            ) : null}

            <TriField
              label="Investigation freeze"
              value={flagged}
              onChange={setFlagged}
              trueLabel="Flagged"
              falseLabel="Cleared"
              hint="The only way claimed status moves here. Unflagging derives the state from ownership rather than restoring a previous value nothing recorded — with an owner, claimed; without, unclaimed."
            />

            <Field
              label="Tamper note"
              htmlFor="b-tamper"
              hint="Free text, e.g. SEAL_BROKEN."
            >
              <Input
                id="b-tamper"
                value={tamperStatus}
                onChange={(e) => setTamperStatus(e.target.value)}
                placeholder="SEAL_BROKEN"
              />
            </Field>

            <div className="border-t border-[var(--hairline)] pt-4">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                Tag custody
                {!canEditTags ? <Lock className="h-3 w-3" aria-hidden /> : null}
              </p>
              {canEditTags ? (
                <Field
                  label="Tag lifecycle"
                  htmlFor="b-tag-state"
                  className="mt-2"
                  hint="Active and unprovisioned are not settable by hand, and revoked is terminal."
                >
                  <select
                    id="b-tag-state"
                    value={tagState}
                    onChange={(e) =>
                      setTagState(e.target.value as TagLifecycleState | "")
                    }
                    className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
                  >
                    <option value="">Leave alone</option>
                    {SETTABLE_TAG_STATES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                  Tag fields need nfc-tag-claim:manage on top of the unit grant.
                  A body mixing both is refused in full, naming the fields —
                  nothing partial is written.
                </p>
              )}
            </div>

            {needsReason ? (
              <Field
                label="Reason"
                htmlFor="b-reason"
                error={!reason.trim() ? "Required for this change." : undefined}
                hint="Recorded in the audit trail, not on the row. This change stops something — six months later the only question anybody asks about these units is why."
                required
              >
                <Textarea
                  id="b-reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Pallet destroyed in transit — insurer claim INS-2026-114"
                />
              </Field>
            ) : null}

            {refusal ? (
              <Notice tone="danger">
                <span className="block font-medium">Nothing was written.</span>
                <span className="mt-1 block whitespace-pre-wrap">{refusal}</span>
              </Notice>
            ) : null}

            {preview ? <BatchResult result={preview} /> : null}
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              loading={batch.isPending}
              disabled={blocked}
              onClick={() => run(true)}
            >
              Dry run
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={batch.isPending}
              disabled={blocked}
              onClick={() => run(false)}
            >
              Apply to {formatNumber(skuIds.length)}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            {!touched ? (
              <span className="ml-auto text-[11px] text-[var(--text-3)]">
                Nothing to change
              </span>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BatchResult({ result }: { result: SkuBatchResult }) {
  return (
    <Panel>
      <p className="flex items-center gap-2 px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        {result.dryRun ? "Dry run — nothing written" : "Applied"}
        {result.dryRun ? <Badge tone="neutral">Preview</Badge> : null}
      </p>
      <div className="grid grid-cols-4 gap-x-4 px-3 pb-2">
        <Figure label="Requested" value={result.requested} />
        <Figure label="Matched" value={result.matched} />
        <Figure label="Changed" value={result.changed} />
        <Figure label="Unchanged" value={result.unchanged} />
      </div>
      <p className="px-3 pb-3 text-[11px] leading-relaxed text-[var(--text-3)]">
        Unchanged units are already in the requested state. That is ordinary —
        it is what acting on a filtered list looks like — and they are skipped,
        not refused.
      </p>
      {result.items.length > 0 ? (
        <ul className="max-h-48 divide-y divide-[var(--hairline)] overflow-y-auto border-t border-[var(--hairline)]">
          {result.items.slice(0, 200).map((i) => (
            <li
              key={i.skuId}
              className="flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <Mono className="text-[10.5px]">{i.skuCode}</Mono>
              <span className="text-[11px] text-[var(--text-3)]">
                {i.changed.length === 0
                  ? "no change"
                  : i.changed.map((c) => humanize(c)).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-3)]">{label}</p>
      <p className="tnum mt-0.5 text-[16px] font-medium text-[var(--text-1)]">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function TriField({
  label,
  value,
  onChange,
  trueLabel,
  falseLabel,
  hint,
}: {
  label: string;
  value: Tri;
  onChange: (v: Tri) => void;
  trueLabel: string;
  falseLabel: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-1.5">
        {(
          [
            ["", "Leave alone"],
            ["true", trueLabel],
            ["false", falseLabel],
          ] as [Tri, string][]
        ).map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-[6px] border px-2 py-1 text-[12px] transition-colors ${
              value === v
                ? "border-[var(--accent)] bg-[var(--surface-3)] font-medium text-[var(--text-1)]"
                : "border-[var(--hairline)] text-[var(--text-3)] hover:border-[var(--hairline-strong)] hover:text-[var(--text-1)]"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </Field>
  );
}

function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "danger";
  children: React.ReactNode;
}) {
  const styles =
    tone === "danger"
      ? "border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] text-[var(--danger)]"
      : "border-[var(--hairline-strong)] bg-[var(--surface-2)] text-[var(--text-2)]";
  const Icon = tone === "danger" ? AlertTriangle : Info;
  return (
    <p
      className={`flex items-start gap-2 rounded-[8px] border px-3 py-2.5 text-[12px] leading-relaxed ${styles}`}
    >
      <Icon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
