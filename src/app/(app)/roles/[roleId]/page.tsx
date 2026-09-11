"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useRole } from "@/lib/api/hooks";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel, Skeleton } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { RoleForm } from "@/components/authz/role-form";

export default function EditRolePage() {
  return (
    <PageGuard
      can={(p) => p.canRead("employee-role-mgmt")}
      what="Role detail"
      requires="employee-role-mgmt:read"
    >
      <EditRoleView />
    </PageGuard>
  );
}

function EditRoleView() {
  const params = useParams<{ roleId: string }>();
  const query = useRole(params.roleId);

  usePageChrome({
    title: query.data?.displayName ?? "Role",
    description: query.data
      ? query.data.isSystem
        ? "A seeded platform role — permissions are fixed."
        : "Edit this role's permissions and state."
      : undefined,
  });

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Panel>
        <Panel className="space-y-2 p-4 lg:col-span-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Panel>
      </div>
    );
  }

  if (query.isError) {
    return (
      <Panel>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Panel>
    );
  }

  if (!query.data) return null;

  return <RoleForm role={query.data} />;
}
