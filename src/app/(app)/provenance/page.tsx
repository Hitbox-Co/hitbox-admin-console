"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { useProvenance } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
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
import type { ProvenanceCaseRow } from "@/lib/types";

const CASE_TYPES = ["CLONED", "TAMPERED", "STOLEN", "DISPUTED_OWNERSHIP", "COUNTERFEIT"];
const STATUSES = ["OPEN", "INVESTIGATING", "RESOLVED"];

export default function ProvenancePage() {
  return (
    <PageGuard
      can={(p) => p.canRead("nfc-tag-claim") || p.canRead("collectible-instance")}
      what="Provenance cases"
      requires="nfc-tag-claim:read"
    >
      <ProvenanceView />
    </PageGuard>
  );
}

function ProvenanceView() {
  const list = useListState<{ status?: string; caseType?: string }>({
    status: undefined,
    caseType: undefined,
  });
  const query = useProvenance(list.params);

  usePageChrome({
    title: "Provenance",
    description: "Tag disputes, clones and tamper reports.",
  });

  const columns: Column<ProvenanceCaseRow>[] = [
    {
      key: "case",
      header: "Case",
      cell: (r) => (
        <div>
          <p className="font-mono text-[12px] text-[var(--text-1)]">{r.id}</p>
          <p className="mt-0.5 max-w-[360px] truncate text-[11px] text-[var(--text-3)]">
            {r.description}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (r) => <Badge tone="neutral">{humanize(r.caseType)}</Badge>,
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
      key: "tag",
      header: "Tag",
      cell: (r) => <Mono className="text-[11px]">{r.tagId}</Mono>,
    },
    {
      key: "sku",
      header: "SKU state",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={toneForStatus(r.sku.tagLifecycleState)}>
            {humanize(r.sku.tagLifecycleState)}
          </Badge>
          {r.sku.tamperStatus ? (
            <Tooltip content="Tamper signal reported by the tag reader.">
              <span>
                <Badge tone="danger">{humanize(r.sku.tamperStatus)}</Badge>
              </span>
            </Tooltip>
          ) : null}
        </div>
      ),
    },
    {
      key: "opened",
      header: "Opened",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "resolved",
      header: "Resolved",
      cell: (r) => (
        <span className="tnum text-[12px] text-[var(--text-3)]">
          {formatDate(r.resolvedAt)}
        </span>
      ),
    },
  ];

  const summary = query.data?.summary;

  return (
    <div className="space-y-4">
      {summary ? (
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(summary.cases).map(([status, count]) => (
            <Panel key={status} className="px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      status === "OPEN"
                        ? "#4d8bbf"
                        : status === "INVESTIGATING"
                          ? "#c99a3f"
                          : "#4ea674",
                  }}
                  aria-hidden
                />
                {humanize(status)}
              </p>
              <p className="tnum mt-1 text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                {formatNumber(count)}
              </p>
            </Panel>
          ))}
        </div>
      ) : null}

      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.active}>
          <FilterSelect
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={STATUSES}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Type"
            value={list.filters.caseType}
            onChange={(v) => list.setFilter("caseType", v)}
            options={CASE_TYPES}
            allLabel="All types"
          />
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={7} />
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
                  icon={ShieldCheck}
                  title="No cases match these filters"
                  description="Nothing in the queue — provenance is clean for this selection."
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
    </div>
  );
}
