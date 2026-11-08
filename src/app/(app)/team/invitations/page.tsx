"use client";

import * as React from "react";
import { MailPlus, Send } from "lucide-react";
import { useInvitations, useRoles } from "@/lib/api/hooks";
import { formatDateTime, humanize } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Mono,
  Panel,
  Tooltip,
  type BadgeTone,
} from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { InviteDialog } from "@/components/authz/invite-dialog";
import { RevokeInvitationDialog } from "@/components/authz/revoke-invitation-dialog";
import { ORGANIZATION_OPTIONS } from "@/components/authz/organizations";
import type { StaffInvitation, StaffInvitationStatus } from "@/lib/types";

const STATUSES: StaffInvitationStatus[] = [
  "PENDING",
  "SENT",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
  "FAILED",
];

/**
 * Deliberately not `toneForStatus`. That function reads a word the way the
 * order, refund and dispute vocabularies mean it, and two of them disagree
 * with this one: ACCEPTED on a dispute is a loss the platform chose not to
 * fight, here it is the whole point; PENDING elsewhere is work in progress,
 * here it is a row written before the provider was called that never reached
 * anybody (§3.4) and is as much of a problem as FAILED.
 */
const STATUS_TONE: Record<StaffInvitationStatus, BadgeTone> = {
  PENDING: "warning",
  SENT: "info",
  ACCEPTED: "positive",
  REVOKED: "neutral",
  EXPIRED: "neutral",
  FAILED: "danger",
};

/** The two states in which an invitation can still be claimed. */
function isClaimable(status: StaffInvitationStatus): boolean {
  return status === "PENDING" || status === "SENT";
}

/**
 * Time left on a claimable invitation, counting forward.
 *
 * `formatRelative` counts backwards and would render a future deadline as
 * "-2d ago", which is the wrong sentence for the only number on this screen
 * an operator acts on.
 */
function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "expired";
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

/**
 * Staff invitations.
 *
 * An invitation is a role assignment that has been decided but has not landed
 * — the account does not exist at the moment the administrator clicks the
 * button, because Clerk emails a link and the colleague sets their own
 * password (admin-provisioning.md §3.1). The role is granted on acceptance,
 * from a `users.account.provisioned` event, so this list is a genuine queue
 * rather than a log: rows sit in it, expire out of it after 72 hours, and can
 * be withdrawn from it.
 */
