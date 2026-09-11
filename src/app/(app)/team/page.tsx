"use client";

import * as React from "react";
import { UserCog, Users } from "lucide-react";
import { useTeam } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { FilterRow, SearchInput } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { AssignmentDrawer } from "@/components/authz/assignment-drawer";
import type { AdminUserRow } from "@/lib/types";

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
  const [editing, setEditing] = React.useState<AdminUserRow | null>(null);
  const query = useTeam(q || undefined);

  usePageChrome({
    title: "Team",
    description: "Who holds which roles. A person can hold several at once.",
  });

  const columns: Column<AdminUserRow>[] = [
    {
      key: "person",
      header: "Person",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-medium text-[var(--text-2)]"
          >
            {r.displayName
              .split(" ")
              .slice(0, 2)
              .map((p) => p[0])
              .join("")}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
              {r.displayName}
            </p>
            <p className="truncate text-[11px] text-[var(--text-3)]">{r.email}</p>
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
              <Badge key={role.roleId} tone="accent">
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
      key: "created",
      header: "Joined",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
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
            onChange={setQ}
            placeholder="Search people"
            className="w-[240px]"
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
        )}
      </Panel>

      {editing ? (
        <AssignmentDrawer user={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
