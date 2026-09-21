"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Info,
  Package,
  Palette,
  Wallet,
} from "lucide-react";
import {
  useProducts,
  useReleases,
  useRoyaltyBalances,
} from "@/lib/api/hooks";
import { formatCurrency, formatDate, formatNumber, humanize } from "@/lib/format";
import { humanizeRoleName } from "@/lib/authz";
import { usePageChrome } from "@/components/layout/app-shell";
import { useAuthz, usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import {
  Badge,
  Mono,
  Panel,
  PanelHeader,
  Skeleton,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";

/**
 * My workspace — the creator's side of the console.
 *
 * Every other screen is shaped like the platform: every drop, every order,
 * every payee, filtered down to what your grant reaches. That is the right
 * shape for HitBox staff and the wrong one for a creator, who has one
 * question — *what is mine, and what is waiting on me?* — and currently has
 * to answer it by opening four platform screens and reading the narrow slice
 * each one returns.
 *
 * Nothing here is a new endpoint. It is the three lists an `ARTIST` or
 * `BRAND_ADMIN` grant already reaches, each asked for its first page only,
 * with the full screen one click away.
 *
 * Who sees it is derived from scope, never from a role name: a
 * `brand-artist-record` grant at `own` or `organization` is exactly the
 * brand/artist entity group (`ARTIST`, `BRAND_ADMIN`). A global holder — HitBox
 * staff — is deliberately excluded, because "mine" is not a meaningful filter
 * for someone whose grant reaches everything.
 */
export default function ArtistWorkspacePage() {
  return (
    <PageGuard
      can={(p) => {
        const scope = p.widestScope("brand-artist-record");
        return scope === "own" || scope === "organization";
      }}
      what="The creator workspace"
      requires="brand-artist-record:read:own"
    >
      <WorkspaceView />
    </PageGuard>
  );
}

function WorkspaceView() {
  const perms = usePermissions();
  const { me } = useAuthz();

  usePageChrome({
    title: "My workspace",
    description: "Your drops, the decisions waiting on you, and what you have earned.",
  });

  // Own-scoped reads on the platform lists. The server does the narrowing —
  // these are the same endpoints the full screens use, asked for page one.
  const drops = useProducts({ page: 1, limit: 5 });
  const canDecide = perms.canRead("release-approval");
  const approvals = useReleases({ status: "PENDING", latestOnly: true, page: 1, limit: 5 });
  const canSeeMoney = perms.canReadFinance();
  const balances = useRoyaltyBalances();

  return (
    <div className="space-y-4">
      <GrantPanel roles={me?.roles ?? []} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DropsPanel query={drops} />
        {canDecide ? <ApprovalsPanel query={approvals} /> : null}
      </div>

      {canSeeMoney ? <EarningsPanel query={balances} /> : null}

      <NotWiredPanel canUpdateProfile={perms.can("brand-artist-record", "update")} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Who you are here                                                    */
/* ------------------------------------------------------------------ */

/**
 * The grant itself, stated plainly.
 *
 * Every list below is narrowed server-side by this, and when one comes back
 * empty the first useful question is "narrowed to what?". Showing the role and
 * the organization it is scoped to answers it without a round trip — and it is
 * the fastest way to confirm a freshly-assigned role actually took.
 */
function GrantPanel({
  roles,
}: {
  roles: { roleId: string; roleName: string; organizationId: string | null }[];
}) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Your access" />
      {roles.length === 0 ? (
        <div className="px-3 py-3">
          <p className="text-[12.5px] text-[var(--text-3)]">
            No role assignment is attached to this account yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {roles.map((r) => (
            <li
              key={`${r.roleId}:${r.organizationId ?? "global"}`}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5"
            >
              <Palette className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
              <span className="text-[12.5px] font-medium text-[var(--text-1)]">
                {humanizeRoleName(r.roleName)}
              </span>
              {r.organizationId ? (
                <Tooltip content="Everything on this screen is narrowed to this organization.">
                  <span className="flex items-center gap-1.5">
                    <Badge tone="neutral">Organization</Badge>
                    <Mono className="text-[10px]">{r.organizationId}</Mono>
                  </span>
                </Tooltip>
              ) : (
                <Tooltip content="A grant with no organization behind it is scoped to you personally.">
                  <span>
                    <Badge tone="neutral">Own</Badge>
                  </span>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Your drops                                                          */
/* ------------------------------------------------------------------ */

function DropsPanel({ query }: { query: ReturnType<typeof useProducts> }) {
  const rows = query.data?.items ?? [];

  return (
    <Panel className="flex flex-col overflow-hidden">
      <PanelHeader
        title="Your drops"
        action={
          query.data ? (
            <span className="tnum text-[11px] text-[var(--text-3)]">
              {formatNumber(query.data.total)} total
            </span>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <PanelSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No drops yet"
          description="Drops created under your organization appear here."
        />
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-[var(--text-1)]">
                  {r.name}
                </p>
                <Mono className="mt-0.5 text-[10px]">{r.groupCode}</Mono>
              </div>
              <Badge tone={toneForStatus(r.status)} dot>
                {humanize(r.status)}
              </Badge>
              <span className="tnum shrink-0 text-[11.5px] text-[var(--text-3)]">
                {formatNumber(r.totalSupply)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <MoreLink href="/products" label="Open all drops" />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Waiting on you                                                      */
/* ------------------------------------------------------------------ */

/**
 * The queue an artist can actually act on.
 *
 * `release-approval:approve` and `:reject` are what separate this role from a
 * Brand Employee, and a pending review is the one thing on this screen that is
 * blocked on the person reading it — so it says how long it has been waiting
 * rather than just that it exists.
 */
function ApprovalsPanel({ query }: { query: ReturnType<typeof useReleases> }) {
  const rows = query.data?.items ?? [];

  return (
    <Panel className="flex flex-col overflow-hidden">
      <PanelHeader
        title="Waiting on you"
        action={
          query.data ? (
            <span className="tnum text-[11px] text-[var(--text-3)]">
              {formatNumber(query.data.total)} pending
            </span>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <PanelSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="Nothing to review"
          description="Submitted drops needing an approve or reject decision land here."
        />
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-[var(--text-1)]">
                  {r.product.name}
                </p>
                <p className="mt-0.5 text-[10.5px] text-[var(--text-3)]">
                  Version {r.version} · submitted {formatDate(r.createdAt)}
                </p>
              </div>
              {r.product.isAgeSpecific && !r.product.minimumAge ? (
                // RELEASES_COMPLIANCE_INCOMPLETE — approving this is refused
                // until the drop carries a minimum age, so say it before the
                // decision rather than as its rejection.
                <Tooltip content="Age-restricted with no minimum age. Approval is refused until the drop carries one.">
                  <span>
                    <Badge tone="warning">Blocked</Badge>
                  </span>
                </Tooltip>
              ) : (
                <Badge tone={toneForStatus(r.complianceStatus)}>
                  {humanize(r.complianceStatus)}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      <MoreLink href="/release-approvals" label="Open the review queue" />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Your earnings                                                       */
/* ------------------------------------------------------------------ */

/**
 * Balances, not the ledger.
 *
 * `/finance/balances` is the one money endpoint that means something at OWN
 * scope: it is grouped per payee, so an artist's own row is a real answer. The
 * ledger, revenue summary and adjustments are HitBox's own books and come back
 * empty by construction — which is why they are not previewed here.
 *
 * One row PER CURRENCY, never summed: there is no exchange rate anywhere in
 * this system, and adding two of these together would invent one.
 */
function EarningsPanel({ query }: { query: ReturnType<typeof useRoyaltyBalances> }) {
  const rows = query.data ?? [];

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Your earnings" />

      {query.isLoading ? (
        <PanelSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nothing accrued yet"
          description="A royalty is posted when an order against your work is paid."
        />
      ) : (
        <ul className="divide-y divide-[var(--hairline)]">
          {rows.map((b) => (
            <li
              key={`${b.payeeId ?? "self"}:${b.currency}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-[var(--text-1)]">
                  {b.payeeName ?? "You"}
                </p>
                <p className="mt-0.5 text-[10.5px] text-[var(--text-3)]">
                  {formatNumber(b.entryCount)} entries · {b.currency}
                </p>
              </div>

              <Figure label="Outstanding" value={formatCurrency(b.outstanding, b.currency)} />
              <Figure label="Paid" value={formatCurrency(b.paid, b.currency)} />

              <Tooltip
                content={
                  b.thresholdMet
                    ? "Above the payout threshold on your own rule — this is eligible for the next payout run."
                    : `Below the ${formatCurrency(b.threshold, b.currency)} threshold set by your rule, so it is not swept yet.`
                }
              >
                <span>
                  <Badge tone={b.thresholdMet ? "positive" : "neutral"} dot>
                    {b.thresholdMet ? "Payable" : "Below threshold"}
                  </Badge>
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}

      <MoreLink href="/finance/balances" label="Open finance" />
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="shrink-0">
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">{label}</p>
      <p className="tnum text-[12.5px] font-medium text-[var(--text-1)]">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* What this screen deliberately does not have                         */
/* ------------------------------------------------------------------ */

/**
 * Two of an artist's own permissions have no endpoint behind them.
 *
 * `brand-artist-record:update:own` would edit the artist profile, and
 * `notification-config:update:own` the delivery preferences — but
 * `packages/artist` mounts no router ("no router yet", its module says), and
 * `@hitbox/notifications` and `@hitbox/organizations` are schema-only: no
 * repository, no service, no controller.
 *
 * A form with nothing behind it is worse than no form, so this says which
 * capability is idle and why, the same way the console handles the missing
 * publish-drop transition.
 */
function NotWiredPanel({ canUpdateProfile }: { canUpdateProfile: boolean }) {
  return (
    <Panel className="px-3 py-3">
      <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
        <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {canUpdateProfile ? (
            <>
              Your role also carries <Mono className="text-[10px]">brand-artist-record:update</Mono>{" "}
              and <Mono className="text-[10px]">notification-config:update</Mono>, so a
              profile editor and notification preferences belong here.{" "}
            </>
          ) : (
            <>Profile editing and notification preferences belong on this screen. </>
          )}
          Neither is built: the artist module mounts no router, and the
          notifications and organizations modules are schema-only — no service, no
          controller, nothing to call. They arrive here when those endpoints do.
        </span>
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="pressable mt-auto flex items-center justify-between gap-2 border-t border-[var(--hairline)] px-3 py-2 text-[12px] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-[8px]" />
      ))}
    </div>
  );
}
