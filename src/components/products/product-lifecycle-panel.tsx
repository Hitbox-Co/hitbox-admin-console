"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, Lock, Rocket, Send } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useLatestRelease,
  useProductPrices,
  usePublishProduct,
  useSubmitRelease,
} from "@/lib/api/hooks";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Input,
  Panel,
  Segmented,
  toneForStatus,
} from "@/components/ui/primitives";
import type { AdminProductDetail, PublishTarget } from "@/lib/types";

/**
 * Where a drop is in its lifecycle, and the one next step this caller may
 * take (drop-approval-lifecycle.md §4, §10, §11).
 *
 *   DRAFT ──submit──▶ SUBMITTED ──owner decides──▶ APPROVED ──mint──▶ ──publish──▶ PUBLISHED | ACTIVE
 *     └─ no artist AND no org: submit auto-passes straight to APPROVED
 *
 * Each transition is owned by the route that can check its preconditions:
 *   submit   POST /admin/releases                 drop:manage (any scope)
 *   decide   POST /admin/releases/:id/decision    on the review screen
 *   publish  POST /admin/products/:id/publish     drop:manage:global
 *
 * Deciding is NOT offered here. Who may approve turns on the review's frozen
 * authority, and the review screen carries the server's canApprove / canReject
 * and the versioned legal statement the approver must tick.
 */

const STEPS = ["DRAFT", "SUBMITTED", "APPROVED", "LIVE"] as const;

/** A review may be opened from these — a rejected drop resubmits as version N+1. */
const SUBMITTABLE = new Set(["DRAFT", "REJECTED"]);
/** Publish runs APPROVED → target; a staged PUBLISHED drop can still go ACTIVE. */
const PUBLISHABLE = new Set(["APPROVED", "PUBLISHED"]);

function stepOf(status: string): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "SUBMITTED":
    case "IN_REVIEW":
    case "REJECTED":
      return 1;
    case "APPROVED":
      return 2;
    case "PUBLISHED":
    case "ACTIVE":
    case "ENDED":
      return 3;
    default:
      return -1;
  }
}

