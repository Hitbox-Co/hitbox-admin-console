"use client";

import * as React from "react";
import { PageGuard } from "@/components/layout/page-guard";
import { SubNav } from "@/components/ui/sub-nav";
import { usePermissions } from "@/components/layout/authz-provider";

/**
 * The payments section: money arriving, going back, and being contested.
 *
 * Guarded on the same `payment-royalty:read` grant as Finance —
 * `buildPaymentAccess` refuses a caller holding none rather than returning an
 * empty list, on the grounds that "you have no payments" is a claim worth
 * only making when it is true.
 *
 * Two tabs are narrower than the section itself and are hidden rather than
 * disabled, because a greyed-out tab advertises a screen the operator cannot
 * reach:
 *
 *   Gateways — `payment-royalty:configure:global`. The narrowest capability
 *     in the catalog: changing `credentialsRef` is functionally changing the
 *     bank account the platform's money lands in. Note this gates the LIST as
 *     well as the writes, unlike everywhere else in these two modules.
 *
 *   Webhooks — `payment-royalty:manage:global`. It is a replay queue, not a
 *     read screen, which is why it takes the write capability.
 */
export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageGuard
      can={(p) => p.canOpen("/payments")}
      what="Payments"
      requires="payment-royalty:read (platform-wide)"
    >
      <PaymentsChrome>{children}</PaymentsChrome>
    </PageGuard>
  );
}

function PaymentsChrome({ children }: { children: React.ReactNode }) {
  const perms = usePermissions();
  const scope = perms.financeScope();

  return (
    <div className="space-y-4">
      <SubNav
        items={[
          { href: "/payments", label: "Transactions" },
          { href: "/payments/refunds", label: "Refunds" },
          {
            href: "/payments/disputes",
            label: "Disputes",
            // Chargebacks are a platform matter between HitBox and the card
            // network; at own or organization scope the list is empty by
            // construction, so the tab would lead nowhere.
            visible: scope === "global",
          },
          {
            href: "/payments/gateways",
            label: "Gateways",
            visible: perms.canConfigureGateways(),
          },
          {
            href: "/payments/webhooks",
            label: "Webhooks",
            visible: perms.canManageFinance(),
          },
        ]}
      />
      {children}
    </div>
  );
}
