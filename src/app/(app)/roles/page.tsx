"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, Lock, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRoles } from "@/lib/api/hooks";
import { formatNumber, humanize } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel, Tooltip } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { FilterRow, SearchInput } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { Role } from "@/lib/types";

export default function RolesPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("employee-role-mgmt")}
      what="Roles"
      requires="employee-role-mgmt:read"
    >
      <RolesView />
    </PageGuard>
  );
}

function RolesView() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const perms = usePermissions();
  const query = useRoles();
  const canManage = perms.can("employee-role-mgmt", "manage");

  usePageChrome({
    title: "Roles",
    description: "One editor for every role — there is no per-role screen.",
  });

  const rows = React.useMemo(() => {
    const all = query.data ?? [];
    if (!q.trim()) return all;
    const needle = q.toLowerCase();
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.displayName.toLowerCase().includes(needle)
    );
  }, [query.data, q]);

  const columns: Column<Role>[] = [
    {
      key: "role",
      header: "Role",
      cell: (r) => (
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-1)]">
            {r.displayName}
            {r.isSystem ? (
              <Tooltip content="A seeded platform role. Its permissions cannot be edited and it cannot be deleted — you may deactivate it.">
                <span>
                  <Lock className="h-3 w-3 cursor-help text-[var(--text-3)]" />
                </span>
              </Tooltip>
            ) : null}
          </p>
          <Mono className="mt-0.5 text-[10px]">{r.name}</Mono>
        </div>
      ),
    },
    {
      key: "domain",
      header: "Domain",
      cell: (r) => (
        <Badge tone={r.domain === "TECHNICAL" ? "info" : "accent"}>
          {humanize(r.domain)}
        </Badge>
      ),
    },
    {
      key: "group",
      header: "Entity group",
      cell: (r) => (
        <span className="text-[12px] text-[var(--text-2)]">
          {humanize(r.entityGroup)}
        </span>
      ),
    },
    {
      key: "permissions",
      header: "Permissions",
      numeric: true,
      cell: (r) => formatNumber(r.permissions.length),
    },
    {
      key: "assignments",
      header: "Assigned to",
      numeric: true,
      cell: (r) => (
        <span className={r.assignmentCount ? undefined : "text-[var(--text-3)]"}>
          {formatNumber(r.assignmentCount ?? 0)}
        </span>
      ),
    },
    {
      key: "state",
      header: "State",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={r.isActive ? "positive" : "neutral"} dot>
            {r.isActive ? "Active" : "Inactive"}
          </Badge>
          {r.isSystem ? <Badge tone="neutral" outline>System</Badge> : null}
        </div>
      ),
    },
  ];

  return (
    <Panel className="overflow-hidden">
      {canManage ? (
        <PageActions>
          <Button variant="primary" size="sm" asChild>
            <Link href="/roles/new">
              <Plus className="h-3.5 w-3.5" />
              New role
            </Link>
          </Button>
        </PageActions>
      ) : null}

      <FilterRow>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search roles"
          className="w-[240px]"
        />
        <p className="text-[11px] text-[var(--text-3)]">
          Seeded roles are read-only by design.
        </p>
      </FilterRow>

      {query.isLoading ? (
        <TableSkeleton rows={10} cols={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.roleId}
          onRowClick={(r) => {
            router.push(`/roles/${r.roleId}`);
          }}
          emptyState={
            <EmptyState
              icon={KeyRound}
              title={q ? "No roles match that search" : "No roles defined"}
              action={
                canManage && !q ? (
                  <Button variant="primary" size="sm" asChild>
                    <Link href="/roles/new">Create the first role</Link>
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}
    </Panel>
  );
}
