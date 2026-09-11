"use client";

import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { RoleForm } from "@/components/authz/role-form";

export default function NewRolePage() {
  usePageChrome({
    title: "New role",
    description: "Name it, pick a domain, then choose permissions from the catalog.",
  });

  return (
    <PageGuard
      can={(p) => p.can("employee-role-mgmt", "manage")}
      what="Creating roles"
      requires="employee-role-mgmt:manage"
    >
      <RoleForm />
    </PageGuard>
  );
}
