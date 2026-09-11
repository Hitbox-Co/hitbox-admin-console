"use client";

import * as React from "react";
import { useActivity } from "@/lib/api/hooks";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { ErrorState, TableSkeleton } from "@/components/ui/states";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

export default function ActivityPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("audit-log")}
      what="The audit log"
      requires="audit-log:read"
    >
      <ActivityView />
    </PageGuard>
  );
}

function ActivityView() {
  const list = useListState<{ severity?: string }>({ severity: undefined });
  const query = useActivity(list.params);

  usePageChrome({
    title: "Audit log",
    description: "Who did what, with the role they held at the time.",
  });

  return (
    <Panel className="overflow-hidden">
      <FilterRow onReset={list.reset} active={list.active}>
        <FilterSelect
          label="Severity"
          value={list.filters.severity}
          onChange={(v) => list.setFilter("severity", v)}
          options={["INFO", "WARNING", "CRITICAL"]}
          allLabel="All severities"
        />
      </FilterRow>

      {query.isLoading ? (
        <TableSkeleton rows={12} cols={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <div className={query.isFetching ? "opacity-55 transition-opacity" : ""}>
            <ActivityFeed events={query.data?.items ?? []} />
          </div>
          <Pagination
            page={query.data?.page ?? 1}
            limit={query.data?.limit ?? 20}
            total={query.data?.total ?? 0}
            onPageChange={list.setPage}
            onLimitChange={list.setLimit}
          />
        </>
      )}
    </Panel>
  );
}
