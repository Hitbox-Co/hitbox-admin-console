"use client";

import * as React from "react";
import { Globe, Plus, Settings2 } from "lucide-react";
import { useAdminMarkets, useMarkets } from "@/lib/api/hooks";
import { formatDate, formatNumber } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import {
  Badge,
  Button,
  Panel,
  PanelHeader,
  Segmented,
  Tooltip,
} from "@/components/ui/primitives";
import { MoneyValue } from "@/components/ui/money";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { RankedBarChart } from "@/components/charts/charts";
import { MarketDrawer } from "@/components/markets/market-drawer";
import type { AdminMarket, MarketRow, Period } from "@/lib/types";

type Tab = "performance" | "configuration";

export default function MarketsPage() {
  return (
    <PageGuard
      can={(p) =>
        p.canRead("reports-dashboards") &&
        (p.canRead("order") || p.canRead("buyer-profile"))
      }
      what="Market reporting"
      requires="reports-dashboards:read"
    >
      <MarketsView />
    </PageGuard>
  );
}

function MarketsView() {
  const [tab, setTab] = React.useState<Tab>("performance");

  usePageChrome({
    title: "Markets",
    description:
      "Performance is the reporting re-slice; configuration is the managed record behind it.",
  });

  return (
    <div className="space-y-4">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "performance" as Tab, label: "Performance" },
          { value: "configuration" as Tab, label: "Configuration" },
        ]}
      />
      {tab === "performance" ? <PerformanceTab /> : <ConfigurationTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Performance — GET /admin/dashboard/markets                          */
/* ------------------------------------------------------------------ */

function PerformanceTab() {
  const [period, setPeriod] = React.useState<Period>("month");
  const perms = usePermissions();
  const query = useMarkets(period);

  const canMoney = perms.canRead("payment-royalty");
  const canOrders = perms.canRead("order");
  const canUsers = perms.canRead("buyer-profile");
  const rows = query.data ?? [];

  const columns = React.useMemo<Column<MarketRow>[]>(() => {
    const cols: Column<MarketRow>[] = [
      {
        key: "market",
        header: "Market",
        cell: (r) => (
          <div className="flex items-center gap-2.5">
            <span className="rounded-[4px] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-2)]">
              {r.code}
            </span>
            <span className="text-[13px] font-medium text-[var(--text-1)]">{r.name}</span>
          </div>
        ),
      },
      {
        key: "currency",
        header: "Currency",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[var(--text-3)]">{r.currency}</span>
        ),
      },
    ];

    if (canUsers) {
      cols.push(
        { key: "users", header: "Buyers", numeric: true, cell: (r) => formatNumber(r.users) },
        {
          key: "newUsers",
          header: "New buyers",
          numeric: true,
          cell: (r) => (
            <span className="text-[var(--text-3)]">{formatNumber(r.newUsers)}</span>
          ),
        }
      );
    }
    if (canOrders) {
      cols.push(
        { key: "orders", header: "Orders", numeric: true, cell: (r) => formatNumber(r.orders) },
        {
          key: "newOrders",
          header: "New orders",
          numeric: true,
          cell: (r) => (
            <span className="text-[var(--text-3)]">{formatNumber(r.newOrders)}</span>
          ),
        }
      );
    }
    if (canMoney) {
      cols.push({
        key: "revenue",
        header: "Revenue",
        numeric: true,
        cell: (r) => <MoneyValue money={r.revenue} size="sm" />,
      });
    }
    return cols;
  }, [canMoney, canOrders, canUsers]);

  const chartData = rows.map((m) => ({
    name: m.name,
    value: canOrders ? m.orders : m.users,
  }));

  return (
    <div className="space-y-4">
      <Segmented
        value={period}
        onChange={setPeriod}
        options={[
          { value: "week" as Period, label: "7 days" },
          { value: "month" as Period, label: "30 days" },
          { value: "year" as Period, label: "12 months" },
        ]}
      />

      {query.isLoading ? (
        <Panel>
          <TableSkeleton rows={5} cols={6} />
        </Panel>
      ) : query.isError ? (
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Globe}
            title="No market activity in this window"
            description="Widen the period, or check back once orders land."
          />
        </Panel>
      ) : (
        <div className="animate-fade-rise grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2 overflow-hidden">
            <PanelHeader title="By market" />
            <DataTable columns={columns} rows={rows} getRowKey={(r) => r.marketId} />
          </Panel>

          <Panel>
            <PanelHeader title={canOrders ? "Orders" : "Buyers"} />
            <div className="p-3">
              <RankedBarChart
                data={chartData}
                valueLabel={canOrders ? "Orders" : "Buyers"}
                height={Math.max(160, chartData.length * 38)}
              />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Configuration — GET/POST/PATCH/DELETE /admin/markets                */
/* ------------------------------------------------------------------ */

function ConfigurationTab() {
  const perms = usePermissions();
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminMarket | null>(null);
  const [creating, setCreating] = React.useState(false);

  const query = useAdminMarkets({ page, limit, includeArchived });

  /*
   * Writes need drop:manage at GLOBAL scope (admin-write-apis.md §0). An
   * org-scoped Brand Admin can read this list but every write 403s, so the
   * buttons are hidden rather than offered and refused.
   */
  const canWrite = perms.widestScope("drop") === "global" && perms.can("drop", "manage");

  const columns: Column<AdminMarket>[] = [
    {
      key: "market",
      header: "Market",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="rounded-[4px] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-2)]">
            {r.code}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{r.name}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-3)]">{r.currency}</p>
          </div>
        </div>
      ),
    },
    {
      key: "countries",
      header: "Countries",
      cell: (r) =>
        r.countryCodes.length ? (
          <span className="text-[12px] text-[var(--text-2)]">
            {r.countryCodes.slice(0, 6).join(", ")}
            {r.countryCodes.length > 6 ? ` +${r.countryCodes.length - 6}` : ""}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">None mapped</span>
        ),
    },
    {
      key: "usage",
      header: "In use by",
      numeric: true,
      cell: (r) => (
        <Tooltip content="Live reference counts. A non-zero price count refuses an archive.">
          <span className="tnum text-[12px] text-[var(--text-2)]">
            {formatNumber(r.usage.productPrices)} prices · {formatNumber(r.usage.orders)} orders
          </span>
        </Tooltip>
      ),
    },
    {
      key: "state",
      header: "State",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.isDefault ? <Badge tone="accent">Default</Badge> : null}
          <Badge tone={r.isActive ? "positive" : "neutral"} dot>
            {r.isActive ? "Active" : "Inactive"}
          </Badge>
          {r.archivedAt ? <Badge tone="neutral" outline>Archived</Badge> : null}
        </div>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
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
          {canWrite ? "Edit" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <>
      {canWrite ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New market
          </Button>
        </PageActions>
      ) : null}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] px-4 py-2.5">
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => {
                setIncludeArchived(e.target.checked);
                setPage(1);
              }}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Include archived
          </label>
          {!canWrite ? (
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
              <Settings2 className="h-3 w-3" aria-hidden />
              Editing a market needs drop:manage platform-wide
            </span>
          ) : null}
        </div>

        {query.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data?.items ?? []}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setEditing(r)}
              dimmed={query.isFetching}
              emptyState={
                <EmptyState
                  icon={Globe}
                  title="No markets configured"
                  description="A market is the pricing region a buyer shops in."
                  action={
                    canWrite ? (
                      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                        Create the first market
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
              onPageChange={setPage}
              onLimitChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
          </>
        )}
      </Panel>

      {creating ? <MarketDrawer onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <MarketDrawer market={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
