import type { AuthzMe, PermissionDomain } from "./types";

/**
 * Permission keys are `resource:action:scope`.
 *
 * Navigation and section visibility are derived from these keys, never from
 * role names. Hardcoding a role -> menu map in the frontend re-introduces
 * exactly the coupling the backend removed. Driven from admin-console-api.md
 * §0's "Sidebar item / Show when" table.
 */

/**
 * The catalog emits SIX scope tokens, not three.
 *
 * `public`, `masked` and `masked-partial` are real, seeded scopes —
 * HITBOX_SUPPORT holds `buyer-profile:read:masked` and
 * `collectible-instance:read:masked`, HITBOX_ORDER_MANAGER holds
 * `buyer-profile:read:masked-partial`, BUYER_COLLECTOR holds
 * `collectible-instance:read:public`. Verified against
 * packages/access-control/src/domain/role-catalog.ts.
 *
 * This list used to be `own | organization | global`, and `parsePermission`
 * dropped anything else — so Support appeared to hold no buyer-profile grant
 * at all and lost the Buyer column it is entitled to (masked).
 */
export type Scope =
  | "own"
  | "organization"
  | "public"
  | "masked"
  | "masked-partial"
  | "global";

/**
 * Breadth, mirroring SCOPE_RANK in packages/skus/src/domain/sku-access.ts.
 * The masking scopes reach EVERY record — they differ from `global` in how
 * much of each record comes back, not in how many records do.
 */
const SCOPE_RANK: Record<Scope, number> = {
  own: 1,
  organization: 2,
  public: 3,
  masked: 4,
  "masked-partial": 5,
  global: 6,
};

/** How much of each reached record is visible, per scope. */
export type Visibility = "FULL" | "PARTIAL" | "MASKED" | "PUBLIC";

const SCOPE_VISIBILITY: Record<Scope, Visibility> = {
  own: "FULL",
  organization: "FULL",
  global: "FULL",
  "masked-partial": "PARTIAL",
  masked: "MASKED",
  public: "PUBLIC",
};

export interface ParsedPermission {
  resource: string;
  action: string;
  scope: Scope;
}

export function parsePermission(key: string): ParsedPermission | null {
  const [resource, action, scope] = key.split(":");
  if (!resource || !action || !scope) return null;
  if (!(scope in SCOPE_RANK)) return null;
  return { resource, action, scope: scope as Scope };
}

/**
 * A thin wrapper over the caller's permission list.
 *
 * `manage` implies `read` in this catalog - a role granted
 * `order:manage:global` can read orders - so every check falls back to
 * looking for a manage grant on the same resource.
 */
export class Permissions {
  readonly keys: readonly string[];
  private readonly parsed: ParsedPermission[];

  constructor(keys: readonly string[] = []) {
    this.keys = keys;
    this.parsed = keys
      .map(parsePermission)
      .filter((p): p is ParsedPermission => p !== null);
  }

  /** Does the caller hold any permission at all on this resource? */
  hasResource(resource: string): boolean {
    return this.parsed.some((p) => p.resource === resource);
  }

  /**
   * Does the caller hold `resource:action` at `minScope` or wider?
   * `manage` on the same resource satisfies any read-ish action.
   */
  can(resource: string, action: string, minScope: Scope = "own"): boolean {
    const need = SCOPE_RANK[minScope];
    return this.parsed.some((p) => {
      if (p.resource !== resource) return false;
      if (SCOPE_RANK[p.scope] < need) return false;
      if (p.action === action) return true;
      // `manage` subsumes the non-destructive actions.
      return p.action === "manage" && action !== "manage";
    });
  }

  /** Convenience for the very common read check. */
  canRead(resource: string): boolean {
    return this.can(resource, "read");
  }

