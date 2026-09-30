"use client";

import * as React from "react";
import { Plus, Scale } from "lucide-react";
import { useRoyaltyRules } from "@/lib/api/hooks";
import { formatDate, humanize, shortId } from "@/lib/format";
import { usePageChrome, PageActions } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Mono, Panel } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, useListState } from "@/components/ui/filters";
import { ArtistPicker, DropPicker } from "@/components/finance/entity-pickers";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ScopeNotice } from "@/components/finance/scope-notice";
import { RoyaltyRuleDrawer } from "@/components/finance/royalty-rule-drawer";
import { RoyaltyRuleForm } from "@/components/finance/royalty-rule-form";
import { splitsOf, ruleScopeLabel } from "@/components/finance/rule-helpers";
import type { RoyaltyRule } from "@/lib/types";

/**
 * Royalty rules — the terms, versioned rather than edited.
 *
 * There is no PUT, PATCH or DELETE on this resource and that is the design: a
 * rule that has priced an accrual cannot change its terms retroactively
 * without making every entry posted under it unexplainable. A renegotiation
 * is "close the old rule, create the successor", which is exactly what this
 * screen offers — and nothing else.
 */
export default function RoyaltyRulesPage() {
  const perms = usePermissions();
  const list = useListState<{ artistId?: string; productId?: string }>({
    artistId: undefined,
    productId: undefined,
  });

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const query = useRoyaltyRules(list.params);

  const canManage = perms.canManageFinance();

  usePageChrome({
    title: "Royalty rules",
    description: "The terms that price every accrual. Closed and replaced, never edited.",
  });

  const columns = React.useMemo<Column<RoyaltyRule>[]>(
    () => [
      {
        key: "scope",
        header: "Applies to",
        cell: (r) => {
          const { label, id } = ruleScopeLabel(r);
          return (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
                {label}
              </p>
              {id ? (
                <Mono className="mt-0.5 text-[10px]" title={id}>
                  {shortId(id)}
                </Mono>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "terms",
        header: "Terms",
        cell: (r) => {
          const splits = splitsOf(r);
          if (splits.length) {
            return (
              <div className="flex flex-wrap items-center gap-1">
                {splits.map((s, i) => (
                  <Badge key={i} tone="neutral" className="px-1 py-0 text-[10px]">
                    {humanize(s.payeeType)} {String(s.percentage)}%
                  </Badge>
                ))}
              </div>
            );
          }
          return (
            <span className="text-[12.5px] text-[var(--text-1)]">
              {r.percentage ? `${r.percentage}%` : "—"}
            </span>
          );
        },
      },
      {
        key: "basis",
        header: "Basis",
        cell: (r) => (
          <span className="text-[12px] text-[var(--text-2)]">{humanize(r.basis)}</span>
        ),
      },
      {
        key: "threshold",
        header: "Payout threshold",
        numeric: true,
        cell: (r) =>
          r.payoutThreshold ? (
            // The threshold is a currency-less DECIMAL on the rule — the
            // currency comes from the order it eventually prices, so it is
            // shown as a bare number rather than dressed up as one currency.
            <span className="text-[var(--text-1)]">{r.payoutThreshold}</span>
          ) : (
            <span className="text-[var(--text-3)]">Platform default</span>
          ),
      },
      {
        key: "frequency",
        header: "Cadence",
        cell: (r) => (
          <span className="text-[12px] text-[var(--text-2)]">
            {r.payoutFrequency ? humanize(r.payoutFrequency) : "Monthly"}
          </span>
        ),
      },
      {
        key: "window",
        header: "In force",
        cell: (r) => (
          <div className="min-w-0">
            <p className="tnum text-[12px] text-[var(--text-2)]">
              {formatDate(r.effectiveFrom)} →{" "}
              {r.effectiveTo ? formatDate(r.effectiveTo) : "open"}
            </p>
            <Badge
              tone={r.isInForce ? "positive" : "neutral"}
              className="mt-0.5 px-1 py-0 text-[10px]"
            >
              {r.isInForce ? "Active" : "Closed"}
            </Badge>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <>
      {canManage ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New rule
          </Button>
        </PageActions>
      ) : null}

      <div className="space-y-4">
        <ScopeNotice caveat="rules-by-organization" />

        <Panel className="overflow-hidden">
          <FilterRow onReset={list.reset} active={list.active}>
            {perms.reaches("drop") ? (
            <ArtistPicker
              size="sm"
              aria-label="All artists"
              className="w-[220px]"
              placeholder="All artists"
              value={list.filters.artistId}
              onChange={(v) => list.setFilter("artistId", v)}
            />
            ) : null}
            <DropPicker
              size="sm"
              aria-label="All drops"
              className="w-[220px]"
              placeholder="All drops"
              value={list.filters.productId}
              onChange={(v) => list.setFilter("productId", v)}
            />
          </FilterRow>

          {query.isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={query.data?.items ?? []}
                getRowKey={(r) => r.id}
                onRowClick={(r) => setOpenId(r.id)}
                dimmed={query.isFetching}
                emptyState={
                  <EmptyState
                    icon={Scale}
                    title="No royalty rules in scope"
                    description="Without a rule covering a drop at the moment of a claim, no royalty accrues at all — the accrual is refused with FINANCE_NO_RULE."
                    action={
                      canManage ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setCreating(true)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create the first rule
                        </Button>
                      ) : undefined
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
      </div>

      {openId ? (
        <RoyaltyRuleDrawer ruleId={openId} onClose={() => setOpenId(null)} />
      ) : null}
      {creating ? <RoyaltyRuleForm onClose={() => setCreating(false)} /> : null}
    </>
  );
}
