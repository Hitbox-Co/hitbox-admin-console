"use client";

import * as React from "react";
import { KeyRound, Plus } from "lucide-react";
import { useGatewayConfigs } from "@/lib/api/hooks";
import { formatDateTime, humanize, shortId } from "@/lib/format";
import { usePageChrome, PageActions } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel, toneForStatus } from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { FilterRow, FilterSelect, useListState } from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { GatewayConfigDialog } from "@/components/payments/gateway-config-dialog";
import type { GatewayConfig } from "@/lib/types";

/**
 * Gateway configuration — System Admin only.
 *
 * `payment-royalty:configure:global` gates the LIST here, not just the
 * writes, which is unusual in these two modules and deliberate: changing
 * `credentialsRef` is functionally changing the bank account the platform's
 * money lands in, and even knowing which secrets back which organization is
 * more than a finance reader needs.
 *
 * `credentialsRef` is a POINTER into the secrets manager and never a key. The
 * API refuses a value starting `sk_`, `rk_`, `pk_live` or `whsec_` with a
 * message saying where it belongs — and the form refuses it before it is sent,
 * so a pasted secret does not end up in a request log on the way to being
 * rejected.
 */
export default function GatewayConfigsPage() {
  return (
    <PageGuard
      can={(p) => p.canConfigureGateways()}
      what="Gateway configuration"
      requires="payment-royalty:configure:global"
    >
      <GatewayConfigsView />
    </PageGuard>
  );
}

function GatewayConfigsView() {
  const list = useListState<{ scope?: string; status?: string }>({
    scope: undefined,
    status: undefined,
  });

  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<GatewayConfig | null>(null);
  const query = useGatewayConfigs(list.params);

  usePageChrome({
    title: "Gateway configuration",
    description: "Which provider credentials apply, and where.",
  });

  const columns = React.useMemo<Column<GatewayConfig>[]>(
    () => [
      {
        key: "scope",
        header: "Scope",
        cell: (r) => (
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--text-1)]">
              {humanize(r.scope)}
            </p>
            {r.organizationId ? (
              <Mono className="mt-0.5 text-[10px]" title={r.organizationId}>
                {shortId(r.organizationId)}
              </Mono>
            ) : null}
          </div>
        ),
      },
      {
        key: "gateway",
        header: "Gateway",
        cell: (r) => <span className="text-[12.5px]">{r.gateway}</span>,
      },
      {
        key: "default",
        header: "Default",
        cell: (r) =>
          r.isDefault ? (
            <Badge tone="accent" className="px-1 py-0 text-[10px]">
              Default
            </Badge>
          ) : (
            <span className="text-[var(--text-3)]">—</span>
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
        key: "ref",
        header: "Credentials reference",
        cell: (r) => (
          // A pointer, safe to show. The key it points at never leaves the
          // secrets manager and is not a field this API returns at all.
          <span
            className="block max-w-[280px] truncate font-mono text-[11px] text-[var(--text-2)]"
            title={r.credentialsRef}
          >
            {r.credentialsRef}
          </span>
        ),
      },
      {
        key: "updated",
        header: "Updated",
        cell: (r) => (
          <span className="tnum text-[12px] text-[var(--text-3)]">
            {formatDateTime(r.updatedAt)}
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
              setEditing(r);
            }}
          >
            Edit
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <>
      <PageActions>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add configuration
        </Button>
      </PageActions>

      <Panel className="overflow-hidden">
        <FilterRow onReset={list.reset} active={list.active}>
          <FilterSelect
            label="Scope"
            value={list.filters.scope}
            onChange={(v) => list.setFilter("scope", v)}
            options={["PLATFORM", "ORGANIZATION", "DROP"]}
            allLabel="All scopes"
          />
          <FilterSelect
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={["ACTIVE", "INACTIVE"]}
            allLabel="Any"
          />
        </FilterRow>

        {query.isLoading ? (
          <TableSkeleton rows={6} cols={7} />
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
                  icon={KeyRound}
                  title="No gateway configuration"
                  description="Without an active configuration covering a drop's scope, checkout answers PAYMENTS_NO_GATEWAY and nothing can be bought."
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCreating(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add the first one
                    </Button>
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

      {creating ? <GatewayConfigDialog onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <GatewayConfigDialog config={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