  /**
   * An EXACT action at `minScope` or wider — `manage` subsumes nothing here.
   *
   * `can()` is the right check almost everywhere, because most services treat
   * a manage grant as covering the reads. The finance and payments modules do
   * NOT: `buildFinanceAccess` resolves `canOverride` from a literal
   * `payment-royalty:override` key and `buildPaymentAccess` resolves
   * `canConfigure` and `canRefund` the same way, so a System Admin holds all
   * three because the catalog grants all three — not because manage implies
   * them. Using `can()` for those would offer a Reverse button to a role the
   * controller then refuses, which is the exact failure mode a client-side
   * permission check exists to prevent.
   */
  hasAction(resource: string, action: string, minScope: Scope = "own"): boolean {
    const need = SCOPE_RANK[minScope];
    return this.parsed.some(
      (p) =>
        p.resource === resource && p.action === action && SCOPE_RANK[p.scope] >= need
    );
  }

  /** The widest scope held on a resource, or null when none is held. */
  widestScope(resource: string): Scope | null {
    let best: Scope | null = null;
    for (const p of this.parsed) {
      if (p.resource !== resource) continue;
      if (best === null || SCOPE_RANK[p.scope] > SCOPE_RANK[best]) best = p.scope;
    }
    return best;
  }

  /** How much of each record the caller sees on this resource. */
  visibility(resource: string): Visibility | null {
    const scope = this.widestScope(resource);
    return scope ? SCOPE_VISIBILITY[scope] : null;
  }

  /**
   * May the caller reach the serialized-unit admin surface?
   *
   * Mirrors `buildSkuAccess()` in packages/skus/src/domain/sku-access.ts,
   * which refuses two cases a plain capability check waves through:
   *
   *  - PUBLIC visibility — BUYER_COLLECTOR holds
   *    `collectible-instance:read:public`, and PUBLIC has ALL breadth, so a
   *    bare "has a collectible-instance grant" test admits every signed-in
   *    buyer on the platform.
   *  - OWN scope — an own-scoped grant is a collector looking at their own
   *    shelf, not an operator.
   *
   * Getting this wrong in the UI means offering a screen that answers 403.
   */
  canReadUnits(): boolean {
    if (!this.can("collectible-instance", "read")) return false;
    const scope = this.widestScope("collectible-instance");
    if (scope === null || scope === "own") return false;
    return SCOPE_VISIBILITY[scope] !== "PUBLIC";
  }

  /** Minting units. Binding NFC tags additionally needs nfc-tag-claim:manage. */
  canMintUnits(): boolean {
    return this.canReadUnits() && this.can("collectible-instance", "manage");
  }

  /** Only this may put a physical tag UID into the authenticity table. */
  canBindTags(): boolean {
    return this.can("nfc-tag-claim", "manage");
  }

  /* ---------------------------------------------------------------- */
  /* Drops and their review (drop-approval-lifecycle.md §9–11)         */
  /*                                                                   */
  /* These say whether a ROUTE is reachable. Whether this caller may    */
  /* approve THIS drop turns on its frozen authority, which only the    */
  /* server knows — so the review screen drives its buttons from       */
  /* canApprove / canReject / canReopen on the detail, not from these.  */
  /* ---------------------------------------------------------------- */

  /**
   * The admin catalog writes — create, PATCH, archive, publish, pricing.
   * Every one is mounted globalOnly, so an org-scoped drop:manage (Brand
   * Admin, Artist) is refused.
   */
  canManageCatalog(): boolean {
    return this.can("drop", "manage", "global");
  }

  /**
   * /admin/drop-types writes — a type's rules are shared by every drop that
   * uses it, so drop-type:manage is granted globally to HITBOX_SYSTEM_ADMIN
   * only (drop-types-and-variants.md §5).
   */
  canManageDropTypes(): boolean {
    return this.can("drop-type", "manage", "global");
  }

  /**
   * POST /admin/releases. Gated on drop:manage at ANY scope, not on a
   * release capability: submitting is something done to your own drop, so
   * whoever may edit the drop may submit it. Drop Managers, Brand Admins,
   * Brand Employees and Artists all can.
   */
  canSubmitRelease(): boolean {
    return this.can("drop", "manage");
  }

  /**
   * POST /admin/releases/:id/decision accepts ANY of approve, reject or
   * manage, because no single one is held by everyone entitled to call it:
   * the owner's approve, an administrator's reject, the queue admin's
   * manage. Exact actions — approve neither is nor implies manage.
   */
  canReachReleaseDecision(): boolean {
    return (
      this.hasAction("release-approval", "approve") ||
      this.hasAction("release-approval", "reject") ||
      this.hasAction("release-approval", "manage")
    );
  }

