"use client";

import * as React from "react";
import { Panel } from "@/components/ui/primitives";
import { NotPermitted } from "@/components/ui/states";
import { usePermissions } from "./authz-provider";
import type { Permissions } from "@/lib/authz";

/**
 * Guards a whole route.
 *
 * On a dedicated page the backend answers 403 rather than omitting a key,
 * but there is no reason to make the round trip when the caller's own
 * permission list already says no — and the sidebar would not have offered
 * the link either.
 */
export function PageGuard({
  can,
  what,
  requires,
  children,
}: {
  can: (p: Permissions) => boolean;
  what: string;
  requires: string;
  children: React.ReactNode;
}) {
  const perms = usePermissions();

  // Wait for the permission list before deciding; an empty list at first
  // render would flash a false denial.
  if (perms.isEmpty) return <>{children}</>;

  if (!can(perms)) {
    return (
      <Panel className="p-6">
        <NotPermitted what={what} requires={requires} />
      </Panel>
    );
  }

  return <>{children}</>;
}