export default function InvitationsPage() {
  const perms = usePermissions();
  const rolesQuery = useRoles();
  const [inviting, setInviting] = React.useState(false);
  const [revoking, setRevoking] = React.useState<StaffInvitation | null>(null);

  const list = useListState<{ status?: string; email?: string; roleId?: string }>({
    status: undefined,
    email: undefined,
    roleId: undefined,
  });

  const query = useInvitations(list.params);

  // An invitation IS a deferred grant, so it takes the same capability as
  // granting one outright; withdrawing takes the delete capability instead.
  const canInvite = perms.can("employee-role-mgmt", "assign");
  const canRevoke = perms.can("employee-role-mgmt", "delete");

  usePageChrome({
    title: "Invitations",
    description:
      "Roles offered but not yet held. They expire 72 hours after they are sent.",
  });

  const columns = React.useMemo<Column<StaffInvitation>[]>(
    () => [
      {
        key: "email",
        header: "Address",
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
              {r.email}
            </p>
            <Mono className="mt-0.5 text-[10px]">{r.id.slice(0, 13)}…</Mono>
          </div>
        ),
      },
      {
        key: "role",
        header: "Role",
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-[12px] text-[var(--text-1)]">{r.roleDisplayName}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1">
              <Badge tone="neutral" className="px-1 py-0 text-[10px]">
                {humanize(r.scopeType)}
              </Badge>
              {r.organizationId ? (
                <Badge tone="info" className="px-1 py-0 text-[10px]">
                  {ORGANIZATION_OPTIONS.find((o) => o.id === r.organizationId)?.name ??
                    r.organizationId.slice(0, 10)}
                </Badge>
              ) : null}
            </p>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (r) => (
          <div className="min-w-0">
            <Badge tone={STATUS_TONE[r.status]} dot>
              {humanize(r.status)}
            </Badge>
            {/* The provider's own refusal. It is the only thing that says why
                nothing was emailed, so it is shown rather than summarised. */}
            {r.status === "FAILED" && r.providerError ? (
              <p
                className="mt-1 max-w-[280px] truncate text-[11px] text-[var(--danger)]"
                title={r.providerError}
              >
                {r.providerError}
              </p>
            ) : null}
            {r.status === "PENDING" ? (
              <p className="mt-1 max-w-[280px] text-[11px] text-[var(--text-3)]">
                Written before the email was attempted — nothing has been sent.
              </p>
            ) : null}
            {r.status === "REVOKED" && r.revokeReason ? (
              <p
                className="mt-1 max-w-[280px] truncate text-[11px] text-[var(--text-3)]"
                title={r.revokeReason}
              >
                {r.revokeReason}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "invited",
        header: "Invited",
        cell: (r) => (
          <span className="tnum text-[12px] text-[var(--text-2)]">
            {formatDateTime(r.invitedAt)}
          </span>
        ),
      },
      {
        key: "expires",
        header: "Expires",
        cell: (r) =>
          r.status === "ACCEPTED" ? (
            <span className="text-[12px] text-[var(--text-3)]">
              Accepted {formatDateTime(r.acceptedAt)}
            </span>
          ) : isClaimable(r.status) ? (
            <Tooltip content={formatDateTime(r.expiresAt)}>
              <span className="tnum cursor-help text-[12px] text-[var(--text-2)]">
                {expiresIn(r.expiresAt)}
              </span>
            </Tooltip>
          ) : (
            <span className="text-[12px] text-[var(--text-3)]">—</span>
          ),
      },
      {
        key: "actions",
        header: "",
        cell: (r) => {
          if (!canRevoke) return null;
          // An ACCEPTED invitation answers 409: the role exists by then, and
          // the thing to withdraw is the assignment, on the Members tab. The
          // rest are already terminal, so there is nothing to revoke.
          if (!isClaimable(r.status)) return null;
          return (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRevoking(r)}>
                Revoke
              </Button>
            </div>
          );
        },
      },
    ],
    [canRevoke]
  );

  const roleOptions = (rolesQuery.data ?? []).filter((r) => r.isActive);

  return (
    <>
      {canInvite ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setInviting(true)}>
            <MailPlus className="h-3.5 w-3.5" />
            Invite someone
          </Button>
        </PageActions>
      ) : null}

      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.active}>
          <SearchInput
            value={list.filters.email ?? ""}
            onChange={(v) => list.setFilter("email", v || undefined)}
            placeholder="Search by address"
            className="w-[220px]"
          />
          <FilterSelect
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={STATUSES}
          />
          <label className="flex items-center gap-1.5">
            <span className="text-[12px] text-[var(--text-3)]">Role</span>
            <select
              value={list.filters.roleId ?? ""}
              onChange={(e) => list.setFilter("roleId", e.target.value || undefined)}
              className="h-7 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[12px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
            >
              <option value="">All</option>
              {roleOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </select>
          </label>
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data?.items ?? []}
              getRowKey={(r) => r.id}
              dimmed={query.isFetching}
              emptyState={
                <EmptyState
                  icon={Send}
                  title={list.active ? "No invitations match those filters" : "No invitations"}
                  description={
                    list.active
                      ? undefined
                      : "Inviting someone here is the only way to provision a colleague who has no HitBox account yet."
                  }
                  action={
                    canInvite && !list.active ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setInviting(true)}
                      >
                        Invite someone
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
            <Pagination
              page={query.data?.page ?? 1}
              limit={query.data?.limit ?? 20}
              total={query.data?.total ?? 0}
              onPageChange={list.setPage}
              onLimitChange={list.setLimit}
            />
          </>
        )}

        {/* Scope note, not decoration: an org-scoped administrator is shown
            invitations into their own organizations and NOT global ones, so
            an empty list here does not mean nobody is being onboarded. */}
        <p className="border-t border-[var(--hairline)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--text-3)]">
          Platform-wide invitations are visible only to administrators whose own
          grants reach beyond one organization.
        </p>
      </Panel>

      {inviting ? <InviteDialog onClose={() => setInviting(false)} /> : null}
      {revoking ? (
        <RevokeInvitationDialog
          invitation={revoking}
          onClose={() => setRevoking(null)}
        />
      ) : null}
    </>
  );
}
