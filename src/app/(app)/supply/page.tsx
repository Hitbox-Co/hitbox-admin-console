"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Cpu,
  Info,
  PackageCheck,
  TrendingDown,
  Truck,
} from "lucide-react";
import { useSupplyMetrics } from "@/lib/api/hooks";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Mono, Panel, Tooltip } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/stat-card";
import { ErrorState, GridSkeleton } from "@/components/ui/states";
import type { SupplyMetrics } from "@/lib/types";

export default function SupplyOverviewPage() {
  return (
    <PageGuard
      can={(p) => p.canRead("reports-dashboards")}
      what="The supply rollup"
      requires="reports-dashboards:read"
    >
      <SupplyOverviewView />
    </PageGuard>
  );
}

function SupplyOverviewView() {
  const query = useSupplyMetrics();
  const metrics = query.data;

  usePageChrome({
    title: "Supply overview",
    description: "Chip stock, intake and where the paperwork and the shelf disagree.",
  });

  if (query.isLoading) return <GridSkeleton count={8} />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  if (!metrics) return null;

  /*
   * Every block is OPTIONAL, and checking for presence rather than a value is
   * the whole point: `tags: { total: 0 }` would mean "no chips exist", which
   * is a different and actionable claim from "you cannot see this". A caller
   * whose grants exclude a block gets no key at all, and this page says so
   * rather than rendering a misleading zero.
   */
  const { tags, batches, vendors, inventory, reconciliation, lowStock } = metrics;
  const visible = [tags, batches, vendors, inventory, reconciliation, lowStock].filter(
    Boolean
  ).length;

  return (
    <div className="space-y-5">
      <Header metrics={metrics} />

      {visible === 0 ? (
        <Panel className="p-6">
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--text-2)]">
            <Info className="mt-[2px] h-4 w-4 shrink-0 text-[var(--text-3)]" aria-hidden />
            <span>
              You may read reports, but no supply data. Every block of this
              rollup is gated separately — consignment figures need{" "}
              <Mono className="text-[11px]">drop:read</Mono> and chip figures
              need <Mono className="text-[11px]">nfc-tag-claim:read</Mono>. This
              is the honest answer rather than a screen of zeroes.
            </span>
          </p>
        </Panel>
      ) : null}

      {batches || tags ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {batches ? (
            <>
              <StatCard
                label="Consignments"
                value={formatNumber(batches.total)}
                hint={`${formatNumber(batches.pendingReview)} awaiting a decision`}
              />
              <StatCard
                label="Acceptance rate"
                /* A string from the API, rendered as given: re-rounding it
                   here would disagree with every other screen. */
                value={`${batches.acceptanceRate}%`}
                hint={`${formatNumber(batches.rowsAccepted)} of ${formatNumber(
                  batches.rowsReceived
                )} rows accepted`}
              />
            </>
          ) : null}
          {tags ? (
            <>
              <StatCard
                label="Chips in stock"
                value={formatNumber(tags.total)}
                hint={`${formatNumber(tags.unbound)} free, ${formatNumber(
                  tags.bound
                )} bound`}
              />
              <StatCard
                label="QC failure rate"
                value={`${tags.qcFailureRate}%`}
                hint={`${formatNumber(tags.byQc.FAILED ?? 0)} failed, ${formatNumber(
                  tags.byQc.PENDING ?? 0
                )} pending`}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {inventory ? (
        <Panel>
          <SectionHeader
            icon={Boxes}
            title="Inventory"
            subtitle="Declared supply against what is actually minted, tagged and claimed."
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 pb-4 sm:grid-cols-4">
            <Figure label="Drops" value={inventory.drops} />
            <Figure label="Declared supply" value={inventory.totalSupply} />
            <Figure label="Minted" value={inventory.minted} />
            <Figure label="Unminted" value={inventory.unminted} />
            <Figure label="Claimed" value={inventory.claimed} />
            <Figure label="Unclaimed" value={inventory.unclaimed} />
            {/* Absent for a caller without the chip grant — not zero. */}
            {inventory.tagged !== undefined ? (
              <Figure label="Tagged" value={inventory.tagged} />
            ) : null}
            {inventory.untagged !== undefined ? (
              <Figure label="Untagged" value={inventory.untagged} />
            ) : null}
          </div>
        </Panel>
      ) : null}

      {tags ? (
        <Panel>
          <SectionHeader
            icon={Cpu}
            title="Chip lifecycle"
            subtitle="Where the chip stock sits, and how much of it is still free."
          />
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            {Object.entries(tags.byLifecycle).map(([state, count]) => (
              <span
                key={state}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1 text-[12px] text-[var(--text-2)]"
              >
                {humanize(state)}
                <span className="tnum font-medium text-[var(--text-1)]">
                  {formatNumber(count)}
                </span>
              </span>
            ))}
          </div>
        </Panel>
      ) : null}

      {reconciliation ? <Reconciliation data={reconciliation} /> : null}
      {vendors ? <VendorLeaders data={vendors} /> : null}
      {lowStock ? <LowStock rows={lowStock} /> : null}
    </div>
  );
}

function Header({ metrics }: { metrics: SupplyMetrics }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
        <Badge tone="neutral">{humanize(metrics.scope)}</Badge>
        Generated {formatDateTime(metrics.generatedAt)}
      </p>
      <nav className="flex flex-wrap items-center gap-2 text-[12px]">
        <SubLink href="/supply/consignments" icon={PackageCheck}>
          Consignments
        </SubLink>
        <SubLink href="/supply/chips" icon={Cpu}>
          Chip inventory
        </SubLink>
        <SubLink href="/supply/vendors" icon={Truck}>
          Vendors
        </SubLink>
        <SubLink href="/inventory" icon={Boxes}>
          Units
        </SubLink>
      </nav>
    </div>
  );
}

function SubLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="pressable inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1 text-[var(--text-2)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text-1)]"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </Link>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-2.5 px-4 pb-3 pt-4">
      <Icon className="mt-[2px] h-4 w-4 shrink-0 text-[var(--text-3)]" aria-hidden />
      <div>
        <p className="text-[13px] font-medium text-[var(--text-1)]">{title}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--text-3)]">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-3)]">{label}</p>
      <p className="tnum mt-0.5 text-[16px] font-medium text-[var(--text-1)]">
        {formatNumber(value)}
      </p>
    </div>
  );
}

function Reconciliation({
  data,
}: {
  data: NonNullable<SupplyMetrics["reconciliation"]>;
}) {
  return (
    <Panel>
      <SectionHeader
        icon={AlertTriangle}
        title="Reconciliation"
        subtitle="Where the paperwork and the shelf disagree — declared against what was actually keyed in."
      />

      <div className="flex flex-wrap gap-6 px-4 pb-3">
        {data.unboundTagStock !== undefined ? (
          <Figure label="Free chip stock" value={data.unboundTagStock} />
        ) : null}
        {data.untaggedUnits !== undefined ? (
          <Figure label="Units awaiting a chip" value={data.untaggedUnits} />
        ) : null}
      </div>

      {data.shortfalls.length === 0 ? (
        <p className="px-4 pb-4 text-[12px] text-[var(--text-3)]">
          No consignment is short against its paperwork.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {data.shortfalls.map((s) => (
            <li
              key={s.batchId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="min-w-0">
                <Mono className="text-[11px]">{s.batchRef ?? s.batchId.slice(0, 10)}</Mono>
                <span className="ml-2 text-[12px] text-[var(--text-3)]">
                  {s.vendorName}
                </span>
              </span>
              <span className="tnum flex items-center gap-3 text-[12px]">
                <span className="text-[var(--text-3)]">
                  {formatNumber(s.registered)} of {formatNumber(s.declared)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--warning-dim)] px-1.5 py-0.5 font-medium text-[var(--warning)]">
                  −{formatNumber(s.shortfall)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function VendorLeaders({ data }: { data: NonNullable<SupplyMetrics["vendors"]> }) {
  type Leader = NonNullable<SupplyMetrics["vendors"]>["leaders"][number];

  const columns: Column<Leader>[] = [
    {
      key: "vendor",
      header: "Vendor",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
            {r.name}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
            {humanize(r.vendorType)}
          </p>
        </div>
      ),
    },
    {
      key: "batches",
      header: "Consignments",
      numeric: true,
      cell: (r) => formatNumber(r.batches),
    },
    {
      key: "accepted",
      header: "Rows accepted",
      numeric: true,
      cell: (r) => formatNumber(r.rowsAccepted),
    },
    {
      key: "rejected",
      header: "Rows rejected",
      numeric: true,
      cell: (r) => formatNumber(r.rowsRejected),
    },
    {
      key: "rate",
      header: "Rejection rate",
      numeric: true,
      cell: (r) => (
        <span
          className={
            Number(r.rejectionRate) >= 5
              ? "font-medium text-[var(--danger)]"
              : "text-[var(--text-2)]"
          }
        >
          {r.rejectionRate}%
        </span>
      ),
    },
  ];

  return (
    <Panel>
      <SectionHeader
        icon={Truck}
        title="Vendors"
        subtitle="Ranked by rows rejected, not by size — the list exists to surface the unreliable vendor, not the biggest one."
      />
      <div className="flex flex-wrap gap-6 px-4 pb-3">
        <Figure label="Active" value={data.active} />
        {Object.entries(data.byType).map(([type, count]) => (
          <Figure key={type} label={humanize(type)} value={count} />
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={data.leaders}
        getRowKey={(r) => r.vendorId}
        emptyState={
          <p className="px-4 py-6 text-center text-[12px] text-[var(--text-3)]">
            No vendor activity in this window.
          </p>
        }
      />
    </Panel>
  );
}

function LowStock({ rows }: { rows: NonNullable<SupplyMetrics["lowStock"]> }) {
  return (
    <Panel>
      <SectionHeader
        icon={TrendingDown}
        title="Low supply"
        subtitle="Drops within 10% of exhausting their unminted supply."
      />
      <Tooltip content="Remaining means supply that exists on paper but has no serialized unit yet. A drop whose units are all minted and all sold is not low on supply — it is sold out, which is a different screen.">
        <p className="cursor-help px-4 pb-2 text-[11px] text-[var(--text-3)]">
          What &ldquo;remaining&rdquo; counts
        </p>
      </Tooltip>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-[12px] text-[var(--text-3)]">
          No drop is close to exhausting its supply.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {rows.map((d) => (
            <li
              key={d.productId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="min-w-0">
                <p className="truncate text-[13px] text-[var(--text-1)]">{d.name}</p>
                <Mono className="text-[10px]">{d.groupCode}</Mono>
              </span>
              <span className="tnum flex items-center gap-3 text-[12px] text-[var(--text-3)]">
                {formatNumber(d.minted)} / {formatNumber(d.totalSupply)} minted
                <span className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--warning-dim)] px-1.5 py-0.5 font-medium text-[var(--warning)]">
                  {d.percentRemaining}% left
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
