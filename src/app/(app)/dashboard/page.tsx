"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Info,
  Layers,
  PackageSearch,
  ShieldQuestion,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useDashboard } from "@/lib/api/hooks";
import { formatCompact, formatNumber, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { IfCanOpen } from "@/components/layout/if-can-open";
import { useAuthz } from "@/components/layout/authz-provider";
import { FilterBar, type PeriodState } from "@/components/dashboard/filter-bar";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Badge,
  Button,
  Mono,
  Panel,
  PanelHeader,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import {
  CurrencyPicker,
  MoneyBreakdown,
  MoneyValue,
  currenciesIn,
} from "@/components/ui/money";
import {
  EmptyState,
  ErrorState,
  GridSkeleton,
  NotPermitted,
} from "@/components/ui/states";
import { PipelineBar, RankedBarChart, TrendChart } from "@/components/charts/charts";
import { SERIES, STATUS } from "@/components/charts/palette";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

export default function DashboardPage() {
  const [filters, setFilters] = React.useState<PeriodState>({ period: "month" });
  const { perms, loading: authzLoading } = useAuthz();

  const query = useDashboard({
    period: filters.period,
    from: filters.from,
    to: filters.to,
  });
  const d = query.data;

  usePageChrome({
    title: "Dashboard",
    description: "Everything your role is cleared to see, in one place.",
  });

  const currencies = React.useMemo(
    () =>
      currenciesIn(
        d?.summary.grossRevenue,
        d?.summary.netRevenue,
        d?.summary.profit,
        d?.finance?.royalties
      ),
    [d]
  );

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const loading = query.isLoading || authzLoading;

  // Technical roles hold no BUSINESS permission, so the API returns only
  // `period` and an empty `summary`. That is a correct response, not a failure.
  const technicalOnly =
    !loading && d && Object.keys(d.summary).length === 0 && perms.isTechnicalOnly;

  return (
    <>
      <FilterBar
        value={filters}
        onChange={setFilters}
        rangeLabel={d ? { from: d.period.from, to: d.period.to } : undefined}
      >
        {currencies.length > 1 ? <CurrencyPicker available={currencies} /> : null}
      </FilterBar>

      {loading ? (
        <div className="space-y-4">
          <GridSkeleton count={4} />
          <GridSkeleton count={2} />
        </div>
      ) : technicalOnly ? (
        <TechnicalRoleNotice />
      ) : (
        <div className="space-y-4 animate-fade-rise">
          <SummaryRow data={d!} />

          <DashboardBody data={d!} />

          {d!.activity ? (
            <Panel>
              <PanelHeader
                title="Recent activity"
                description="The 20 most recent audit events."
                action={
                  <IfCanOpen href="/activity">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/activity">
                      Full audit log
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                  </IfCanOpen>
                }
              />
              <ActivityFeed events={d!.activity} />
            </Panel>
          ) : null}

          <HiddenSections data={d!} />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lays out whatever panels this role actually got back.
 *
 * The 2:1 split only makes sense when both sides have something in them.
 * A role that receives two panels would otherwise leave two thirds of the
 * viewport empty — which reads as a broken page rather than a narrow
 * permission set, so the column count is derived from the content.
 */
function DashboardBody({
  data,
}: {
  data: NonNullable<ReturnType<typeof useDashboard>["data"]>;
}) {
  const primary = [
    <TrendPanels key="trends" data={data} />,
    <OperationsPanel key="ops" data={data} />,
    <MarketsPanel key="markets" data={data} />,
    <ProductsPanel key="products" data={data} />,
  ].filter((n) => React.isValidElement(n) && renders(n, data));

  const secondary = [
    <FinancePanel key="finance" data={data} />,
    <ProvenancePanel key="provenance" data={data} />,
    <ContentAndArtists key="catalogue" data={data} />,
    <GatewayPanel key="gateways" data={data} />,
  ].filter((n) => React.isValidElement(n) && renders(n, data));

  // Only one side has content: flow it into an even grid instead of a column.
  if (primary.length === 0 || secondary.length === 0) {
    const only = primary.length ? primary : secondary;
    if (only.length === 0) return null;
    return (
      <div
        className={cn(
          "grid gap-4",
          only.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
        )}
      >
        {only}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">{primary}</div>
      <div className="space-y-4">{secondary}</div>
    </div>
  );
}

/**
 * Whether a panel will render anything for this payload.
 *
 * Each panel already returns null when its section key is absent; this
 * mirrors that test one level up so the layout can count real panels
 * before committing to a column split.
 */
function renders(
  node: React.ReactElement,
  data: NonNullable<ReturnType<typeof useDashboard>["data"]>
): boolean {
  switch (node.key) {
    case "trends":
      return "orders" in data || (data.users?.trend.length ?? 0) > 0;
    case "ops":
      return "operations" in data;
    case "markets":
      return "markets" in data;
    case "products":
      return "products" in data;
    // Finance always renders: when the key is absent it shows why.
    case "finance":
      return true;
    case "provenance":
      return "provenance" in data;
    case "catalogue":
      return "content" in data || "artists" in data || "organizations" in data;
    case "gateways":
      return "paymentGatewayConfig" in data;
    default:
      return true;
  }
}

function SummaryRow({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const s = data.summary;
  const cards: React.ReactNode[] = [];

  // Each card exists only because its key is present in the payload.
  if ("totalUsers" in s) {
    cards.push(
      <StatCard
        key="users"
        label="Buyers"
        value={formatNumber(s.totalUsers)}
        growth={data.users?.growthPercentage}
        hint={`${formatNumber(s.newUsers)} new this period`}
        trend={data.users?.trend}
        trendKey="users"
      />
    );
  }
  if ("totalOrders" in s) {
    cards.push(
      <StatCard
        key="orders"
        label="Orders"
        value={formatNumber(s.totalOrders)}
        growth={data.orders?.growthPercentage}
        hint={`${formatNumber(s.newOrders)} new this period`}
        trend={data.orders?.trend}
        trendKey="orders"
      />
    );
  }
  if ("grossRevenue" in s) {
    cards.push(
      <StatCard
        key="gross"
        label="Gross revenue"
        value={<MoneyValue money={s.grossRevenue} size="lg" />}
        hint="Order value before collection"
      />
    );
  }
  if ("profit" in s) {
    cards.push(
      <StatCard
        key="profit"
        label="Profit"
        value={<MoneyValue money={s.profit} size="lg" />}
        hint="Net less COGS, fees and royalties"
      />
    );
  }
  if ("totalProducts" in s) {
    cards.push(
      <StatCard
        key="products"
        label="Drops"
        value={formatNumber(s.totalProducts)}
        hint={`${formatNumber(data.products?.active)} active drops`}
      />
    );
  }
  if ("adminUsers" in s && cards.length < 4) {
    cards.push(
      <StatCard
        key="admins"
        label="Admins"
        value={formatNumber(data.users?.totalAdmins)}
        hint={`${formatNumber(s.adminUsers)} added this period`}
      />
    );
  }

  if (cards.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={ShieldQuestion}
          title="No summary cards for your role"
          description="Your permissions do not cover any of the headline figures. The sections below show what you can see."
        />
      </Panel>
    );
  }

  // Size the row to the number of cards this role actually got. A single
  // card in a four-column grid leaves three quarters of the row empty.
  const shown = cards.slice(0, 4);
  const columns =
    {
      1: "grid-cols-1",
      2: "grid-cols-1 sm:grid-cols-2",
      3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
    }[shown.length] ?? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";

  return <div className={cn("grid gap-3", columns)}>{shown}</div>;
}

/* ------------------------------------------------------------------ */
/* Trends                                                              */
/* ------------------------------------------------------------------ */

function TrendPanels({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const hasOrders = "orders" in data;
  const hasUsers = "users" in data && (data.users?.trend.length ?? 0) > 0;

  if (!hasOrders && !hasUsers) return null;

  // Two charts sit side by side; one fills the row rather than leaving a hole.
  const both = hasOrders && hasUsers;

  return (
    <div className={cn("grid gap-4", both ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
      {hasOrders ? (
        <Panel>
          <PanelHeader
            title="Orders placed"
            description="Daily order count across the period."
          />
          <div className="p-3">
            <TrendChart
              data={data.orders!.trend}
              dataKey="orders"
              label="Orders"
              color={SERIES[0]}
            />
          </div>
        </Panel>
      ) : null}

      {hasUsers ? (
        <Panel>
          <PanelHeader
            title="New buyers"
            description="Daily buyer signups across the period."
          />
          <div className="p-3">
            <TrendChart
              data={data.users!.trend}
              dataKey="users"
              label="New buyers"
              color={SERIES[2]}
            />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

function OperationsPanel({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  if (!data.operations) return null;
  const o = data.operations;
  const orders = data.orders;

  const queues = [
    { label: "Pending payment", value: o.ordersPendingPayment, href: "/orders?status=PENDING_PAYMENT", tone: STATUS.warning },
    { label: "Processing", value: o.ordersProcessing, href: "/orders?status=PROCESSING", tone: STATUS.info },
    { label: "Awaiting shipment", value: o.ordersAwaitingShipment, href: "/orders?status=PAID", tone: STATUS.warning },
    { label: "Refunds to action", value: o.refundsAwaitingAction, href: "/orders", tone: STATUS.serious },
  ];

  return (
    <Panel>
      <PanelHeader
        title="Operations queue"
        description="What needs a human right now."
        action={
          <IfCanOpen href="/orders">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orders">
              Orders
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
          </IfCanOpen>
        }
      />

      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--hairline)] sm:grid-cols-4 sm:divide-y-0">
        {queues.map((q) => (
          <Link
            key={q.label}
            href={q.href}
            className="group px-4 py-3.5 transition-colors hover:bg-[var(--surface-2)]"
          >
            <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: q.tone }}
                aria-hidden
              />
              {q.label}
            </p>
            <p className="tnum mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
              {formatNumber(q.value)}
            </p>
          </Link>
        ))}
      </div>

      {/* paymentsNeedingReview appears only with payment-royalty:read */}
      {"paymentsNeedingReview" in o ? (
        <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-2.5">
          <CircleAlert className="h-3.5 w-3.5 text-[var(--danger)]" aria-hidden />
          <p className="text-[12px] text-[var(--text-2)]">
            <span className="tnum font-medium text-[var(--text-1)]">
              {formatNumber(o.paymentsNeedingReview)}
            </span>{" "}
            payments need manual review
          </p>
        </div>
      ) : null}

      {orders ? (
        <div className="border-t border-[var(--hairline)] px-4 py-3.5">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
            Order pipeline
          </p>
          <PipelineBar
            total={orders.total}
            segments={[
              { label: "Delivered", value: orders.delivered, color: STATUS.good },
              { label: "Shipped", value: orders.shipped, color: SERIES[0] },
              { label: "Processing", value: orders.processing, color: SERIES[5] },
              { label: "Paid", value: orders.paid, color: SERIES[2] },
              { label: "Pending payment", value: orders.pendingPayment, color: STATUS.warning },
              { label: "Cancelled", value: orders.cancelled, color: STATUS.neutral },
              { label: "Refunded", value: orders.refunded, color: STATUS.serious },
            ]}
          />
        </div>
      ) : null}

      {data.refunds ? (
        <div className="border-t border-[var(--hairline)] px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
              Refunds
            </p>
            {/* The canonical example: counts without the amount. */}
            {"amount" in data.refunds ? (
              <MoneyValue money={data.refunds.amount} size="sm" />
            ) : (
              <Tooltip content="Refund counts come with order:read. The refunded amount additionally requires payment-royalty:read.">
                <span className="cursor-help text-[11px] text-[var(--text-3)]">
                  amount restricted
                </span>
              </Tooltip>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-5">
            {[
              ["Requested", data.refunds.requested],
              ["Awaiting return", data.refunds.awaitingReturn],
              ["Approved", data.refunds.approved],
              ["Processed", data.refunds.processed],
              ["Rejected", data.refunds.rejected],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-[11px] text-[var(--text-3)]">{label}</dt>
                <dd className="tnum text-[14px] font-medium text-[var(--text-1)]">
                  {formatNumber(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

function FinancePanel({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  if (!data.finance) {
    return (
      <Panel className="p-4">
        <p className="mb-3 text-[13px] font-semibold text-[var(--text-1)]">Finance</p>
        <NotPermitted what="Revenue and margin" requires="payment-royalty:read" />
      </Panel>
    );
  }

  const f = data.finance;
  const lines: [string, typeof f.grossRevenue, string][] = [
    ["Gross revenue", f.grossRevenue, "Order value"],
    ["Collected", f.collectedRevenue, "Succeeded payments"],
    ["Refunded", f.refundedAmount, "Processed refunds"],
    ["Net revenue", f.netRevenue, "Collected less refunded"],
    ["Cost of goods", f.costOfGoods, ""],
    ["Gateway fees", f.gatewayFees, ""],
    ["Royalties", f.royalties, ""],
  ];

  return (
    <Panel>
      <PanelHeader
        title="Finance"
        description="Per currency — figures are never summed across them."
        action={
          <IfCanOpen href="/finance">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/finance">
              Detail
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
          </IfCanOpen>
        }
      />
      <div className="divide-y divide-[var(--hairline)]">
        {lines.map(([label, money, note]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5">
            <div>
              <p className="text-[12px] text-[var(--text-2)]">{label}</p>
              {note ? (
                <p className="text-[11px] text-[var(--text-3)]">{note}</p>
              ) : null}
            </div>
            <MoneyValue money={money} size="sm" className="shrink-0" />
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
          Profit
        </p>
        <MoneyBreakdown money={f.profit} />
      </div>

      {data.payments ? (
        <div className="border-t border-[var(--hairline)] px-4 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
            Payments
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="positive" dot>
              {formatNumber(data.payments.successful)} succeeded
            </Badge>
            <Badge tone="warning" dot>
              {formatNumber(data.payments.pending)} pending
            </Badge>
            <Badge tone="danger" dot>
              {formatNumber(data.payments.failed)} failed
            </Badge>
            {data.payments.needsReview > 0 ? (
              <Badge tone="danger" outline>
                {formatNumber(data.payments.needsReview)} need review
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Markets                                                             */
/* ------------------------------------------------------------------ */

function MarketsPanel({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  if (!data.markets) return null;
  if (data.markets.length === 0) {
    return (
      <Panel>
        <PanelHeader title="Markets" />
        <EmptyState title="No market activity in this window" />
      </Panel>
    );
  }

  const hasOrders = data.markets.some((m) => m.orders > 0);
  const chartData = data.markets.map((m) => ({
    name: m.name,
    value: hasOrders ? m.orders : m.users,
  }));

  return (
    <Panel>
      <PanelHeader
        title="Markets"
        description={hasOrders ? "Orders by market" : "Buyers by market"}
        action={
          <IfCanOpen href="/markets">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/markets">
              All markets
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
          </IfCanOpen>
        }
      />
      <div className="p-3">
        <RankedBarChart
          data={chartData}
          valueLabel={hasOrders ? "Orders" : "Buyers"}
          height={Math.max(140, chartData.length * 34)}
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

function ProductsPanel({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  if (!data.products) return null;
  const p = data.products;

  const states: [string, number][] = [
    ["Draft", p.draft],
    ["Submitted", p.submitted],
    ["In review", p.inReview],
    ["Approved", p.approved],
    ["Rejected", p.rejected],
    ["Published", p.published],
    ["Active", p.active],
    ["Ended", p.ended],
    ["Archived", p.archived],
  ];

  return (
    <Panel>
      <PanelHeader
        title="Drops"
        description={`${formatNumber(p.total)} products · ${formatNumber(p.new)} new this period`}
        action={
          <IfCanOpen href="/products">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/products">
              Catalog
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
          </IfCanOpen>
        }
      />

      <div className="flex flex-wrap gap-1.5 border-b border-[var(--hairline)] px-4 py-3">
        {states.map(([label, count]) => (
          <Badge key={label} tone={toneForStatus(label.toUpperCase().replace(" ", "_"))}>
            {label} <span className="tnum ml-0.5 opacity-70">{formatNumber(count)}</span>
          </Badge>
        ))}
      </div>

      <div className="px-4 py-3">
        <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
          <PackageSearch className="h-3 w-3" aria-hidden />
          Inventory preview
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--hairline)] text-[10px] uppercase tracking-[0.04em] text-[var(--text-3)]">
                <th className="py-1.5 text-left font-medium">Drop</th>
                <th className="py-1.5 text-right font-medium">Supply</th>
                <th className="py-1.5 text-right font-medium">Sold</th>
                <th className="py-1.5 text-right font-medium">Reserved</th>
                <th className="py-1.5 text-right font-medium">Available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {p.inventory.slice(0, 6).map((row) => {
                const tight = row.available / Math.max(row.totalSupply, 1) < 0.1;
                return (
                  <tr key={row.productId}>
                    <td className="max-w-[220px] truncate py-2 pr-3 text-[var(--text-1)]">
                      {row.name}
                    </td>
                    <td className="tnum py-2 text-right text-[var(--text-2)]">
                      {formatNumber(row.totalSupply)}
                    </td>
                    <td className="tnum py-2 text-right text-[var(--text-2)]">
                      {formatNumber(row.sold)}
                    </td>
                    <td className="tnum py-2 text-right text-[var(--text-3)]">
                      {formatNumber(row.reserved + row.committed)}
                    </td>
                    <td
                      className={`tnum py-2 text-right font-medium ${
                        tight ? "text-[var(--warning)]" : "text-[var(--text-1)]"
                      }`}
                    >
                      {formatNumber(row.available)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

function ProvenancePanel({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  if (!data.provenance) return null;
  const p = data.provenance;
  const totalTags = Object.values(p.claimed).reduce((a, b) => a + b, 0);

  return (
    <Panel>
      <PanelHeader
        title="Provenance"
        description="Tag claims and open cases."
        action={
          <IfCanOpen href="/provenance">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/provenance">
              Cases
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
          </IfCanOpen>
        }
      />
      <div className="space-y-3.5 px-4 py-3.5">
        <PipelineBar
          total={totalTags}
          segments={[
            { label: "Claimed", value: p.claimed.CLAIMED ?? 0, color: STATUS.good },
            { label: "Unclaimed", value: p.claimed.UNCLAIMED ?? 0, color: STATUS.neutral },
            { label: "Flagged", value: p.claimed.FLAGGED ?? 0, color: STATUS.serious },
          ]}
        />

        <div className="grid grid-cols-2 gap-3 border-t border-[var(--hairline)] pt-3">
          <div>
            <p className="text-[11px] text-[var(--text-3)]">Resale blocked</p>
            <p className="tnum text-[16px] font-semibold text-[var(--text-1)]">
              {formatNumber(p.resaleBlocked)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--text-3)]">Tampered</p>
            <p className="tnum text-[16px] font-semibold text-[var(--danger)]">
              {formatNumber(p.tampered)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-[var(--hairline)] pt-3">
          {Object.entries(p.cases).map(([status, count]) => (
            <Badge key={status} tone={toneForStatus(status)} dot>
              {humanize(status)} {formatNumber(count)}
            </Badge>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Content, artists, organizations                                     */
/* ------------------------------------------------------------------ */

function ContentAndArtists({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  if (!data.content && !data.artists && !data.organizations) return null;

  return (
    <Panel>
      <PanelHeader title="Catalogue" />
      <div className="divide-y divide-[var(--hairline)]">
        {data.content ? (
          <div className="px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
              Content bundles
            </p>
            <div className="grid grid-cols-2 gap-y-2">
              <Figure label="Active" value={formatNumber(data.content.activeBundles)} />
              <Figure label="Total" value={formatNumber(data.content.totalBundles)} />
              <Figure label="Unlocks" value={formatCompact(data.content.unlocksThisPeriod)} />
              <Figure label="Avg. access" value={data.content.avgAccessCount.toFixed(1)} />
            </div>
          </div>
        ) : null}

        {data.artists ? (
          <div className="px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
              Artists
            </p>
            <div className="grid grid-cols-2 gap-y-2">
              <Figure label="Total" value={formatNumber(data.artists.total)} />
              <Figure label="Active" value={formatNumber(data.artists.active)} />
              <Figure label="Public" value={formatNumber(data.artists.public)} />
              <Figure label="New" value={formatNumber(data.artists.new)} />
            </div>
          </div>
        ) : null}

        {data.organizations ? (
          <div className="px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
              Organizations
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.organizations.byType).map(([type, count]) => (
                <Badge key={type} tone="neutral">
                  {humanize(type)} <span className="tnum ml-0.5 opacity-70">{count}</span>
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-3)]">{label}</p>
      <p className="tnum text-[15px] font-medium text-[var(--text-1)]">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gateways                                                            */
/* ------------------------------------------------------------------ */

function GatewayPanel({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  if (!data.paymentGatewayConfig) return null;

  return (
    <Panel>
      <PanelHeader
        title="Payment gateways"
        description="Credentials are never returned by the API."
      />
      <div className="divide-y divide-[var(--hairline)]">
        {data.paymentGatewayConfig.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-1)]">
                {humanize(g.gateway)}
                {g.isDefault ? (
                  <Badge tone="accent" className="px-1 py-0 text-[10px]">
                    default
                  </Badge>
                ) : null}
              </p>
              <p className="text-[11px] text-[var(--text-3)]">
                {humanize(g.scope)}
                {g.organizationId ? " · org-scoped" : ""}
              </p>
            </div>
            <Badge tone={toneForStatus(g.status)} dot>
              {humanize(g.status)}
            </Badge>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Transparency: what was omitted                                      */
/* ------------------------------------------------------------------ */

const SECTION_LABELS: Record<string, { label: string; requires: string }> = {
  users: { label: "Buyers", requires: "buyer-profile:read" },
  orders: { label: "Orders", requires: "order:read" },
  finance: { label: "Finance", requires: "payment-royalty:read" },
  payments: { label: "Payments", requires: "payment-royalty:read" },
  refunds: { label: "Refunds", requires: "order:read" },
  markets: { label: "Markets", requires: "reports-dashboards:read" },
  products: { label: "Drops", requires: "drop:read" },
  content: { label: "Content", requires: "content-unlock:read" },
  artists: { label: "Artists", requires: "brand-artist-record:read" },
  organizations: { label: "Organizations", requires: "brand-artist-record:read" },
  operations: { label: "Operations", requires: "order:read" },
  provenance: { label: "Provenance", requires: "nfc-tag-claim:read" },
  paymentGatewayConfig: { label: "Payment gateways", requires: "payment-royalty:read" },
  activity: { label: "Audit log", requires: "audit-log:read" },
};

/**
 * States plainly which sections the backend withheld.
 *
 * Without this an operator cannot tell "there is no revenue" from "you may
 * not see revenue" — the exact confusion the omit-the-key design creates.
 */
function HiddenSections({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const missing = Object.entries(SECTION_LABELS).filter(
    ([key]) => !(key in data)
  );

  if (missing.length === 0) return null;

  return (
    <Panel className="border-dashed">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
        <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-2)]">
            {missing.length} section{missing.length === 1 ? "" : "s"} withheld from
            this response
            <Tooltip content="These keys are absent from the payload, which means your role may not see them at all. It does not mean the underlying figures are zero.">
              <Info className="h-3 w-3 cursor-help text-[var(--text-3)]" />
            </Tooltip>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missing.map(([key, { label, requires }]) => (
              <Tooltip key={key} content={`Requires ${requires}`}>
                <span>
                  <Badge tone="neutral" outline className="cursor-help">
                    {label}
                  </Badge>
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function TechnicalRoleNotice() {
  return (
    <Panel>
      <EmptyState
        icon={ShieldQuestion}
        title="This dashboard is a business-domain surface"
        description="Your role holds only TECHNICAL-domain permissions, so the API returns a period and an empty summary. Platform configuration and service health belong to a separate ops console — mixing them here would cross the domain boundary the backend enforces."
        action={
          <div className="flex flex-col items-center gap-2">
            <Mono>platform-config · service-health · feature-flag</Mono>
          </div>
        }
      />
    </Panel>
  );
}
