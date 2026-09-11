"use client";

import * as React from "react";
import { BadgeCheck, FileWarning, ShieldAlert } from "lucide-react";
import { useReleaseApprovals } from "@/lib/api/hooks";
import { formatDate, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import {
  Badge,
  Mono,
  Panel,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type { ReleaseApprovalRow } from "@/lib/types";

export default function ReleaseApprovalsPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("release-approval")}
      what="The release approval queue"
      requires="release-approval:read"
    >
      <ReleaseApprovalsView />
    </PageGuard>
  );
}

function ReleaseApprovalsView() {
  const list = useListState<{ status?: string }>({ status: "PENDING" });
  const query = useReleaseApprovals(list.params);

  usePageChrome({
    title: "Release approvals",
    description: "Compliance sign-off before a drop goes live.",
  });

  const columns: Column<ReleaseApprovalRow>[] = [
    {
      key: "product",
      header: "Product",
      cell: (r) => (
        <div>
          <p className="text-[13px] font-medium text-[var(--text-1)]">
            {r.product.name}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
            v{r.version} · {humanize(r.product.status)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge tone={toneForStatus(r.status)} dot>
          {humanize(r.status)}
        </Badge>
      ),
    },
    {
      key: "compliance",
      header: "Compliance",
      cell: (r) => (
        <Badge tone={toneForStatus(r.complianceStatus)}>
          {humanize(r.complianceStatus)}
        </Badge>
      ),
    },
    {
      // The three fields the approver is personally accountable for.
      key: "age",
      header: "Age restriction",
      cell: (r) =>
        r.product.isAgeSpecific ? (
          <Tooltip content="This drop is age-restricted. Confirm the minimum age before approving.">
            <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--warning-dim)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warning)]">
              <ShieldAlert className="h-3 w-3" aria-hidden />
              {r.product.minimumAge ? `${r.product.minimumAge}+` : "Age-specific"}
            </span>
          </Tooltip>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">None</span>
        ),
    },
    {
      key: "odds",
      header: "Odds disclosure",
      cell: (r) =>
        r.oddsDisclosureRef ? (
          <Mono className="text-[11px]">{r.oddsDisclosureRef}</Mono>
        ) : (
          <Tooltip content="A chance-based drop without an odds disclosure cannot be cleared.">
            <span className="inline-flex cursor-help items-center gap-1 text-[12px] text-[var(--danger)]">
              <FileWarning className="h-3 w-3" aria-hidden />
              Missing
            </span>
          </Tooltip>
        ),
    },
    {
      key: "created",
      header: "Submitted",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "decided",
      header: "Decided",
      cell: (r) => (
        <span className="tnum text-[12px] text-[var(--text-3)]">
          {formatDate(r.decidedAt)}
        </span>
      ),
    },
  ];

  return (
    <Panel className="overflow-hidden">
      <FilterRow onReset={list.reset} active={list.filters.status !== "PENDING"}>
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          options={["PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"]}
          allLabel="All statuses"
        />
        <p className="text-[11px] text-[var(--text-3)]">
          Age restriction and odds disclosure are the compliance facts you sign
          off on.
        </p>
      </FilterRow>

      {query.isLoading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={query.data?.items ?? []}
            getRowKey={(r) => r.id}
            dimmed={query.isFetching}
            emptyState={
              <EmptyState
                icon={BadgeCheck}
                title="Nothing waiting for approval"
                description="Every submitted release in your scope has been decided."
              />
            }
          />
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
