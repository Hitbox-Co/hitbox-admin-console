"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { useDashboard } from "@/lib/api/hooks";
import { formatCompact, formatNumber } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Panel, PanelHeader, Segmented } from "@/components/ui/primitives";
import { StatCard } from "@/components/dashboard/stat-card";
import { CardSkeleton, EmptyState, ErrorState, NotPermitted } from "@/components/ui/states";
import { Meter } from "@/components/charts/charts";
import { SERIES } from "@/components/charts/palette";
import type { Period } from "@/lib/types";

/**
 * There is no dedicated /dashboard/content sub-endpoint, so this reads the
 * `content` section off the aggregate — which means the key can be absent
 * rather than 403, and is handled as such.
 */
export default function ContentPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("content-unlock")}
      what="Content bundles"
      requires="content-unlock:read"
    >
      <ContentView />
    </PageGuard>
  );
}

function ContentView() {
  const [period, setPeriod] = React.useState<Period>("month");
  const query = useDashboard({ period });

  usePageChrome({
    title: "Content",
    description: "Exclusive bundles and how often they are unlocked.",
  });

  const c = query.data?.content;
  const artists = query.data?.artists;

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
      ) : !query.data?.content ? (
        <Panel className="p-6">
          <NotPermitted what="Content bundles" requires="content-unlock:read" />
        </Panel>
      ) : (
        <div className="animate-fade-rise space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active bundles"
              value={formatNumber(c!.activeBundles)}
              hint={`of ${formatNumber(c!.totalBundles)} total`}
            />
            <StatCard
              label="New this period"
              value={formatNumber(c!.newBundles)}
              hint="Bundles created"
            />
            <StatCard
              label="Unlocks"
              value={formatCompact(c!.unlocksThisPeriod)}
              hint="Across all bundles this period"
            />
            <StatCard
              label="Avg. access count"
              value={c!.avgAccessCount.toFixed(1)}
              hint="Times a buyer opens a bundle"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Bundle health"
                description="Active share of the catalogue."
              />
              <div className="space-y-3 px-4 py-4">
                <Meter
                  label="Active bundles"
                  value={c!.activeBundles}
                  max={c!.totalBundles || 1}
                  color={SERIES[0]}
                  hint={`${formatNumber(c!.totalBundles - c!.activeBundles)} inactive or ended`}
                />
                <Meter
                  label="Unlocks per active bundle"
                  value={Math.round(c!.unlocksThisPeriod / Math.max(c!.activeBundles, 1))}
                  max={Math.max(
                    50,
                    Math.round(c!.unlocksThisPeriod / Math.max(c!.activeBundles, 1))
                  )}
                  color={SERIES[2]}
                />
              </div>
            </Panel>

            {artists ? (
              <Panel>
                <PanelHeader
                  title="Artists"
                  description="Who the content belongs to."
                />
                <div className="grid grid-cols-2 gap-y-3 px-4 py-4">
                  {[
                    ["Total", artists.total],
                    ["Active", artists.active],
                    ["Public profiles", artists.public],
                    ["New this period", artists.new],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <p className="text-[11px] text-[var(--text-3)]">{label}</p>
                      <p className="tnum text-[16px] font-medium text-[var(--text-1)]">
                        {formatNumber(Number(value))}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : (
              <Panel className="p-4">
                <p className="mb-3 text-[13px] font-semibold text-[var(--text-1)]">
                  Artists
                </p>
                <NotPermitted
                  what="Artist records"
                  requires="brand-artist-record:read"
                />
              </Panel>
            )}
          </div>

          {c!.totalBundles === 0 ? (
            <Panel>
              <EmptyState
                icon={Sparkles}
                title="No content bundles yet"
                description="Bundles appear here once a drop ships exclusive content."
              />
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}
