"use client";

import * as React from "react";
import { PageGuard } from "@/components/layout/page-guard";
import { SubNav } from "@/components/ui/sub-nav";

/**
 * The team section: who holds a role now, and who has been offered one.
 *
 * Both tabs read from `employee-role-mgmt:read`, so one guard covers the
 * section. They are two halves of the same question — the invitation list is
 * the part of the admin population that has been decided but has not landed
 * yet, and leaving it off the screen is how an operator ends up re-inviting
 * somebody who already has a link in their inbox.
 */
export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageGuard
      can={(p) => p.canRead("employee-role-mgmt")}
      what="Team membership"
      requires="employee-role-mgmt:read"
    >
      <div className="space-y-4">
        <SubNav
          items={[
            { href: "/team", label: "Members" },
            { href: "/team/invitations", label: "Invitations" },
          ]}
        />
        {children}
      </div>
    </PageGuard>
  );
}
