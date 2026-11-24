"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { DashboardResponse } from "@/lib/types";

/**
 * Removes the console's one unavoidable request waterfall.
 *
 * `AuthzGate` renders nothing until `/authz/me` answers — the navigation is
 * derived from it, and flashing a menu the operator is not entitled to would
 * be worse than a brief wait. But that means the page underneath does not
 * mount, so its own query does not start until authz has already returned:
 *
 *     /authz/me ─────────▶
 *                         /admin/dashboard ─────────▶     (serial)
 *
 * This component sits ABOVE the gate, so it is mounted while authz is still
 * in flight and the two go out together:
 *
 *     /authz/me ─────────▶
 *     /admin/dashboard ─────────▶                          (parallel)
 *
 * It fires only for the dashboard, and only with the exact filters the page
 * itself uses on first render (`{ period: "month" }`). A prefetch whose key
 * does not match the page's is a wasted request that also fails to help, so
 * this deliberately mirrors one call site rather than guessing at several.
 *
 * If the caller turns out to lack the permission the request 403s, which
 * TanStack caches as an error the page then re-renders from — the same
 * outcome as if the page had asked, just sooner. The dashboard is visible to
 * every role anyway; the payload itself is what gets filtered.
 */
export function BootstrapPrefetch() {
  const qc = useQueryClient();
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";

  React.useEffect(() => {
    if (!isDashboard) return;
    const filters = { period: "month" as const };
    void qc.prefetchQuery({
      queryKey: ["dashboard", filters],
      queryFn: () => api.get<DashboardResponse>("admin/dashboard", { ...filters }),
      staleTime: 30_000,
      retry: false,
    });
  }, [qc, isDashboard]);

  return null;
}
