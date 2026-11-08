"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuditEventTypes } from "@/lib/api/hooks";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Segmented } from "@/components/ui/primitives";
import { TableSkeleton } from "@/components/ui/states";
import { AuditTrail, TRAIL_KEYS, type TrailFilters } from "@/components/audit/audit-trail";
import { EventTypesPanel, RetentionPanel } from "@/components/audit/audit-catalog";

/**
 * Audit log — the real trail (audit-logging.md §6): GET /admin/audit/events
 * with every filter it supports, each event in full with its before/after
 * and the rest of its request, plus the event catalog and retention windows.
 *
 * Filters and the tab live in the URL, so any view can be linked to — e.g.
 * /activity?resourceType=Order&resourceId=… for one order's history.
 */
export default function ActivityPage() {
  return (
    <PageGuard can={(p) => p.canOpen("/activity")} what="The audit log" requires="audit-log:read">
      <React.Suspense fallback={<TableSkeleton rows={12} cols={4} />}>
        <ActivityView />
      </React.Suspense>
    </PageGuard>
  );
}

type Tab = "trail" | "types" | "retention";

function ActivityView() {
  usePageChrome({
    title: "Audit log",
    description: "Who did what, when, and what it changed — with the role they held at the time.",
  });

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab | null) ?? "trail";

  const filters: TrailFilters = {};
  TRAIL_KEYS.forEach((k) => {
    const v = searchParams.get(k);
    if (v) filters[k] = v;
  });

  const go = (nextTab: Tab, nextFilters: TrailFilters) => {
    const sp = new URLSearchParams();
    if (nextTab !== "trail") sp.set("tab", nextTab);
    TRAIL_KEYS.forEach((k) => {
      const v = nextFilters[k];
      if (v) sp.set(k, v);
    });
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const catalog = useAuditEventTypes(false);

  return (
    <div className="space-y-4">
      <Segmented
        value={tab}
        onChange={(t) => go(t, t === "trail" ? filters : {})}
        options={[
          { value: "trail", label: "Trail" },
          { value: "types", label: "What gets recorded" },
          { value: "retention", label: "Retention" },
        ]}
      />
      {tab === "types" ? (
        <EventTypesPanel onPick={(eventType) => go("trail", { eventType })} />
      ) : tab === "retention" ? (
        <RetentionPanel />
      ) : (
        <AuditTrail filters={filters} setFilters={(f) => go("trail", f)} catalog={catalog.data ?? []} />
      )}
    </div>
  );
}
