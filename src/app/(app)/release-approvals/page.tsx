"use client";

import * as React from "react";
import { BadgeCheck, FileWarning } from "lucide-react";
import { usePrefetchRelease, useReleases } from "@/lib/api/hooks";
import { formatDate, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import {
  Badge,
  Button,
  Mono,
  Panel,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ReleaseDrawer } from "@/components/releases/release-drawer";
import type { ReleaseApproval, ReleaseAuthority } from "@/lib/types";

/**
 * Who must decide each row. In the queue rather than only in the drawer,
 * because an approver scanning for their own work should not have to open
 * every review to find out which ones are theirs.
 */
const AUTHORITY_LABEL: Record<ReleaseAuthority, string> = {
  ARTIST: "Artist",
  ORGANIZATION: "Brand",
  PLATFORM: "Platform",
};

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
  const list = useListState<{ status?: string; complianceStatus?: string }>({
    status: "PENDING",
    complianceStatus: undefined,
  });
  /**
   * `latestOnly` collapses to the newest version per product — that is the
   * review queue. Turning it off shows every version, which is the audit
   * view: an append-only trail where a twice-bounced drop appears three times.
   */
  const [latestOnly, setLatestOnly] = React.useState(true);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const prefetchRelease = usePrefetchRelease();

  const query = useReleases({ ...list.params, latestOnly });

  usePageChrome({
    title: "Approvals",
    description: "Compliance sign-off before a drop goes live.",
  });

  const columns: Column<ReleaseApproval>[] = [
    {
      key: "product",
      header: "Drop",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
            {r.product.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <Mono className="text-[10px]">{r.product.groupCode}</Mono>
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
      key: "authority",
      header: "Decided by",
      cell: (r) => (
        <Tooltip
          content={
            r.authority === "PLATFORM"
              ? "HitBox staff decide this drop."
              : "A HitBox administrator can reject or reopen this, but cannot approve it — the approval records the owner's own acceptance of the compliance terms."
          }
        >
          <span className="cursor-help text-[12px] text-[var(--text-2)]">
            {r.authority ? AUTHORITY_LABEL[r.authority] ?? humanize(r.authority) : "—"}
          </span>
        </Tooltip>
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
      key: "odds",
      header: "Odds disclosure",
      cell: (r) =>
        r.oddsDisclosureRef ? (
          <Mono className="text-[11px]">{r.oddsDisclosureRef}</Mono>
        ) : (
          <Tooltip content="Clearing compliance without one logs a warning; a non-randomised drop legitimately has none.">
            <span className="inline-flex cursor-help items-center gap-1 text-[12px] text-[var(--text-3)]">
              <FileWarning className="h-3 w-3" aria-hidden />
              None
            </span>
          </Tooltip>
        ),
    },
    {
      key: "approver",
      header: "Approver",
      cell: (r) =>
        r.approverEmail ? (
          <span className="text-[12px] text-[var(--text-2)]">
            {r.approverName ?? r.approverEmail}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">Unassigned</span>
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
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setOpenId(r.id);
          }}
        >
          Review
        </Button>
      ),
    },
  ];

  return (
    <>
      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.filters.status !== "PENDING"}>
          <FilterSelect
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={["PENDING", "APPROVED", "REJECTED"]}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Compliance"
            value={list.filters.complianceStatus}
            onChange={(v) => list.setFilter("complianceStatus", v)}
            options={["PENDING", "CLEARED", "FLAGGED"]}
            allLabel="Any"
          />
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={latestOnly}
              onChange={(e) => {
                setLatestOnly(e.target.checked);
                list.setPage(1);
              }}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Latest version only
          </label>
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={8} cols={9} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data?.items ?? []}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setOpenId(r.id)}
              onRowIntent={(r) => prefetchRelease(r.id)}
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

      {openId ? (
        <ReleaseDrawer approvalId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
