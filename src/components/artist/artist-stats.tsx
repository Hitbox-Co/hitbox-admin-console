"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, Coins, Heart, Lock, ShoppingBag, TrendingUp } from "lucide-react";
import { useArtistStats } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TrendChart } from "@/components/charts/charts";
import { SERIES } from "@/components/charts/palette";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Input, Panel, PanelHeader, Segmented, Skeleton, toneForStatus } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { MoneyMap } from "./artist-bits";
import { DropMonogram } from "./drop-tile";
import type { ArtistStatsPeriod } from "@/lib/types";

/**
 * Stats (GET /admin/artists/:id/stats). Sales count PAID → DELIVERED orders
 * by paidAt; money is per currency and only present with a platform-wide
 * payment-royalty read — otherwise those cards say why they're missing.
 */

const PERIOD_LABEL: Record<ArtistStatsPeriod, string> = {
  week: "last 7 days",
  month: "last 30 days",
  year: "last 12 months",
  custom: "selected dates",
};

export function ArtistStatsTab({ artistId }: { artistId: string }) {
  const perms = usePermissions();
  const [period, setPeriod] = React.useState<ArtistStatsPeriod>("year");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const q = useArtistStats(artistId, {
    period,
    ...(period === "custom" ? { from: from || undefined, to: to || undefined } : {}),
    topDrops: 5,
  });
  const s = q.data;
  const label = PERIOD_LABEL[period];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "year", label: "Year" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {period === "custom" ? (
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-[12px]" aria-label="From" />
            to
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-[12px]" aria-label="To" />
          </div>
        ) : null}
        {s ? (
          <span className="text-[12px] text-[var(--text-3)]">
            {formatDate(s.period.from)} – {formatDate(s.period.to)}
          </span>
        ) : null}
      </div>

      {period === "custom" && (!from || !to) ? (
        <Panel className="px-4 py-6 text-center text-[12.5px] text-[var(--text-3)]">Pick a start and end date.</Panel>
      ) : q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : q.isError || !s ? (
        <Panel>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Panel>
      ) : (
        <div className={cn("space-y-4", q.isFetching && "opacity-70 transition-opacity")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={ShoppingBag}
              label="Units sold"
              value={formatNumber(s.sales.period.unitsSold)}
              sub={`${formatNumber(s.sales.lifetime.unitsSold)} all time · ${formatNumber(s.sales.period.orders)} orders`}
              accent
            />
            <Kpi
              icon={TrendingUp}
              label="Revenue"
              money={s.moneyVisible ? s.sales.period.revenue : undefined}
              hidden={!s.moneyVisible}
              sub={s.moneyVisible ? "Paid orders, per currency" : undefined}
            />
            <Kpi
              icon={BadgeCheck}
              label="Claims"
              value={formatNumber(s.claims.period)}
              sub={`${formatNumber(s.claims.lifetime)} all time${s.claims.revoked ? ` · ${formatNumber(s.claims.revoked)} revoked` : ""}`}
            />
            <Kpi
              icon={Heart}
              label="Followers"
              value={formatNumber(s.followers.total)}
              sub={`+${formatNumber(s.followers.period)} in the ${label}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel className="overflow-hidden">
              <PanelHeader title="Units sold" description={`Over the ${label}`} />
              <div className="px-2 py-3">
                {s.sales.trend.length ? (
                  <TrendChart data={s.sales.trend} dataKey="value" label="Units" height={200} />
                ) : (
                  <EmptyChart text="No sales in this period." />
                )}
              </div>
            </Panel>
            <Panel className="overflow-hidden">
              <PanelHeader title="Followers" description="Running total — days without a new follow are skipped" />
              <div className="px-2 py-3">
                {s.followers.trend.length ? (
                  <TrendChart
                    data={s.followers.trend.map((t) => ({ date: t.date, total: t.total, new: t.new }))}
                    dataKey="total"
                    label="Followers"
                    color={SERIES[1]}
                    height={200}
                  />
                ) : (
                  <EmptyChart text="No new followers in this period." />
                )}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Royalties stats={s} />
            <TopDrops stats={s} canOpen={perms.canOpenDropPage()} />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  money,
  sub,
  hidden,
  accent,
}: {
  icon: typeof Coins;
  label: string;
  value?: string;
  money?: Record<string, string>;
  sub?: string;
  hidden?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5",
        accent
          ? "border-[var(--accent)]/40 bg-gradient-to-br from-[var(--accent-dim)] to-transparent"
          : "border-[var(--hairline)] bg-[var(--surface-1)]"
      )}
    >
      <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      {hidden ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
          <Lock className="h-3.5 w-3.5" /> Needs payment-royalty:read
        </p>
      ) : money ? (
        <MoneyMap value={money} stacked className="mt-1 text-[18px] font-semibold leading-tight text-[var(--text-1)]" />
      ) : (
        <p className="tnum mt-1 text-[26px] font-semibold leading-none text-[var(--text-1)]">{value}</p>
      )}
      {sub ? <p className="mt-1.5 text-[11px] text-[var(--text-3)]">{sub}</p> : null}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-[200px] items-center justify-center text-[12px] text-[var(--text-3)]">{text}</div>;
}

function Royalties({ stats: s }: { stats: NonNullable<ReturnType<typeof useArtistStats>["data"]> }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Royalties" description="This artist as payee — per currency, never converted" />
      {!s.moneyVisible || !s.royalties ? (
        <p className="flex items-center gap-2 px-4 py-4 text-[12.5px] text-[var(--text-3)]">
          <Lock className="h-3.5 w-3.5" /> Seeing money needs a platform-wide payment-royalty read.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-[12px]">
          {(
            [
              ["Earned (period)", s.royalties.periodEarned],
              ["Earned (all time)", s.royalties.earned],
              ["Paid", s.royalties.paid],
              ["Outstanding", s.royalties.outstanding],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">{k}</dt>
              <dd className="mt-0.5">
                <MoneyMap value={v} stacked className="text-[14px] font-medium text-[var(--text-1)]" />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

function TopDrops({
  stats: s,
  canOpen,
}: {
  stats: NonNullable<ReturnType<typeof useArtistStats>["data"]>;
  canOpen: boolean;
}) {
  const max = Math.max(1, ...s.topDrops.map((d) => d.unitsSold));
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Top drops" description="By units sold, all time" />
      {s.topDrops.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-[var(--text-3)]">Nothing sold yet.</p>
      ) : (
        <ol className="divide-y divide-[var(--hairline)]">
          {s.topDrops.map((d) => {
            const row = (
              <div className="flex items-center gap-3 px-4 py-2.5">
                <DropMonogram id={d.id} name={d.name} className="h-9 w-9 rounded-[8px] text-[11px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[12.5px] font-medium text-[var(--text-1)]">{d.name}</p>
                    <Badge tone={toneForStatus(d.status)}>{humanize(d.status)}</Badge>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#c86dd7]"
                      style={{ width: `${(d.unitsSold / max) * 100}%` }}
                    />
                  </div>
                  {d.revenue ? <MoneyMap value={d.revenue} className="mt-1 text-[11px] text-[var(--text-3)]" /> : null}
                </div>
                <span className="tnum text-right text-[12px] text-[var(--text-2)]">
                  {formatNumber(d.unitsSold)}
                  <span className="block text-[10.5px] text-[var(--text-3)]">units</span>
                </span>
              </div>
            );
            return (
              <li key={d.id}>
                {canOpen ? (
                  <Link href={`/products/${d.id}`} className="block transition-colors hover:bg-[var(--surface-2)]">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
