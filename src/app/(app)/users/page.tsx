"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { useDashboardUsers } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel, PanelHeader, Segmented } from "@/components/ui/primitives";
import { StatCard } from "@/components/dashboard/stat-card";
import { DataTable, type Column } from "@/components/ui/table";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ui/states";
import { Meter, TrendChart } from "@/components/charts/charts";
import { SERIES } from "@/components/charts/palette";
import type { Period, UsersSection } from "@/lib/types";

type MarketRow = UsersSection["byMarket"][number];

export default function UsersPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("buyer-profile")}
      what="Buyer data"
      requires="buyer-profile:read"
    >
      <UsersView />
    </PageGuard>
  );
}

function UsersView() {
  const [period, setPeriod] = React.useState<Period>("month");
  const query = useDashboardUsers(period);
  const u = query.data;

  usePageChrome({
    title: "Buyers",
    description: "Signups, retention and where they come from.",
  });

  const columns: Column<MarketRow>[] = [
    {
      key: "market",
      header: "Market",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="rounded-[4px] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-2)]">
            {r.code}
          </span>
          <span className="text-[13px] text-[var(--text-1)]">{r.name}</span>
        </div>
      ),
    },
    { key: "users", header: "Buyers", numeric: true, cell: (r) => formatNumber(r.users) },
    {
      key: "new",
      header: "New this period",
      numeric: true,
      cell: (r) => (
        <span className="text-[var(--text-3)]">{formatNumber(r.newUsers)}</span>
      ),
    },
    {
      key: "share",
      header: "Share",
      numeric: true,
      cell: (r) => {
        const total = u?.total ?? 0;
        return total > 0 ? `${((r.users / total) * 100).toFixed(1)}%` : "—";
      },
    },
  ];

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      ) : !u ? (
        <Panel>
          <EmptyState icon={Users} title="No buyer data returned for this period" />
        </Panel>
      ) : (
        <div className="animate-fade-rise space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total buyers"
              value={formatNumber(u.total)}
              growth={u.growthPercentage}
              trend={u.trend}
              trendKey="users"
            />
            <StatCard
              label="New this period"
              value={formatNumber(u.new)}
              hint="First-time signups"
            />
            <StatCard
              label="Active"
              value={formatNumber(u.active)}
              hint={`${formatNumber(u.inactive)} inactive`}
            />
            {/* Admin counts arrive only with employee-role-mgmt:read */}
            {"totalAdmins" in u ? (
              <StatCard
                label="Admins"
                value={formatNumber(u.totalAdmins)}
                hint={`${formatNumber(u.newAdmins)} added this period`}
              />
            ) : (
              <StatCard
                label="Retention"
                value={
                  u.total > 0 ? `${((u.active / u.total) * 100).toFixed(1)}%` : "—"
                }
                hint="Active share of all buyers"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader
                title="New buyers"
                description="Daily signups across the period."
              />
              <div className="p-3">
                {u.trend.length > 1 ? (
                  <TrendChart
                    data={u.trend}
                    dataKey="users"
                    label="New buyers"
                    color={SERIES[2]}
                    height={220}
                  />
                ) : (
                  <EmptyState title="Not enough days in this window to plot a trend" />
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Active vs inactive" />
              <div className="space-y-3 px-4 py-4">
                <Meter
                  label="Active"
                  value={u.active}
                  max={u.total || 1}
                  color={SERIES[2]}
                />
                <Meter
                  label="Inactive"
                  value={u.inactive}
                  max={u.total || 1}
                  color="#4b5563"
                />
              </div>
            </Panel>
          </div>

          <Panel className="overflow-hidden">
            <PanelHeader title="By market" />
            {u.byMarket.length === 0 ? (
              <EmptyState title="No market breakdown in this window" />
            ) : (
              <DataTable
                columns={columns}
                rows={u.byMarket}
                getRowKey={(r) => r.marketId}
              />
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
