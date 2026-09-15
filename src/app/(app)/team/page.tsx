"use client";

import * as React from "react";
import { UserCog, Users } from "lucide-react";
import { useTeam } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel, Segmented } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, SearchInput, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { AssignmentDrawer } from "@/components/authz/assignment-drawer";
import type { TeamMember } from "@/lib/types";

export default function TeamPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("employee-role-mgmt")}
      what="Team membership"
      requires="employee-role-mgmt:read"
    >
      <TeamView />
    </PageGuard>
  );
}

function TeamView() {
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<TeamMember | null>(null);
  const list = useListState<Record<string, never>>({});
  /*
   * internalOnly defaults to true server-side: HitBox staff only (roles whose
   * entityGroup is hitbox_seller_org). Turning it off includes brand and
   * artist role-holders (admin-write-apis.md §7).
   */
  const [internalOnly, setInternalOnly] = React.useState(true);
  const query = useTeam(q || undefined, list.page, list.limit, internalOnly);

  usePageChrome({
    title: "Team",
    description:
      "Anyone holding at least one live role. A person can hold several at once.",
  });

  const columns: Column<TeamMember>[] = [
    {
      key: "person",
      header: "Person",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-medium text-[var(--text-2)]"
          >
            {r.fullName
              .split(" ")
              .slice(0, 2)
              .map((p) => p[0])
              .join("")}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
              {r.fullName}
            </p>
            <p className="truncate text-[11px] text-[var(--text-3)]">
              {r.email}
              {r.handle ? ` · @${r.handle}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      cell: (r) =>
        r.roles.length === 0 ? (
          <span className="text-[12px] text-[var(--text-3)]">No roles</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {r.roles.map((role) => (
              <Badge key={role.assignmentId} tone="accent">
                {role.displayName}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "id",
      header: "User id",
      cell: (r) => <Mono className="text-[10px]">{r.userId.slice(0, 13)}…</Mono>,
    },
    {
      key: "joined",
      header: "Joined",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.joinedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>
            <UserCog className="h-3.5 w-3.5" />
            Manage roles
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Panel className="overflow-hidden">
        <FilterRow>
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              list.setPage(1);
            }}
            placeholder="Search people"
            className="w-[240px]"
          />
          <Segmented
            size="sm"
            value={internalOnly ? "internal" : "all"}
            onChange={(v) => {
              setInternalOnly(v === "internal");
              list.setPage(1);
            }}
            options={[
              { value: "internal", label: "HitBox staff" },
              { value: "all", label: "All role-holders" },
            ]}
          />
          <p className="text-[11px] text-[var(--text-3)]">
            Revoking is a soft delete — the assignment row survives for audit.
          </p>
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={5} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data?.items ?? []}
              getRowKey={(r) => r.userId}
              dimmed={query.isFetching}
              emptyState={
                <EmptyState
                  icon={Users}
                  title={q ? "Nobody matches that search" : "No admins yet"}
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
      </Panel>

      {editing ? (
        <AssignmentDrawer user={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
