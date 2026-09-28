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
}

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
    visible: () => true,
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
    visible: (p) => {
      const scope = p.widestScope("brand-artist-record");
      return scope === "own" || scope === "organization";
    },
  },
  {
    href: "/markets",
    label: "Markets",
    icon: "Globe",
    group: "Overview",
    visible: (p) =>
      p.canRead("reports-dashboards") &&
      (p.canRead("order") || p.canRead("buyer-profile")),
  },
  // Commerce reads buyer -> order -> money -> aftermarket: the person, what
  // they bought, what it was worth, what happened to it next.
  {
    href: "/users",
    label: "Buyers",
    icon: "Users",
    group: "Commerce",
    visible: (p) => p.canRead("buyer-profile"),
  },
  {
    href: "/orders",
    label: "Orders",
    icon: "ShoppingCart",
    group: "Commerce",
    visible: (p) => p.canRead("order"),
  },
  {
    href: "/finance",
    label: "Finance",
    icon: "Banknote",
    group: "Commerce",
    visible: (p) => p.canRead("payment-royalty"),
  },
  {
    // Charges, refunds and disputes — the money moving, as opposed to the
    // royalties it produces. Same capability family, same 403 without it.
    href: "/payments",
    label: "Payments",
    icon: "CreditCard",
    group: "Commerce",
    visible: (p) => p.canReadFinance(),
  },
  {
    href: "/resale",
    label: "Resale",
    icon: "Repeat",
    group: "Commerce",
    visible: (p) => p.canRead("order"),
  },
  {
    // "Drop" is the word the backend uses throughout — DropStatus, drop:read,
    // drop:manage. The route stays /products because that is what the guards,
    // deep links and gating assertions key on.
    href: "/products",
    label: "Drops",
    icon: "Package",
    group: "Catalog",
    visible: (p) => p.canRead("drop"),
  },
  {
    href: "/release-approvals",
    label: "Approvals",
    icon: "BadgeCheck",
    group: "Catalog",
    visible: (p) => p.canRead("release-approval"),
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
    visible: (p) => p.canRead("reports-dashboards"),
  },
  {
    href: "/supply/consignments",
    label: "Consignments",
    icon: "PackageCheck",
    group: "Inventory",
    // Headers are planning data. Gated on drop:read because
    // HITBOX_DROP_MANAGER holds no nfc-tag-claim grant and could not run a
    // drop without seeing what arrived.
    visible: (p) => p.canRead("drop"),
  },
  {
    href: "/supply/chips",
    label: "Chip inventory",
    icon: "Cpu",
    group: "Inventory",
    visible: (p) => p.canRead("nfc-tag-claim"),
  },
  {
    href: "/inventory",
    label: "Units",
    icon: "Boxes",
    group: "Inventory",
    // The cross-drop list admits global grants only; an org-scoped caller
    // reaches the same rows through a drop's own units panel.
    visible: (p) => p.can("collectible-instance", "read", "global"),
  },
  {
    href: "/supply/vendors",
    label: "Vendors",
    icon: "Truck",
    group: "Inventory",
    // The directory is platform-level: who HitBox buys from, on what terms
    // and at which address is a commercial relationship of the platform's,
    // not a brand's, so GLOBAL reach rather than merely a consignment grant.
    visible: (p) => p.can("drop", "read", "global"),
  },
  {
    href: "/demand",
    label: "Product demand",
    icon: "TrendingUp",
    group: "Catalog",
    visible: (p) => p.canRead("drop"),
  },
  {
    href: "/content",
    label: "Exclusive content",
    icon: "Sparkles",
    group: "Catalog",
    visible: (p) => p.canRead("content-unlock"),
  },
  {
    href: "/media",
    label: "Media management",
    icon: "Image",
    group: "Catalog",
    // Docs table is explicit: assets-documents-upload:READ, not "any grant".
    visible: (p) => p.canRead("assets-documents-upload"),
  },
  {
    href: "/provenance",
    label: "Provenance",
    icon: "ShieldCheck",
    group: "Trust",
    visible: (p) =>
      p.canRead("nfc-tag-claim") || p.canRead("collectible-instance"),
  },
  {
    href: "/activity",
    label: "Audit log",
    icon: "ScrollText",
    group: "Trust",
    visible: (p) => p.canRead("audit-log"),
  },
  {
    href: "/roles",
    label: "Roles",
    icon: "KeyRound",
    group: "Administration",
    visible: (p) => p.canRead("employee-role-mgmt"),
  },
  {
    href: "/team",
    label: "Team",
    icon: "UserCog",
    group: "Administration",
    visible: (p) => p.canRead("employee-role-mgmt"),
  },
];

// "Publish drop" is deliberately absent: admin-console-api.md §14 marks the
// screen "Not built" — packages/releases is schema-only, no service, no
// controller, no router. Do not add a nav entry with nothing behind it.

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