  /** PATCH /admin/releases/:id — the reviewer's working notes. */
  canAmendRelease(): boolean {
    return this.hasAction("release-approval", "manage");
  }

  /** POST /admin/releases/:id/reopen. Override is exact; manage does not imply it. */
  canReopenRelease(): boolean {
    return this.hasAction("release-approval", "override");
  }

  /* ---------------------------------------------------------------- */
  /* Finance & payments                                                */
  /*                                                                   */
  /* Mirrors buildFinanceAccess() and buildPaymentAccess() so the UI    */
  /* offers exactly the actions the controllers will allow. Every       */
  /* write below is GLOBAL-only in the catalog and the route guards     */
  /* pass `globalOnly: true`, so an organization-scoped manage grant is */
  /* refused — which is why these ask for "global", not "own".          */
  /* ---------------------------------------------------------------- */

  /**
   * How wide the caller's money reads are, or null when they hold no
   * `payment-royalty` grant at all (a 403, not an empty list).
   *
   * Only own/organization/global are meaningful here: the finance and
   * payments SCOPE_RANK tables know those three words and nothing else.
   */
  financeScope(): "own" | "organization" | "global" | null {
    const scope = this.widestScope("payment-royalty");
    if (scope === "own" || scope === "organization" || scope === "global") return scope;
    return null;
  }

  /** Reading rules, entries, balances, payouts, transactions, refunds. */
  canReadFinance(): boolean {
    return this.financeScope() !== null;
  }

  /** Rules, payouts, adjustments, payment review, dispute actions. */
  canManageFinance(): boolean {
    return this.hasAction("payment-royalty", "manage", "global");
  }

  /**
   * Reversing a posting the calculation says is owed.
   *
   * The route takes `manage` and the controller then re-checks `override` —
   * two different powers, and this is the one that cancels money someone is
   * owed. See FinanceController.reverseEntry.
   */
  canOverrideRoyalties(): boolean {
    return this.hasAction("payment-royalty", "override", "global");
  }

  /**
   * Gateway configuration — the narrowest capability in the catalog, because
   * changing `credentialsRef` is functionally changing the bank account the
   * platform's money lands in.
   */
  canConfigureGateways(): boolean {
    return this.hasAction("payment-royalty", "configure", "global");
  }

  /**
   * The refund workflow: confirm-return, approve, reject, process.
   *
   * BOTH conditions are real. The four routes are guarded by
   * `order:refund:global` — but every handler first calls
   * `buildPaymentAccess(principal)`, which throws 403 when the caller holds
   * no `payment-royalty` grant at all. HITBOX_ORDER_MANAGER holds
   * `order:refund:global` and no payment-royalty grant, so it is refused on
   * the workflow it was named for (api-reference.md, "Two rough edges" §1).
   *
   * Checking only the refund capability here would offer that role four
   * buttons, every one of which answers 403. Checking both means the screen
   * says why instead.
   */
  canWorkRefunds(): boolean {
    return this.hasAction("order", "refund", "global") && this.canReadFinance();
  }

  /** True when the caller holds no BUSINESS-domain grant worth a dashboard. */
  get isTechnicalOnly(): boolean {
    return !BUSINESS_RESOURCES.some((r) => this.hasResource(r));
  }

  get isEmpty(): boolean {
    return this.parsed.length === 0;
  }

  /* ---------------------------------------------------------------- */
  /* Route reach — what the backend guard actually admits              */
  /* ---------------------------------------------------------------- */

  /**
   * Does a grant REACH every record of this resource?
   *
   * The backend's authorization engine admits an ORGANIZATION-scoped grant
   * only when the route supplies an organization context, and an OWN grant
   * only when it supplies an owner context
   * (access-control/src/engine/authorization-engine.ts). Most admin routes
   * supply neither — orders, payments, supply, SKUs, media, team, market
   * configuration, the owner directories — so for them only GLOBAL and the
   * masking scopes (which reach every record, showing less of each) pass.
   * PUBLIC also passes the engine but every such service refuses it.
   *
   * So `canRead()` answering yes for an org-scoped Brand Admin does not mean
   * `GET /admin/orders` will: use this for any route with no context.
   */
  reaches(resource: string, action = "read"): boolean {
    return this.can(resource, action, "masked");
  }