export function ProductLifecyclePanel({ product }: { product: AdminProductDetail }) {
  const perms = usePermissions();
  const archived = !!product.archivedAt || product.status === "ARCHIVED";

  const canReadReviews = perms.canRead("release-approval");
  const canSubmit = perms.canSubmitRelease() && SUBMITTABLE.has(product.status) && !archived;
  const canPublish = perms.canManageCatalog() && PUBLISHABLE.has(product.status) && !archived;

  const latestQuery = useLatestRelease(product.id, canReadReviews);
  const latest = canReadReviews ? latestQuery.data : undefined;

  const current = stepOf(product.status);
  const needsMint =
    product.status === "APPROVED" &&
    product.totalSupply > 0 &&
    product.performance.skuTotal === 0 &&
    !archived;

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
          Release lifecycle
        </p>
        <Badge tone={toneForStatus(product.status)} dot>
          {humanize(product.status)}
        </Badge>
      </div>

      <ol className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
        {STEPS.map((s, i) => {
          const done = current > i;
          const here = current === i;
          const rejected = here && product.status === "REJECTED";
          return (
            <li key={s} className="flex items-center gap-1.5">
              <span
                className={[
                  "inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium",
                  rejected
                    ? "bg-[var(--danger-dim)] text-[var(--danger)]"
                    : here
                      ? "bg-[var(--accent)] text-white"
                      : done
                        ? "bg-[var(--positive-dim)] text-[var(--positive)]"
                        : "bg-[var(--surface-3)] text-[var(--text-3)]",
                ].join(" ")}
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : null}
                {rejected ? "Rejected" : s === "LIVE" ? "Published / Active" : humanize(s)}
              </span>
              {i < STEPS.length - 1 ? (
                <ArrowRight className="h-3 w-3 text-[var(--text-3)]" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>

      {canReadReviews && latest ? (
        <div className="space-y-1.5 border-t border-[var(--hairline)] px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-2)]">
              Latest review v{latest.version}
              <Badge tone={toneForStatus(latest.status)} dot>
                {humanize(latest.status)}
              </Badge>
              <span className="text-[11px] text-[var(--text-3)]">
                {latest.authority === "NONE"
                  ? "Auto-passed — no owner to ask"
                  : latest.authority === "ORGANIZATION"
                    ? `Decided by ${latest.requiredOrganizationName ?? "the brand"}`
                    : latest.authority === "ARTIST"
                      ? `Decided by ${latest.requiredArtistName ?? "the artist"}`
                      : "Decided by HitBox staff"}
              </span>
            </span>
            <Link
              href={`/release-approvals/${latest.id}`}
              className="text-[11.5px] font-medium text-[var(--accent)] hover:underline"
            >
              Open review
            </Link>
          </div>
          {latest.status === "REJECTED" && latest.comment ? (
            <p className="text-[11.5px] leading-relaxed text-[var(--text-2)]">
              <span className="text-[var(--text-3)]">Why: </span>
              {latest.comment}
            </p>
          ) : null}
          {latest.status === "PENDING" ? (
            <p className="text-[11px] text-[var(--text-3)]">
              Waiting on the owner&rsquo;s decision. An administrator can reject it, but
              cannot approve it on the owner&rsquo;s behalf.
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        Minting waits for the owner's approval (§10), and publishing a drop
        that declares supply needs a minted unit (§11) — so between the two
        there is a step this panel names rather than leaving it to a refusal.
      */}
      {needsMint ? (
        <p className="flex items-start gap-1.5 border-t border-[var(--hairline)] bg-[var(--warning-dim)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--text-2)]">
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
          Approved — mint the edition from Serialized units next. It declares{" "}
          {formatNumber(product.totalSupply)} units and none exist, so publishing
          would be refused.
        </p>
      ) : null}

      {canSubmit ? <SubmitAction product={product} /> : null}
      {canPublish ? <PublishAction product={product} /> : null}

      {!canSubmit && !canPublish ? (
        <NextStepNote product={product} archived={archived} />
      ) : null}
    </Panel>
  );
}

function SubmitAction({ product }: { product: AdminProductDetail }) {
  const submit = useSubmitRelease();
  const [comment, setComment] = React.useState("");
  const unowned = !product.artistId && !product.organizationId;
  // A REQUIRED type cannot be submitted without an active variant — checked
  // before the auto-pass too (drop-types-and-variants.md §8). The owner
  // approves the drop together with its variants.
  const needsVariants =
    product.dropType?.variantMode === "REQUIRED" &&
    !(product.variants ?? []).some((v) => v.isActive !== false);

  const go = () =>
    submit.mutate(
      { productId: product.id, comment: comment.trim() || undefined },
      {
        onSuccess: (review) => {
          setComment("");
          // Same response shape either way — the auto-pass is told apart by
          // authority NONE + APPROVED.
          if (review.authority === "NONE" && review.status === "APPROVED") {
            toast.success("Auto-approved — no owner to ask. Filed under HitBox.");
          } else {
            toast.success(`Submitted as v${review.version} — waiting on the owner's decision`);
          }
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.friendly : "Could not submit for review."),
      }
    );

  return (
    <div className="space-y-2 border-t border-[var(--hairline)] px-3 py-3">
      <Field label="Note for the reviewer" htmlFor="submit-comment" hint="Optional.">
        <Input
          id="submit-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ready for review."
        />
      </Field>
      {needsVariants ? (
        <Warn>
          A {product.dropType?.name ?? "drop"} needs at least one active variant before it can
          be submitted. Add them from the Variants panel — the owner approves the drop together
          with its variants.
        </Warn>
      ) : null}
      {product.isAgeSpecific && !product.minimumAge ? (
        <Warn>
          Age-restricted with no minimum age: the owner will be refused when they try to
          approve. Set one via Edit first.
        </Warn>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          loading={submit.isPending}
          disabled={needsVariants}
          onClick={go}
        >
          <Send className="h-3.5 w-3.5" />
          {product.status === "REJECTED" ? "Resubmit for review" : "Submit for review"}
        </Button>
        <span className="text-[11px] text-[var(--text-3)]">
          {unowned
            ? "No artist and no brand — this auto-passes and is filed under HitBox."
            : product.status === "REJECTED"
              ? "Opens a new version; the rejection stays on the record."
              : "Asks its owner to decide. Units can be minted once they approve."}
        </span>
      </div>
    </div>
  );
}

function PublishAction({ product }: { product: AdminProductDetail }) {
  const publish = usePublishProduct(product.id);
  const pricesQuery = useProductPrices(product.id);
  // A staged drop can only move on to ACTIVE; re-publishing to its own
  // status is PRODUCTS_NOT_PUBLISHABLE.
  const staged = product.status === "PUBLISHED";
  const [target, setTarget] = React.useState<PublishTarget>("ACTIVE");
  const [note, setNote] = React.useState("");

  /*
   * The server's checks, in its order, as far as this screen can see them.
   * Shown as warnings, not as a disabled button: the server re-reads the
   * latest review itself, and this data may be a few seconds old.
   */
  const blockers: string[] = [];
  if (product.isAgeSpecific && !product.minimumAge) {
    blockers.push("Age-restricted with no minimum age.");
  }
  if (pricesQuery.data && !pricesQuery.data.some((p) => p.status === "ACTIVE")) {
    blockers.push("No active price in any market.");
  }
  if (product.totalSupply > 0 && product.performance.skuTotal === 0) {
    blockers.push("Supply is declared but no unit is minted — it would be purchasable with nothing to deliver.");
  }

  const go = () =>
    publish.mutate(
      { target: staged ? "ACTIVE" : target, note: note.trim() || undefined },
      {
        onSuccess: (res) => {
          setNote("");
          const review = res.clearedReview;
          toast.success(
            `${res.product.status === "ACTIVE" ? "Live on the storefront" : "Published (staged)"}${
              review.version ? ` — cleared by review v${review.version}` : ""
            }`
          );
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "PRODUCTS_PUBLISH_BLOCKED") {
            // details.field names exactly what is missing.
            const field = (err.details as { field?: string } | null)?.field;
            const what: Record<string, string> = {
              minimumAge: "It is age-restricted with no minimum age — set one via Edit details.",
              prices: "It has no active price in any market — add one under Pricing.",
              skus: "It declares supply but has no minted units — add SKUs first.",
            };
            toast.error(field && what[field] ? `Cannot publish yet. ${what[field]}` : err.friendly);
            return;
          }
          if (err instanceof ApiError && err.code === "PRODUCTS_NOT_APPROVED") {
            const d = (err.details ?? {}) as { version?: number; status?: string };
            toast.error(
              d.version
                ? `Review v${d.version} is ${humanize(d.status ?? "not approved").toLowerCase()} — only an approved latest review can go live.`
                : err.friendly
            );
            return;
          }
          toast.error(err instanceof ApiError ? err.friendly : "Could not publish the drop.");
        },
      }
    );

  return (
    <div className="space-y-2 border-t border-[var(--hairline)] px-3 py-3">
      {staged ? (
        <p className="text-[11.5px] text-[var(--text-3)]">
          Staged — orders accept it, the storefront does not list it. Take it live to show
          it publicly.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<PublishTarget>
            size="sm"
            value={target}
            onChange={setTarget}
            options={[
              { value: "ACTIVE", label: "Active — storefront" },
              { value: "PUBLISHED", label: "Published — staged" },
            ]}
          />
        </div>
      )}
      <Field label="Note" htmlFor="publish-note" hint="Optional. Recorded on the audit entry, not on the drop.">
        <Input
          id="publish-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Launch window confirmed."
        />
      </Field>
      {blockers.length ? (
        <Warn>
          Publishing will be refused:
          <ul className="mt-1 list-disc pl-4">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Warn>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" loading={publish.isPending} onClick={go}>
          <Rocket className="h-3.5 w-3.5" />
          {staged || target === "ACTIVE" ? "Publish to storefront" : "Publish (staged)"}
        </Button>
        {product.publishedAt ? (
          <span className="text-[11px] text-[var(--text-3)]">
            First published {formatDateTime(product.publishedAt)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Why no action is offered — the lifecycle says who moves next. */
function NextStepNote({
  product,
  archived,
}: {
  product: AdminProductDetail;
  archived: boolean;
}) {
  let text: string | null = null;
  if (archived) text = "Archived — no further transitions.";
  else if (product.status === "SUBMITTED" || product.status === "IN_REVIEW")
    text = "Waiting on the owner's decision, on the review screen.";
  else if (product.status === "APPROVED")
    text = "Approved. Publishing needs drop:manage:global.";
  else if (product.status === "ACTIVE")
    text = "Live. There is no un-publish — archiving is the way out.";
  else if (product.status === "ENDED") text = "Ended — it cannot be published again.";
  else if (SUBMITTABLE.has(product.status))
    text = "Submitting for review needs drop:manage.";
  if (!text) return null;
  return (
    <p className="flex items-start gap-1.5 border-t border-[var(--hairline)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--text-3)]">
      <Lock className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-2)]">
      <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
