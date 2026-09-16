"use client";

import * as React from "react";
import { PageGuard } from "@/components/layout/page-guard";
import { SubNav } from "@/components/ui/sub-nav";
import { usePermissions } from "@/components/layout/authz-provider";

/**
 * The finance section: royalties owed, payouts made, and the platform's own
 * books.
 *
 * One guard for the whole section rather than one per page. `buildFinanceAccess`
 * refuses a caller holding no `payment-royalty` grant outright — it does not
 * hand back an empty list — so there is no page under here that answers
 * anything but 403 without it.
 *
 * Every tab below is reachable at every scope; what changes is how many rows
 * come back. Ledger and Adjustments are the exception — at OWN scope they are
 * empty BY CONSTRUCTION, because they are the platform's own books and there
 * is no per-artist slice of them. An empty table there would read as "no
 * activity", which is false, so those two tabs are not offered at own scope
 * at all. At organization scope they are real: a brand sees them narrowed to
 * its own orders.
 */
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageGuard
      can={(p) => p.canReadFinance()}
      what="Finance"
      requires="payment-royalty:read"
    >
      <FinanceChrome>{children}</FinanceChrome>
    </PageGuard>
  );
}

function FinanceChrome({ children }: { children: React.ReactNode }) {
  const perms = usePermissions();
  const scope = perms.financeScope();

  return (
    <div className="space-y-4">
      <SubNav
        items={[
          { href: "/finance", label: "Overview" },
          { href: "/finance/balances", label: "Balances" },
          { href: "/finance/royalties", label: "Royalties" },
          { href: "/finance/payouts", label: "Payouts" },
          { href: "/finance/rules", label: "Rules" },
          {
            href: "/finance/ledger",
            label: "Ledger",
            // Empty by construction at own scope — see the layout header.
            visible: scope !== "own",
          },
          { href: "/finance/adjustments", label: "Adjustments", visible: scope !== "own" },
        ]}
      />
      {children}
    </div>
  );
}