  /**
   * The finance module (rules, royalties, balances, payouts, ledger,
   * adjustments). Its guard supplies an OWNER context and nothing else, so an
   * OWN grant passes (an artist's own royalties) and GLOBAL passes — but an
   * ORGANIZATION grant has no organization to match and is refused, even
   * though finance's own scope code was written for it.
   */
  canReadFinanceModule(): boolean {
    return this.parsed.some(
      (p) =>
        p.resource === "payment-royalty" &&
        (p.action === "read" || p.action === "manage") &&
        (p.scope === "own" || p.scope === "global")
    );
  }

  /**
   * The drop's own page (/products/:id and everything it loads — prices,
   * images, units, the owner directories). Offered to catalog operators with
   * platform-wide drop reach. Organization-scoped callers (Artist, Brand)
   * review a drop from its approval page instead.
   */
  canOpenDropPage(): boolean {
    return this.reaches("drop");
  }

  /**
   * May the caller open this console route? The one source for nav, guards
   * and links. A sub-route with no rule of its own inherits its nearest
   * parent's (`/finance/balances` → `/finance`). Dynamic routes are named
   * explicitly — the drop page is `/products/detail`, never `/products/:id`.
   */
  canOpen(href: string): boolean {
    let path = href.split(/[?#]/)[0];
    while (path) {
      const rule = ROUTE_ACCESS[path];
      if (rule) return rule(this);
      path = path.slice(0, path.lastIndexOf("/"));
    }
    return false;
  }
}

/**
 * Every console route, with the rule the backend route behind it enforces —
 * the sidebar, each page guard and every cross-page link read this, so a
 * destination a role cannot load is never offered to it.
 *
 * "any scope" routes are the dashboard projections, which gate by capability
 * and then filter rows to the caller's organizations; "reaches" routes carry
 * no organization/owner context and so admit GLOBAL (or masked) grants only.
 */
const ROUTE_ACCESS: Record<string, (p: Permissions) => boolean> = {
  "/dashboard": () => true,
  // A personal workspace only makes sense for someone with a profile of
  // their own — derived from scope, never from the role name.
  // /artist/me checks brand-artist-record at OWN scope against the caller's
  // own user id: only an artist's own grant reaches a profile. A Brand Admin
  // (organization) is a 403; a global holder passes but has no profile (404).
  "/artist/profile": (p) => p.widestScope("brand-artist-record") === "own",
  "/artist": (p) => {
    const scope = p.widestScope("brand-artist-record");
    return scope === "own" || scope === "organization";
  },
  // dashboard/markets — reports-dashboards at any scope. Its Configuration
  // tab (admin/markets) additionally needs reach; the page gates that tab.
  "/markets": (p) =>
    p.canRead("reports-dashboards") && (p.canRead("order") || p.canRead("buyer-profile")),
  "/users": (p) => p.canRead("buyer-profile"),
  "/orders": (p) => p.reaches("order"),
  "/finance": (p) => p.canReadFinanceModule(),
  "/finance/ledger": (p) => p.canReadFinanceModule() && p.financeScope() !== "own",
  "/finance/adjustments": (p) => p.canReadFinanceModule() && p.financeScope() !== "own",
  "/payments": (p) => p.reaches("payment-royalty"),
  "/payments/gateways": (p) => p.canConfigureGateways(),
  "/payments/webhooks": (p) => p.canManageFinance(),
  // dashboard/resale — order:read at any scope.
  "/resale": (p) => p.canRead("order"),
  "/products": (p) => p.canRead("drop"),
  "/products/detail": (p) => p.canOpenDropPage(),
  "/products/new": (p) => p.canManageCatalog(),
  // GET /admin/drop-types takes drop:read with no organization context, so
  // only a platform-wide read passes. Writes are gated on the page.
  "/products/types": (p) => p.reaches("drop"),
  "/release-approvals": (p) => p.canRead("release-approval"),
  "/supply": (p) => p.reaches("reports-dashboards"),
  "/supply/consignments": (p) => p.reaches("drop"),
  "/supply/chips": (p) => p.reaches("nfc-tag-claim"),
  // GLOBAL or masked — Support reaches every unit with masked owners.
  "/inventory": (p) => p.reaches("collectible-instance"),
  "/supply/vendors": (p) => p.can("drop", "read", "global"),
  "/demand": (p) => p.canRead("drop"),
  "/content": (p) => p.canRead("content-unlock"),
  "/media": (p) => p.reaches("assets-documents-upload"),
  // dashboard/provenance gates on nfc-tag-claim only — a collectible-instance
  // grant alone (Drop Manager) is refused.
  "/provenance": (p) => p.canRead("nfc-tag-claim"),
  "/activity": (p) => p.canRead("audit-log"),
  "/roles": (p) => p.reaches("employee-role-mgmt"),
  "/team": (p) => p.reaches("employee-role-mgmt"),
};

/** Resources that put something on the BUSINESS dashboard. */
export const BUSINESS_RESOURCES = [
  "buyer-profile",
  "employee-role-mgmt",
  "order",
  "payment-royalty",
  "drop",
  "content-unlock",
  "brand-artist-record",
  "nfc-tag-claim",
  "collectible-instance",
  "release-approval",
  "reports-dashboards",
  "audit-log",
  "assets-documents-upload",
] as const;

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Returns true when this destination has anything to show the caller. */
  visible: (p: Permissions) => boolean;
  group:
    | "Overview"
    | "Commerce"
    | "Catalog"
    | "Inventory"
    | "Trust"
    | "Administration";
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "LayoutDashboard",
    group: "Overview",
    // "always — the payload itself is filtered" (admin-console-api.md §0)
    visible: (p) => p.canOpen("/dashboard"),
  },
  {
    /*
     * The creator's own slice. Offered to the brand/artist entity group and
     * to nobody else — a `brand-artist-record` grant at own or organization
     * scope is exactly ARTIST and BRAND_ADMIN, while a global holder is HitBox
     * staff, for whom "mine" filters nothing. Derived from scope, never from
     * the role name, like every other entry here.
     */
    href: "/artist",
    label: "My workspace",
    icon: "Palette",
    group: "Overview",
    visible: (p) => p.canOpen("/artist"),
  },
  {
    href: "/artist/profile",
    label: "My profile",
    icon: "UserCog",
    group: "Overview",
    visible: (p) => p.canOpen("/artist/profile"),
  },
  {
    href: "/markets",
    label: "Markets",
    icon: "Globe",
    group: "Overview",
    visible: (p) => p.canOpen("/markets"),
  },
  // Commerce reads buyer -> order -> money -> aftermarket: the person, what
  // they bought, what it was worth, what happened to it next.
  {
    href: "/users",
    label: "Buyers",
    icon: "Users",
    group: "Commerce",
    visible: (p) => p.canOpen("/users"),
  },
  {
    href: "/orders",
    label: "Orders",
    icon: "ShoppingCart",
    group: "Commerce",
    visible: (p) => p.canOpen("/orders"),
  },
  {
    href: "/finance",
    label: "Finance",
    icon: "Banknote",
    group: "Commerce",
    visible: (p) => p.canOpen("/finance"),
  },
  {
    // Charges, refunds and disputes — the money moving, as opposed to the
    // royalties it produces. Same capability family, same 403 without it.
    href: "/payments",
    label: "Payments",
    icon: "CreditCard",
    group: "Commerce",
    visible: (p) => p.canOpen("/payments"),
  },
  {
    href: "/resale",
    label: "Resale",
    icon: "Repeat",
    group: "Commerce",
    visible: (p) => p.canOpen("/resale"),
  },
  {
    // "Drop" is the word the backend uses throughout — DropStatus, drop:read,
    // drop:manage. The route stays /products because that is what the guards,
    // deep links and gating assertions key on.
    href: "/products",
    label: "Drops",
    icon: "Package",
    group: "Catalog",
    visible: (p) => p.canOpen("/products"),
  },
  {
    href: "/products/types",
    label: "Drop types",
    icon: "Shapes",
    group: "Catalog",
    visible: (p) => p.canOpen("/products/types"),
  },
  {
    href: "/release-approvals",
    label: "Approvals",
    icon: "BadgeCheck",
    group: "Catalog",
    visible: (p) => p.canOpen("/release-approvals"),
  },
  /*
   * Supply & inventory. Its own group rather than more Catalog entries: this
   * is the upstream — the carton, the chip inside it, the manufacturer — and
   * it is gated on four different resources, so a role that sees one entry
   * here routinely sees none of the others.
   */
  {
    href: "/supply",
    label: "Supply overview",
    icon: "Gauge",
    group: "Inventory",
    // The rollup itself. Every block inside is gated separately, and a caller
    // with no supply grant at all gets an empty envelope, which the page
    // explains rather than rendering as zeroes.
    visible: (p) => p.canOpen("/supply"),
  },
  {
    href: "/supply/consignments",
    label: "Consignments",
    icon: "PackageCheck",
    group: "Inventory",
    // Headers are planning data. Gated on drop:read because
    // HITBOX_DROP_MANAGER holds no nfc-tag-claim grant and could not run a
    // drop without seeing what arrived.
    visible: (p) => p.canOpen("/supply/consignments"),
  },
  {
    href: "/supply/chips",
    label: "Chip inventory",
    icon: "Cpu",
    group: "Inventory",
    visible: (p) => p.canOpen("/supply/chips"),
  },
  {
    href: "/inventory",
    label: "Units",
    icon: "Boxes",
    group: "Inventory",
    // The cross-drop list admits global grants only; an org-scoped caller
    // reaches the same rows through a drop's own units panel.
    visible: (p) => p.canOpen("/inventory"),
  },
  {
    href: "/supply/vendors",
    label: "Vendors",
    icon: "Truck",
    group: "Inventory",
    // The directory is platform-level: who HitBox buys from, on what terms
    // and at which address is a commercial relationship of the platform's,
    // not a brand's, so GLOBAL reach rather than merely a consignment grant.
    visible: (p) => p.canOpen("/supply/vendors"),
  },
  {
    href: "/demand",
    label: "Product demand",
    icon: "TrendingUp",
    group: "Catalog",
    visible: (p) => p.canOpen("/demand"),
  },
  {
    href: "/content",
    label: "Exclusive content",
    icon: "Sparkles",
    group: "Catalog",
    visible: (p) => p.canOpen("/content"),
  },
  {
    href: "/media",
    label: "Media management",
    icon: "Image",
    group: "Catalog",
    // Docs table is explicit: assets-documents-upload:READ, not "any grant".
    visible: (p) => p.canOpen("/media"),
  },
  {
    href: "/provenance",
    label: "Provenance",
    icon: "ShieldCheck",
    group: "Trust",
    visible: (p) => p.canOpen("/provenance"),
  },
  {
    href: "/activity",
    label: "Audit log",
    icon: "ScrollText",
    group: "Trust",
    visible: (p) => p.canOpen("/activity"),
  },
  {
    href: "/roles",
    label: "Roles",
    icon: "KeyRound",
    group: "Administration",
    visible: (p) => p.canOpen("/roles"),
  },
  {
    href: "/team",
    label: "Team",
    icon: "UserCog",
    group: "Administration",
    visible: (p) => p.canOpen("/team"),
  },
];

// "Publish drop" has no nav entry of its own: publishing is a transition on
// one drop (POST /admin/products/:id/publish), offered from that drop's
// detail once its latest review is APPROVED — not a screen.

export const NAV_GROUP_ORDER = [
  "Overview",
  "Commerce",
  "Catalog",
  // Upstream of the catalog: the carton, the chip, the unit, the vendor.
  "Inventory",
  "Trust",
  "Administration",
] as const;

export function visibleNav(p: Permissions): NavItem[] {
  return NAV_ITEMS.filter((item) => item.visible(p));
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

export function humanizeRoleName(name: string | null | undefined): string {
  // Nullable at the source: audit events raised by the system carry no role
  // snapshot. Callers decide what to show for "" — this does not invent one.
  if (!name) return "";
  return name
    .replace(/^HITBOX_/, "")
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function domainOf(me: AuthzMe): PermissionDomain {
  const p = new Permissions(me.permissions);
  return p.isTechnicalOnly ? "TECHNICAL" : "BUSINESS";
}
