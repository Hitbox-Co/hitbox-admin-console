import { Permissions } from "../authz";
import type {
  ActivityEvent,
  AdminUserRow,
  DashboardResponse,
  DashboardSummary,
  DemandSignalRow,
  MarketRow,
  MediaAsset,
  MediaListResponse,
  Money,
  OrderRow,
  Paginated,
  Period,
  PeriodInfo,
  ProductRow,
  ProvenanceCaseRow,
  ProvenanceListResponse,
  ReleaseApprovalRow,
  ResaleListResponse,
  ResaleRow,
  SupplyListResponse,
  SupplyRow,
} from "../types";

/**
 * Deterministic demo data shaped exactly like the real API responses,
 * including the permission gating: a section the caller cannot see is
 * deleted from the payload rather than zeroed out.
 */

/* ---------- deterministic pseudo-random ---------- */

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function between(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/* ---------- period ---------- */

export function resolvePeriod(
  type: Period,
  from?: string | null,
  to?: string | null
): PeriodInfo {
  const now = new Date("2026-09-12T00:00:00.000Z");
  if (type === "custom" && from && to) {
    return { type, from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  }
  const start = new Date(now);
  if (type === "week") start.setUTCDate(start.getUTCDate() - 7);
  else if (type === "year") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else start.setUTCMonth(start.getUTCMonth() - 1);
  return { type, from: start.toISOString(), to: now.toISOString() };
}

function daysBetween(p: PeriodInfo): string[] {
  const out: string[] = [];
  const start = new Date(p.from);
  const end = new Date(p.to);
  const total = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000)
  );
  const step = total > 90 ? Math.ceil(total / 60) : 1;
  for (let i = 0; i < total; i += step) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/* ---------- fixtures ---------- */

export const MARKETS = [
  { marketId: "5a9e0001-0000-4000-8000-000000000001", code: "IN", name: "India", currency: "INR" },
  { marketId: "5a9e0002-0000-4000-8000-000000000002", code: "US", name: "United States", currency: "USD" },
  { marketId: "5a9e0003-0000-4000-8000-000000000003", code: "GB", name: "United Kingdom", currency: "GBP" },
  { marketId: "5a9e0004-0000-4000-8000-000000000004", code: "JP", name: "Japan", currency: "JPY" },
];

export const ORGANIZATIONS = [
  { id: "org-1000-0000-4000-8000-000000000001", name: "Nocturne Athletics", type: "BRAND" },
  { id: "org-1000-0000-4000-8000-000000000002", name: "Vantablack Studio", type: "BRAND" },
  { id: "org-1000-0000-4000-8000-000000000003", name: "Kite & Ash", type: "BRAND" },
  { id: "org-1000-0000-4000-8000-000000000004", name: "Rei Tanaka", type: "ARTIST_INDIVIDUAL" },
  { id: "org-1000-0000-4000-8000-000000000005", name: "HitBox Collectibles", type: "HITBOX" },
];

const PRODUCT_NAMES = [
  "Neon Drift #002",
  "Halcyon Bomber",
  "Static Bloom Tee",
  "Midnight Runner LX",
  "Paper Lantern Hoodie",
  "Chrome Meridian Cap",
  "Vantablack Field Jacket",
  "Ash Wanderer Boot",
  "Solstice Knit",
  "Ghost Weave Scarf",
  "Ember Track Pant",
  "Cobalt Signal Vest",
];

const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

const DROP_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "ACTIVE",
  "ENDED",
  "ARCHIVED",
];

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function buildDashboard(
  perms: Permissions,
  period: PeriodInfo,
  filters: { organizationId?: string; marketId?: string } = {}
): DashboardResponse {
  const rng = makeRng(
    period.from.length + period.type.length * 31 + (filters.marketId ? 7 : 0)
  );
  const scale = filters.marketId ? 0.28 : filters.organizationId ? 0.4 : 1;
  const s = (n: number) => Math.max(1, Math.round(n * scale));

  const canUsers = perms.canRead("buyer-profile");
  const canAdmins = perms.canRead("employee-role-mgmt");
  const canOrders = perms.canRead("order");
  const canMoney = perms.canRead("payment-royalty");
  const canDrops = perms.canRead("drop");
  const canContent = perms.canRead("content-unlock");
  const canBrands = perms.canRead("brand-artist-record");
  const canReports = perms.canRead("reports-dashboards");
  const canProvenance =
    perms.canRead("nfc-tag-claim") || perms.canRead("collectible-instance");
  const canAudit = perms.canRead("audit-log");

  const days = daysBetween(period);

  const res: DashboardResponse = { period, summary: {} };
  const summary: DashboardSummary = {};

  /* ---- users ---- */
  if (canUsers || canAdmins) {
    const total = s(48213);
    const fresh = s(1284);
    const section: NonNullable<DashboardResponse["users"]> = {
      total,
      new: fresh,
      active: Math.round(total * 0.956),
      inactive: total - Math.round(total * 0.956),
      growthPercentage: 12.4,
      trend: days.map((date) => ({ date, users: s(between(rng, 22, 58)) })),
      byMarket: MARKETS.map((m, i) => ({
        marketId: m.marketId,
        code: m.code,
        name: m.name,
        users: s([21032, 16840, 6420, 3921][i]),
        newUsers: s([640, 401, 152, 91][i]),
      })),
    };
    if (canAdmins) {
      section.newAdmins = 23;
      section.totalAdmins = 142;
    }
    // Only expose the buyer half when buyer-profile:read is held.
    if (!canUsers) {
      section.total = 0;
      section.new = 0;
      section.active = 0;
      section.inactive = 0;
      section.trend = [];
      section.byMarket = [];
    }
    res.users = section;
    if (canUsers) {
      summary.totalUsers = total;
      summary.newUsers = fresh;
    }
    if (canAdmins) summary.adminUsers = 23;
  }

  /* ---- orders ---- */
  if (canOrders) {
    const total = s(18420);
    const fresh = s(640);
    res.orders = {
      total,
      new: fresh,
      growthPercentage: 8.1,
      pendingPayment: s(84),
      paid: s(120),
      processing: s(210),
      shipped: s(340),
      delivered: s(17400),
      cancelled: s(220),
      refunded: s(166),
      trend: days.map((date) => ({ date, orders: s(between(rng, 12, 34)) })),
      byMarket: MARKETS.map((m, i) => ({
        marketId: m.marketId,
        orders: s([8200, 6100, 2600, 1520][i]),
        newOrders: s([310, 201, 82, 47][i]),
      })),
    };
    summary.totalOrders = total;
    summary.newOrders = fresh;
  }

  /* ---- finance & payments ---- */
  if (canMoney) {
    const m = (usd: number, inr: number, gbp: number) => ({
      USD: (usd * scale).toFixed(2),
      INR: (inr * scale).toFixed(2),
      GBP: (gbp * scale).toFixed(2),
    });
    res.finance = {
      grossRevenue: m(84210, 1980000, 9120),
      collectedRevenue: m(81900, 1925400, 8870),
      refundedAmount: m(3200, 74800, 340),
      netRevenue: m(78700, 1850600, 8530),
      costOfGoods: m(34200, 806400, 3710),
      gatewayFees: m(2380, 55900, 258),
      royalties: m(19010, 447200, 2060),
      profit: m(23110, 541100, 2502),
    };
    res.payments = {
      successful: s(612),
      pending: s(14),
      initiated: s(3),
      failed: s(9),
      needsReview: s(5),
      amount: m(81900, 1925400, 8870),
    };
    summary.grossRevenue = res.finance.grossRevenue;
    summary.netRevenue = res.finance.netRevenue;
    summary.refunds = res.finance.refundedAmount;
    summary.profit = res.finance.profit;

    res.paymentGatewayConfig = [
      {
        id: "gc-1000-0000-4000-8000-000000000001",
        scope: "PLATFORM",
        gateway: "STRIPE",
        isDefault: true,
        status: "ACTIVE",
        organizationId: null,
        createdAt: "2026-01-10T09:00:00.000Z",
        updatedAt: "2026-08-02T12:30:00.000Z",
      },
      {
        id: "gc-1000-0000-4000-8000-000000000002",
        scope: "PLATFORM",
        gateway: "RAZORPAY",
        isDefault: false,
        status: "ACTIVE",
        organizationId: null,
        createdAt: "2026-02-14T09:00:00.000Z",
        updatedAt: "2026-07-19T15:05:00.000Z",
      },
      {
        id: "gc-1000-0000-4000-8000-000000000003",
        scope: "ORGANIZATION",
        gateway: "ADYEN",
        isDefault: false,
        status: "SUSPENDED",
        organizationId: ORGANIZATIONS[0].id,
        createdAt: "2026-04-01T09:00:00.000Z",
        updatedAt: "2026-09-04T08:00:00.000Z",
      },
    ];
  }

  /* ---- refunds: counts on order:read, amount only with payment-royalty:read ---- */
  if (canOrders) {
    res.refunds = {
      requested: s(210),
      awaitingReturn: s(12),
      approved: s(30),
      processed: s(166),
      rejected: s(14),
    };
    if (canMoney) {
      res.refunds.amount = {
        USD: (3200 * scale).toFixed(2),
        INR: (74800 * scale).toFixed(2),
        GBP: (340 * scale).toFixed(2),
      };
    }
  }

  /* ---- markets: a re-slice of data already visible ---- */
  if (canReports && (canOrders || canUsers)) {
    res.markets = MARKETS.map((mk, i): MarketRow => {
      const row: MarketRow = {
        marketId: mk.marketId,
        code: mk.code,
        name: mk.name,
        currency: mk.currency,
        users: canUsers ? s([21032, 16840, 6420, 3921][i]) : 0,
        newUsers: canUsers ? s([640, 401, 152, 91][i]) : 0,
        orders: canOrders ? s([8200, 6100, 2600, 1520][i]) : 0,
        newOrders: canOrders ? s([310, 201, 82, 47][i]) : 0,
      };
      if (canMoney) {
        const amounts: Money[] = [
          { INR: (1980000 * scale).toFixed(2) },
          { USD: (52400 * scale).toFixed(2) },
          { GBP: (9120 * scale).toFixed(2) },
          { JPY: (1140000 * scale).toFixed(0) },
        ];
        row.revenue = amounts[i];
      }
      return row;
    });
  }

  /* ---- products ---- */
  if (canDrops) {
    const total = s(340);
    res.products = {
      total,
      new: s(12),
      draft: s(12),
      submitted: s(4),
      inReview: s(3),
      approved: s(6),
      rejected: s(2),
      published: s(40),
      active: s(210),
      ended: s(55),
      archived: s(8),
      inventory: PRODUCT_NAMES.slice(0, 10).map((name, i) => {
        const totalSupply = [500, 250, 1200, 300, 800, 450, 120, 260, 640, 900][i];
        const claimed = Math.round(totalSupply * (0.42 + rng() * 0.4));
        const sold = Math.round(claimed * (0.9 + rng() * 0.1));
        const reserved = between(rng, 4, 26);
        const committed = between(rng, 2, 18);
        return {
          productId: `p-99${String(i).padStart(2, "0")}-0000-4000-8000-00000000000${i}`,
          name,
          totalSupply,
          reserved,
          committed,
          claimed,
          sold,
          available: Math.max(0, totalSupply - sold - reserved - committed),
        };
      }),
    };
    summary.totalProducts = total;
  }

  if (canContent) {
    res.content = {
      totalBundles: s(88),
      activeBundles: s(74),
      newBundles: s(6),
      unlocksThisPeriod: s(1420),
      avgAccessCount: 3.2,
    };
  }

  if (canBrands) {
    res.artists = { total: s(512), active: s(470), new: s(8), public: s(390) };
    res.organizations = {
      total: s(42),
      byType: { BRAND: s(38), ARTIST_INDIVIDUAL: s(3), HITBOX: 1 },
    };
  }

  /* ---- operations ---- */
  if (canOrders) {
    res.operations = {
      ordersPendingPayment: s(84),
      ordersProcessing: s(210),
      ordersAwaitingShipment: s(96),
      ordersShipped: s(340),
      ordersDelivered: s(17400),
      refundsAwaitingAction: s(42),
    };
    if (canMoney) res.operations.paymentsNeedingReview = s(5);
  }

  if (canProvenance) {
    res.provenance = {
      claimed: { UNCLAIMED: s(4200), CLAIMED: s(12800), FLAGGED: s(6) },
      lifecycle: { BOUND: s(4200), ACTIVE: s(12800), DISPUTED: s(3) },
      resaleBlocked: s(14),
      tampered: s(3),
      cases: { OPEN: s(12), INVESTIGATING: s(4), RESOLVED: s(210) },
    };
  }

  if (canAudit) {
    res.activity = buildActivity(20, canMoney);
  }

  res.summary = summary;
  return res;
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

const EVENT_TYPES: [string, string, string][] = [
  ["order.refund.approved", "RefundRequest", "HITBOX_FINANCE_ADMIN"],
  ["order.status.changed", "Order", "HITBOX_ORDER_MANAGER"],
  ["drop.published", "Product", "HITBOX_DROP_MANAGER"],
  ["release.approved", "ReleaseApproval", "HITBOX_COMPLIANCE_OFFICER"],
  ["authz.role.assigned", "RoleAssignment", "HITBOX_SYSTEM_ADMIN"],
  ["authz.role.revoked", "RoleAssignment", "HITBOX_SYSTEM_ADMIN"],
  ["media.asset.uploaded", "MediaAsset", "HITBOX_CONTENT_MANAGER"],
  ["provenance.case.opened", "SupportCase", "HITBOX_SUPPORT"],
  ["provenance.case.resolved", "SupportCase", "HITBOX_SUPPORT"],
  ["payment.gateway.updated", "PaymentGatewayConfig", "HITBOX_FINANCE_ADMIN"],
  ["buyer.profile.updated", "BuyerProfile", "HITBOX_ORDER_MANAGER"],
  ["drop.inventory.adjusted", "Product", "BRAND_ADMIN"],
];

export function buildActivity(count: number, includeFinance = true): ActivityEvent[] {
  const rng = makeRng(count * 977 + 13);
  const pool = includeFinance
    ? EVENT_TYPES
    : EVENT_TYPES.filter(([, r]) => r !== "PaymentGatewayConfig");
  const base = new Date("2026-09-11T14:02:00.000Z").getTime();
  return Array.from({ length: count }, (_, i) => {
    const [type, resourceType, role] = pick(rng, pool);
    const severity =
      type.includes("revoked") || type.includes("case.opened")
        ? "WARNING"
        : type.includes("gateway")
          ? "CRITICAL"
          : "INFO";
    return {
      eventId: `e${String(i).padStart(3, "0")}a-0000-4000-8000-${String(i).padStart(12, "0")}`,
      occurredAt: new Date(base - i * between(rng, 12, 240) * 60_000).toISOString(),
      type,
      actorId: `u-${String(700 + (i % 17)).padStart(3, "0")}f21…`,
      actorRoleSnapshot: role,
      resourceType,
      resourceId: `${resourceType.slice(0, 2).toLowerCase()}-${String(400 + i).padStart(3, "0")}…`,
      actionResult: rng() > 0.06 ? "SUCCESS" : "FAILURE",
      severity,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Paginated collections                                               */
/* ------------------------------------------------------------------ */

function paginate<T>(items: T[], page: number, limit: number): Paginated<T> {
  const start = (page - 1) * limit;
  return {
    page,
    limit,
    total: items.length,
    items: items.slice(start, start + limit),
  };
}

export function buildOrders(
  perms: Permissions,
  opts: { page: number; limit: number; status?: string; marketId?: string }
): Paginated<OrderRow> {
  const rng = makeRng(4242);
  const canMoney = perms.canRead("payment-royalty");
  const canBuyer = perms.canRead("buyer-profile");
  const full = perms.widestScope("buyer-profile") === "global";

  let all: OrderRow[] = Array.from({ length: 240 }, (_, i) => {
    const status = pick(rng, ORDER_STATUSES);
    const market = pick(rng, MARKETS);
    const placed = new Date(
      Date.parse("2026-09-11T00:00:00.000Z") - between(rng, 0, 45) * 86_400_000
    );
    const shipped =
      ["SHIPPED", "DELIVERED"].includes(status)
        ? new Date(placed.getTime() + 2 * 86_400_000)
        : null;
    const delivered =
      status === "DELIVERED" ? new Date(placed.getTime() + 5 * 86_400_000) : null;

    const row: OrderRow = {
      id: `o-${String(1000 + i)}-0000-4000-8000-${String(i).padStart(12, "0")}`,
      status,
      quantity: between(rng, 1, 3),
      marketId: market.marketId,
      organizationId: pick(rng, ORGANIZATIONS).id,
      productId: `p-99${String(i % 12).padStart(2, "0")}…`,
      skuId: `sku-${402 + (i % 40)}…`,
      placedAt: placed.toISOString(),
      shippedAt: shipped ? shipped.toISOString() : null,
      deliveredAt: delivered ? delivered.toISOString() : null,
    };
    if (canMoney) {
      row.amount = (between(rng, 39, 480) + 0.0).toFixed(2);
      row.currency = market.currency;
    }
    if (canBuyer) {
      const uuid = `3f2a9b${String(i).padStart(2, "0")}-1c4d-4e5f-8a9b-0c1d2e3f4a5b`;
      row.buyerId = full ? uuid : `${uuid.slice(0, 8)}…`;
    }
    return row;
  });

  if (opts.status) all = all.filter((o) => o.status === opts.status);
  if (opts.marketId) all = all.filter((o) => o.marketId === opts.marketId);
  all.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  return paginate(all, opts.page, opts.limit);
}

export function buildProducts(opts: {
  page: number;
  limit: number;
  status?: string;
}): Paginated<ProductRow> {
  const rng = makeRng(818);
  let all: ProductRow[] = Array.from({ length: 96 }, (_, i) => {
    const totalSupply = between(rng, 80, 1400);
    const sold = Math.round(totalSupply * rng() * 0.85);
    return {
      id: `p-99${String(i).padStart(2, "0")}-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `${PRODUCT_NAMES[i % PRODUCT_NAMES.length]}${i >= 12 ? ` v${Math.floor(i / 12) + 1}` : ""}`,
      status: pick(rng, DROP_STATUSES),
      organizationId: pick(rng, ORGANIZATIONS).id,
      totalSupply,
      sold,
      available: totalSupply - sold,
      createdAt: new Date(
        Date.parse("2026-09-01T00:00:00.000Z") - between(rng, 0, 300) * 86_400_000
      ).toISOString(),
    };
  });
  if (opts.status) all = all.filter((p) => p.status === opts.status);
  return paginate(all, opts.page, opts.limit);
}

export function buildReleaseApprovals(opts: {
  page: number;
  limit: number;
  status?: string;
}): Paginated<ReleaseApprovalRow> {
  const rng = makeRng(5150);
  const statuses = ["PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"];
  let all: ReleaseApprovalRow[] = Array.from({ length: 34 }, (_, i) => {
    const status = i < 9 ? "PENDING" : pick(rng, statuses);
    const ageSpecific = rng() > 0.7;
    return {
      id: `ra-${String(1000 + i)}…`,
      productId: `p-99${String(i % 12).padStart(2, "0")}…`,
      status,
      version: between(rng, 1, 4),
      comment:
        status === "REJECTED" ? "Odds disclosure missing for a chance-based drop." : null,
      complianceStatus:
        status === "APPROVED" ? "CLEARED" : status === "REJECTED" ? "BLOCKED" : "PENDING",
      oddsDisclosureRef: rng() > 0.5 ? `odds-${2000 + i}.pdf` : null,
      decidedAt:
        status === "PENDING"
          ? null
          : new Date(
              Date.parse("2026-09-09T00:00:00.000Z") - between(rng, 1, 30) * 86_400_000
            ).toISOString(),
      createdAt: new Date(
        Date.parse("2026-09-08T10:00:00.000Z") - between(rng, 1, 40) * 86_400_000
      ).toISOString(),
      product: {
        name: PRODUCT_NAMES[i % PRODUCT_NAMES.length],
        isAgeSpecific: ageSpecific,
        minimumAge: ageSpecific ? pick(rng, [16, 18, 21]) : null,
        status: status === "APPROVED" ? "APPROVED" : "SUBMITTED",
      },
    };
  });
  if (opts.status) all = all.filter((r) => r.status === opts.status);
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginate(all, opts.page, opts.limit);
}

export function buildProvenance(opts: {
  page: number;
  limit: number;
  status?: string;
  caseType?: string;
}): ProvenanceListResponse {
  const rng = makeRng(3371);
  const caseTypes = ["CLONED", "TAMPERED", "STOLEN", "DISPUTED_OWNERSHIP", "COUNTERFEIT"];
  const statuses = ["OPEN", "INVESTIGATING", "RESOLVED"];
  let all: ProvenanceCaseRow[] = Array.from({ length: 58 }, (_, i) => {
    const status = i < 12 ? "OPEN" : i < 18 ? "INVESTIGATING" : pick(rng, statuses);
    const caseType = pick(rng, caseTypes);
    return {
      id: `sc-${String(100 + i)}…`,
      caseType,
      status,
      tagId: `04A2${String(i).padStart(2, "0")}FE`,
      skuId: `sku-${402 + (i % 40)}…`,
      reporterId: `u-${String(500 + i).padStart(3, "0")}f21…`,
      description:
        caseType === "CLONED"
          ? "Duplicate tag counter observed on two separate reads within 40 minutes."
          : caseType === "TAMPERED"
            ? "Counter regression detected on scan; enclosure seal reported broken."
            : "Buyer reports the collectible was not the one shipped.",
      resolvedAt:
        status === "RESOLVED"
          ? new Date(
              Date.parse("2026-09-09T00:00:00.000Z") - between(rng, 1, 20) * 86_400_000
            ).toISOString()
          : null,
      createdAt: new Date(
        Date.parse("2026-09-09T08:30:00.000Z") - between(rng, 0, 60) * 86_400_000
      ).toISOString(),
      sku: {
        tagLifecycleState: status === "RESOLVED" ? "ACTIVE" : "DISPUTED",
        tamperStatus: caseType === "TAMPERED" ? "counter_regression" : null,
        claimedStatus: status === "RESOLVED" ? "CLAIMED" : "FLAGGED",
      },
    };
  });
  const summary = {
    OPEN: all.filter((c) => c.status === "OPEN").length,
    INVESTIGATING: all.filter((c) => c.status === "INVESTIGATING").length,
    RESOLVED: all.filter((c) => c.status === "RESOLVED").length,
  };
  if (opts.status) all = all.filter((c) => c.status === opts.status);
  if (opts.caseType) all = all.filter((c) => c.caseType === opts.caseType);
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ...paginate(all, opts.page, opts.limit), summary };
}

export function buildSupply(opts: {
  page: number;
  limit: number;
  vendorId?: string;
}): SupplyListResponse {
  const rng = makeRng(9090);
  const vendors = [
    { id: "v-001", name: "Meridian Knitworks" },
    { id: "v-002", name: "Kobe Leather Co." },
    { id: "v-003", name: "Tallinn Print House" },
    { id: "v-004", name: "Ashgrove Textiles" },
  ];
  const statuses = ["ORDERED", "IN_TRANSIT", "RECEIVED", "PARTIAL", "DELAYED"];
  let all: SupplyRow[] = Array.from({ length: 42 }, (_, i) => {
    const v = vendors[i % vendors.length];
    const status = pick(rng, statuses);
    const ordered = between(rng, 100, 1500);
    return {
      id: `po-${String(3000 + i)}…`,
      vendorId: v.id,
      vendorName: v.name,
      productId: `p-99${String(i % 12).padStart(2, "0")}…`,
      productName: PRODUCT_NAMES[i % PRODUCT_NAMES.length],
      status,
      quantityOrdered: ordered,
      quantityReceived:
        status === "RECEIVED" ? ordered : status === "PARTIAL" ? Math.round(ordered * 0.6) : 0,
      expectedAt:
        status === "RECEIVED"
          ? null
          : new Date(
              Date.parse("2026-09-11T00:00:00.000Z") + between(rng, 3, 60) * 86_400_000
            ).toISOString(),
    };
  });
  if (opts.vendorId) all = all.filter((r) => r.vendorId === opts.vendorId);
  return { ...paginate(all, opts.page, opts.limit), activeVendors: vendors.length };
}

export function buildResale(
  perms: Permissions,
  opts: { page: number; limit: number; status?: string }
): ResaleListResponse {
  const rng = makeRng(6161);
  const canMoney = perms.canRead("payment-royalty");
  const canBuyer = perms.canRead("buyer-profile");
  const statuses = ["ACTIVE", "SOLD", "WITHDRAWN", "BLOCKED"];
  let all: ResaleRow[] = Array.from({ length: 64 }, (_, i) => {
    const status = pick(rng, statuses);
    const market = pick(rng, MARKETS);
    const row: ResaleRow = {
      id: `rl-${String(700 + i)}…`,
      skuId: `sku-${402 + (i % 40)}…`,
      productName: PRODUCT_NAMES[i % PRODUCT_NAMES.length],
      status,
      listedAt: new Date(
        Date.parse("2026-09-11T00:00:00.000Z") - between(rng, 0, 90) * 86_400_000
      ).toISOString(),
    };
    if (canMoney) {
      row.price = between(rng, 120, 1800).toFixed(2);
      row.currency = market.currency;
    }
    if (canBuyer) row.sellerId = `3f2a9b${String(i).padStart(2, "0")}…`;
    return row;
  });
  const counts = {
    ACTIVE: all.filter((r) => r.status === "ACTIVE").length,
    SOLD: all.filter((r) => r.status === "SOLD").length,
    WITHDRAWN: all.filter((r) => r.status === "WITHDRAWN").length,
    BLOCKED: all.filter((r) => r.status === "BLOCKED").length,
  };
  if (opts.status) all = all.filter((r) => r.status === opts.status);
  all.sort((a, b) => b.listedAt.localeCompare(a.listedAt));
  return { ...paginate(all, opts.page, opts.limit), counts };
}

export function buildDemandSignals(): DemandSignalRow[] {
  const rng = makeRng(1212);
  return PRODUCT_NAMES.map((productName, i) => {
    const watchers = between(rng, 200, 9800);
    const waitlisted = Math.round(watchers * (0.1 + rng() * 0.35));
    return {
      productId: `p-99${String(i).padStart(2, "0")}…`,
      productName,
      watchers,
      waitlisted,
      conversionRate: Number(((waitlisted / watchers) * 100).toFixed(1)),
    };
  }).sort((a, b) => b.watchers - a.watchers);
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export function buildMedia(opts: {
  page: number;
  limit: number;
  assetType?: string;
  virusScanStatus?: string;
}): MediaListResponse {
  const rng = makeRng(7373);
  const types: MediaAsset["assetType"][] = [
    "DROP_IMAGE",
    "PROFILE_IMAGE",
    "EXCLUSIVE_CONTENT",
    "LEGAL_DOCUMENT",
    "SUPPLY_SPREADSHEET",
    "OTHER",
  ];
  const mimeFor: Record<string, string> = {
    DROP_IMAGE: "image/jpeg",
    PROFILE_IMAGE: "image/png",
    EXCLUSIVE_CONTENT: "video/mp4",
    LEGAL_DOCUMENT: "application/pdf",
    SUPPLY_SPREADSHEET: "text/csv",
    OTHER: "application/octet-stream",
  };
  const extFor: Record<string, string> = {
    DROP_IMAGE: "jpg",
    PROFILE_IMAGE: "png",
    EXCLUSIVE_CONTENT: "mp4",
    LEGAL_DOCUMENT: "pdf",
    SUPPLY_SPREADSHEET: "csv",
    OTHER: "bin",
  };

  let all: MediaAsset[] = Array.from({ length: 78 }, (_, i) => {
    const assetType = types[i % types.length];
    // A few assets sit in PENDING so the "processing" state is visible.
    const scan: MediaAsset["virusScanStatus"] =
      i < 4 ? "PENDING" : i === 9 ? "INFECTED" : rng() > 0.94 ? "SKIPPED" : "CLEAN";
    const folder = assetType.toLowerCase().replace(/_/g, "-") + "s";
    return {
      assetId: `a-${String(770 + i)}f-0000-4000-8000-${String(i).padStart(12, "0")}`,
      assetType,
      fileName: `${["hero", "detail", "lookbook", "contract", "restock", "raw"][i % 6]}-${i}.${extFor[assetType]}`,
      storageRef: `${folder}/products/p-99${String(i % 12).padStart(2, "0")}/a-${770 + i}f.${extFor[assetType]}`,
      mimeType: mimeFor[assetType],
      sizeBytes: between(rng, 40_000, 26_000_000),
      virusScanStatus: scan,
      productId: assetType === "DROP_IMAGE" ? `p-99${String(i % 12).padStart(2, "0")}…` : null,
      collectionId: null,
      organizationId: pick(rng, ORGANIZATIONS).id,
      artistId: null,
      uploadedById: `u-${String(220 + (i % 12))}…`,
      archivedAt: null,
      createdAt: new Date(
        Date.parse("2026-09-10T12:00:00.000Z") - between(rng, 0, 120) * 86_400_000
      ).toISOString(),
    };
  });

  const byType = all.reduce<Record<string, number>>((acc, a) => {
    acc[a.assetType] = (acc[a.assetType] ?? 0) + 1;
    return acc;
  }, {});
  const byScanStatus = all.reduce<Record<string, number>>((acc, a) => {
    acc[a.virusScanStatus] = (acc[a.virusScanStatus] ?? 0) + 1;
    return acc;
  }, {});

  if (opts.assetType) all = all.filter((a) => a.assetType === opts.assetType);
  if (opts.virusScanStatus)
    all = all.filter((a) => a.virusScanStatus === opts.virusScanStatus);
  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { ...paginate(all, opts.page, opts.limit), byType, byScanStatus };
}

/* ------------------------------------------------------------------ */
/* Team                                                               */
/* ------------------------------------------------------------------ */

const PEOPLE = [
  ["Ana Duarte", "ana.duarte"],
  ["Marcus Whitfield", "marcus.w"],
  ["Priya Raghunathan", "priya.r"],
  ["Tomas Lindqvist", "tomas.l"],
  ["Yuki Mori", "yuki.mori"],
  ["Dara Okonkwo", "dara.o"],
  ["Elena Rossi", "elena.rossi"],
  ["Sam Beckett", "sam.b"],
  ["Noor Haddad", "noor.h"],
  ["Kenji Watanabe", "kenji.w"],
  ["Freya Nilsen", "freya.n"],
  ["Ibrahim Chaudhry", "ibrahim.c"],
];

export function buildTeam(
  roles: { roleId: string; name: string; displayName: string }[]
): AdminUserRow[] {
  const rng = makeRng(2468);
  return PEOPLE.map(([displayName, handle], i) => {
    const count = i === 0 ? 2 : rng() > 0.78 ? 2 : 1;
    const assigned = Array.from({ length: count }, (_, k) => {
      const r = roles[(i * 3 + k * 5) % roles.length];
      return { roleId: r.roleId, roleName: r.name, displayName: r.displayName };
    }).filter((r, k, arr) => arr.findIndex((x) => x.roleId === r.roleId) === k);
    return {
      userId: `3f2a9b1${String(i)}-1c4d-4e5f-8a9b-0c1d2e3f4a5b`,
      email: `${handle}@hitbox.demo`,
      displayName,
      roles: assigned,
      createdAt: new Date(
        Date.parse("2026-09-01T00:00:00.000Z") - between(rng, 30, 900) * 86_400_000
      ).toISOString(),
    };
  });
}
