"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, PackagePlus, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { formatNumber } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import { Button } from "@/components/ui/primitives";
import { lineLabel } from "@/components/supply/consignment-lifecycle";
import type {
  ManifestIncompleteLine,
  SupplyAcceptStock,
  SupplyBatch,
} from "@/lib/types";

/**
 * Why an ACCEPT was refused, and what to do about it (vendor-onboarding-flow
 * Step 9). Every refusal leaves everything unchanged — no units, chips still
 * unbound, the consignment still VALIDATED — so retrying is always safe.
 *
 * SUPPLY_ALLOTMENT_INSUFFICIENT is not here: it has its own increase-then-
 * retry banner (AllotmentCoverageBanner).
 */
export function AcceptRefusal({
  error,
  batch,
  pending,
  onRetry,
  onReload,
  onOpenChips,
}: {
  error: ApiError;
  batch: SupplyBatch;
  pending: boolean;
  onRetry: () => void;
  onReload: () => void;
  onOpenChips: () => void;
}) {
  const perms = usePermissions();
  const d = (error.details ?? {}) as Record<string, unknown>;
  const dropHref =
    batch.dropId && perms.canOpen("/products/detail") ? `/products/${batch.dropId}` : null;

  let title: string;
  let body: React.ReactNode = null;
  let action: React.ReactNode = null;

  switch (error.code) {
    case "SUPPLY_MANIFEST_INCOMPLETE": {
      const lines = (Array.isArray(d.lines) ? d.lines : []) as ManifestIncompleteLine[];
      title = "Not every unit has a chip yet";
      body =
        lines.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {lines
              .filter((l) => l.shortfall > 0)
              .map((l, i) => (
                <li key={i}>
                  <span className="font-medium">{variantFor(batch, l)}</span>:{" "}
                  {formatNumber(l.registered)} of {formatNumber(l.quantity)} chipped —{" "}
                  {formatNumber(l.shortfall)} missing
                </li>
              ))}
          </ul>
        ) : (
          <p>Every declared unit needs a registered chip before accepting.</p>
        );
      action = (
        <Button variant="secondary" size="sm" onClick={onOpenChips}>
          Open chip upload
        </Button>
      );
      break;
    }
    case "SKUS_NOT_APPROVED": {
      title = "Drop not approved for release yet";
      const approvalId = typeof d.approvalId === "string" ? d.approvalId : null;
      body = (
        <p>
          {typeof d.version === "number"
            ? `Review v${d.version} is ${String(d.status ?? "not approved").toLowerCase()}. `
            : ""}
          Units can&rsquo;t be minted into a drop the owner hasn&rsquo;t approved. Accept
          again once it is.
        </p>
      );
      action =
        approvalId && perms.canOpen("/release-approvals") ? (
          <GoLink href={`/release-approvals/${approvalId}`}>Open the release approval</GoLink>
        ) : null;
      break;
    }
    case "PRODUCTS_VARIANT_SUPPLY_EXCEEDED":
    case "SKUS_VARIANT_SUPPLY_EXCEEDED": {
      const name = variantFor(batch, {
        variantId: typeof d.variantId === "string" ? d.variantId : undefined,
        variantCode: typeof d.variantCode === "string" ? d.variantCode : null,
      });
      title = `Variant ${name} cap reached`;
      body = (
        <p>
          {typeof d.variantTotalSupply === "number"
            ? `Its supply is capped at ${formatNumber(d.variantTotalSupply)}`
            : "Its own supply cap is full"}
          {typeof d.minted === "number" ? `, ${formatNumber(d.minted)} already minted` : ""}
          {typeof d.requested === "number"
            ? `, and this consignment would add ${formatNumber(d.requested)}`
            : ""}
          . Raise the variant&rsquo;s supply on the drop, or reject.
        </p>
      );
      action = dropHref ? <GoLink href={dropHref}>Edit the variant&rsquo;s supply</GoLink> : null;
      break;
    }
    case "PRODUCTS_VARIANT_INACTIVE":
      title = "A variant was archived or deactivated since booking";
      body = <p>Units can&rsquo;t be minted for it. Reactivate the variant on the drop, or reject.</p>;
      action = dropHref ? <GoLink href={dropHref}>Open the drop</GoLink> : null;
      break;
    case "PRODUCTS_VARIANTS_REQUIRED":
      title = "This drop needs variants";
      body = (
        <p>
          The drop&rsquo;s type mints every unit against a variant, but this
          consignment has no variant lines. Reject it and have it rebooked per
          variant.
        </p>
      );
      break;
    case "SKUS_SUPPLY_EXCEEDED":
      title = "The drop's total supply is full";
      body = <p>Accepting would mint past the drop&rsquo;s totalSupply. Raise it, then accept again.</p>;
      action =
        batch.dropId && perms.canOpen("/products/new") ? (
          <GoLink href={`/products/${batch.dropId}/edit`}>Edit the drop</GoLink>
        ) : null;
      break;
    case "SUPPLY_BATCH_STATE_INVALID":
      title = "Someone else decided this consignment meanwhile";
      body = <p>Reload to see its current state. Nothing was minted twice.</p>;
      action = (
        <Button variant="secondary" size="sm" onClick={onReload}>
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </Button>
      );
      break;
    case "SUPPLY_ACCEPT_CONFLICT":
      title = "The drop was busy";
      body = <p>Another change to this drop was in progress. Nothing changed.</p>;
      action = (
        <Button variant="secondary" size="sm" loading={pending} onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      );
      break;
    default:
      title = "Could not accept";
      body = <p>{error.friendly}</p>;
  }

  return (
    <div
      role="alert"
      className="rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {title}
      </p>
      <div className="mt-1 text-[11.5px] text-[var(--text-2)]">{body}</div>
      <p className="mt-1 text-[11px] text-[var(--text-3)]">
        A refused accept changes nothing, so trying again is always safe.
      </p>
      {action ? <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** "N units added to the drop", with serial ranges per variant. */
export function AcceptedStock({ stock, batch }: { stock: SupplyAcceptStock; batch: SupplyBatch }) {
  const perms = usePermissions();
  const failed = batch.rowsRejected;
  return (
    <div className="rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--positive-dim)] px-3 py-2.5 text-[12px] leading-relaxed">
      <p className="flex items-center gap-2 font-medium text-[var(--text-1)]">
        <PackagePlus className="h-3.5 w-3.5 shrink-0 text-[var(--positive)]" aria-hidden />
        {formatNumber(stock.minted)} unit{stock.minted === 1 ? "" : "s"} added to the drop
      </p>
      {stock.units.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-[11.5px] text-[var(--text-2)]">
          {stock.units.map((u, i) => (
            <li key={`${u.variantId}-${i}`}>
              {u.variantId ? (
                <span className="font-medium">{variantFor(batch, { variantId: u.variantId })}: </span>
              ) : null}
              {formatNumber(u.count)} unit{u.count === 1 ? "" : "s"}, #{u.firstSerial}
              {u.lastSerial !== u.firstSerial ? `–#${u.lastSerial}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-[11px] text-[var(--text-3)]">
        Each unit is bound to its chip.
        {failed > 0
          ? ` ${formatNumber(failed)} chip${failed === 1 ? "" : "s"} that failed QC ${failed === 1 ? "was" : "were"} not minted.`
          : ""}
      </p>
      {batch.dropId && perms.canOpen("/products/detail") ? (
        <div className="mt-2">
          <GoLink href={`/products/${batch.dropId}`}>View the drop&rsquo;s units</GoLink>
        </div>
      ) : null}
    </div>
  );
}

function variantFor(
  batch: SupplyBatch,
  ref: { variantId?: string; variantCode?: string | null }
): string {
  const line = (batch.lines ?? []).find(
    (l) => (ref.variantId && l.variantId === ref.variantId) || (ref.variantCode && l.variantCode === ref.variantCode)
  );
  if (line) return lineLabel(line);
  return ref.variantCode ?? (ref.variantId ? `variant ${ref.variantId.slice(0, 8)}` : "variant");
}

function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="secondary" size="sm" asChild>
      <Link href={href}>
        {children}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </Button>
  );
}
