"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/components/layout/authz-provider";

/**
 * Says what the caller's grant scope does to the screen they are looking at.
 *
 * Several finance and payments endpoints are reachable at OWN or ORGANIZATION
 * scope but do not return what the operator would assume, and the API answers
 * with an empty list rather than a 403 — which is indistinguishable from "no
 * activity" unless something says otherwise. From api-reference.md,
 * "Endpoints an artist can reach, but that will not show what they expect":
 *
 *   • /ledger, /revenue-summary, /adjustments at OWN scope are empty BY
 *     CONSTRUCTION. They are HitBox's own books — gateway fees, chargebacks,
 *     platform margin — and there is no per-artist slice of them that would
 *     mean anything.
 *
 *   • /payments/transactions and /refunds at OWN scope filter on
 *     `order.buyerId = caller`, so they return the caller's own PURCHASES as
 *     a customer, not the sales of their drops.
 *
 *   • /royalty-rules filters by ORGANIZATION ids, so a rule scoped to an
 *     artist alone is missing from the list even though it is the rule
 *     pricing their royalties.
 *
 * Every one of those is a screen that looks broken and is not. This renders
 * the sentence that closes the gap, and renders nothing at all for a
 * global-scoped operator, for whom none of it is true.
 */
export type ScopeCaveat =
  | "platform-books"
  | "own-purchases"
  | "rules-by-organization"
  | "disputes";

const COPY: Record<
  ScopeCaveat,
  { own: string | null; organization: string | null }
> = {
  "platform-books": {
    own: "These are HitBox's own books — gateway fees, chargebacks, platform margin. Your grant is scoped to your own earnings, and there is no per-artist slice of them, so this list is empty by construction rather than because nothing happened.",
    organization: null,
  },
  "own-purchases": {
    own: "Your grant is own-scoped, so this filters on orders where you are the buyer. These are your own purchases as a customer — not the sales of your drops. Your earnings from those are under Royalties.",
    organization: null,
  },
  "rules-by-organization": {
    own: "Rule listing filters by organization, not by artist. A rule scoped to you alone is not listed here even though it is the rule pricing your royalties — open any royalty entry to see the basis and percentage that were actually applied to it.",
    organization:
      "Narrowed to rules carrying your organization's id. A rule scoped to a single artist with no organization is not listed here.",
  },
  disputes: {
    own: "Chargebacks are a platform matter between HitBox and the card network. Nothing here is scoped to an individual payee, so this list stays empty.",
    organization:
      "Chargebacks are a platform matter between HitBox and the card network, so this list returns nothing at organization scope.",
  },
};

export function ScopeNotice({
  caveat,
  className,
}: {
  caveat: ScopeCaveat;
  className?: string;
}) {
  const perms = usePermissions();
  const scope = perms.financeScope();

  if (scope === null || scope === "global") return null;
  const text = COPY[caveat][scope];
  if (!text) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5",
        className
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
      <p className="text-[12px] leading-relaxed text-[var(--text-2)]">{text}</p>
    </div>
  );
}

/**
 * The banner for an operator who holds `order:refund:global` and no
 * `payment-royalty` grant at all.
 *
 * HITBOX_ORDER_MANAGER is exactly this role. It holds the capability the four
 * refund action routes require — and every handler first calls
 * `buildPaymentAccess(principal)`, which throws 403 without a payment-royalty
 * grant, so the workflow it was designed for refuses it on every step. That
 * mismatch between the role catalog and the route guards is a known one
 * (api-reference.md, "Two rough edges" §1) and is a backend decision, not
 * something the console papers over: this says so plainly instead of
 * rendering four buttons that all answer 403.
 */
export function RefundCapabilityNotice() {
  const perms = usePermissions();

  const holdsRefund = perms.hasAction("order", "refund", "global");
  if (!holdsRefund || perms.canWorkRefunds()) return null;

  return (
    <div className="flex items-start gap-2 rounded-[8px] border border-dashed border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2.5">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[var(--text-1)]">
          You hold order:refund:global but cannot work this queue.
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-2)]">
          Every refund action additionally resolves a payment-royalty grant
          before it runs, and your role carries none — so confirm, approve,
          reject and process would each answer 403. Adding{" "}
          <span className="font-mono text-[11px]">payment-royalty:read:global</span> to
          your role in the permission catalog is the fix; it is not something
          this console can grant itself.
        </p>
      </div>
    </div>
  );
}
