"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, FileWarning } from "lucide-react";
import { usePrefetchRelease, useReleases } from "@/lib/api/hooks";
import { formatDate, formatRelative, humanize } from "@/lib/format";
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
  // No artist and no organization: nobody outside HitBox to ask.
  NONE: "Auto-passed",
};

export default function ReleaseApprovalsPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("release-approval")}
      what="The release approval queue"
      requires="release-approval:read"
    >
      {/* Reads ?open= only to forward the old drawer links to the review page. */}
      <React.Suspense fallback={<TableSkeleton rows={10} cols={6} />}>
        <ReleaseApprovalsView />
      </React.Suspense>
    </PageGuard>
  );
}

function ReleaseApprovalsView() {
  const searchParams = useSearchParams();
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
  const router = useRouter();
  // Each review is its own page now; the drawer's old deep link forwards.
  const legacyOpen = searchParams.get("open");
  React.useEffect(() => {
    if (legacyOpen) router.replace(`/release-approvals/${legacyOpen}`);
  }, [legacyOpen, router]);
  const openReview = (id: string) => router.push(`/release-approvals/${id}`);
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
          {/* The submitter's note, while it is still theirs to read. */}
          {r.status === "PENDING" && r.comment ? (
            <p className="mt-0.5 max-w-[340px] truncate text-[11px] italic text-[var(--text-3)]">
              “{r.comment}”
            </p>
          ) : null}
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
              : r.authority === "NONE"
                ? "The drop names neither an artist nor an organization, so no owner's consent was needed. Approved on submit and filed under HitBox — no legal acceptance was recorded."
                : "A HitBox administrator can reject or reopen this, but cannot approve it — the approval records the owner's own acceptance of the compliance terms."
          }
        >
          <span className="cursor-help text-[12px] text-[var(--text-2)]">
            {r.authority ? AUTHORITY_LABEL[r.authority] ?? humanize(r.authority) : "—"}
            {r.requiredArtistName || r.requiredOrganizationName ? (
              <span className="block text-[10.5px] text-[var(--text-3)]">
                {r.authority === "ORGANIZATION"
                  ? r.requiredOrganizationName
                  : r.requiredArtistName}
              </span>
            ) : null}
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
      // `approverName` is whoever SUBMITTED the review, not who decided it —
      // labelled for what it is.
      key: "approver",
      header: "Submitted by",
      cell: (r) =>
        r.approverEmail ? (
          <span className="text-[12px] text-[var(--text-2)]">
            {r.approverName ?? r.approverEmail}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
    {
      key: "created",
      header: "Waiting since",
      cell: (r) => (
        <span className="tnum text-[12px]" title={formatDate(r.createdAt)}>
          {r.status === "PENDING" ? formatRelative(r.createdAt) : formatDate(r.createdAt)}
        </span>
      ),
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
            openReview(r.id);
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
              onRowClick={(r) => openReview(r.id)}
              onRowIntent={(r) => prefetchRelease(r.id)}
              dimmed={query.isFetching}
              emptyState={
                <EmptyState
                  icon={BadgeCheck}
                  title={
                    list.filters.status === "PENDING"
                      ? "Nothing is waiting on you."
                      : "No reviews match these filters"
                  }
                  description={
                    list.filters.status === "PENDING"
                      ? "Every drop in your scope has been decided. New submissions appear here."
                      : "Try a different status."
                  }
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
    </>
  );
}
