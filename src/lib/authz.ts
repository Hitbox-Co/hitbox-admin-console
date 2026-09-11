import type { AuthzMe, PermissionDomain } from "./types";

/**
 * Permission keys are `resource:action:scope`.
 *
 * Navigation and section visibility are derived from these keys, never from
 * role names. Hardcoding a role -> menu map in the frontend re-introduces
 * exactly the coupling the backend removed.
 */

export type Scope = "own" | "organization" | "global";

const SCOPE_RANK: Record<Scope, number> = {
  own: 1,
  organization: 2,
  global: 3,
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

  /** The widest scope held on a resource, or null when none is held. */
  widestScope(resource: string): Scope | null {
    let best: Scope | null = null;
    for (const p of this.parsed) {
      if (p.resource !== resource) continue;
      if (best === null || SCOPE_RANK[p.scope] > SCOPE_RANK[best]) best = p.scope;
    }
    return best;
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
  group: "Overview" | "Commerce" | "Catalog" | "Trust" | "Administration";
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "LayoutDashboard",
    group: "Overview",
    visible: () => true,
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
    href: "/resale",
    label: "Resale",
    icon: "Repeat",
    group: "Commerce",
    visible: (p) => p.canRead("order"),
  },
  {
    href: "/users",
    label: "Buyers",
    icon: "Users",
    group: "Commerce",
    visible: (p) => p.canRead("buyer-profile"),
  },
  {
    href: "/products",
    label: "Products",
    icon: "Package",
    group: "Catalog",
    visible: (p) => p.canRead("drop"),
  },
  {
    href: "/release-approvals",
    label: "Release approvals",
    icon: "BadgeCheck",
    group: "Catalog",
    visible: (p) => p.canRead("release-approval"),
  },
  {
    href: "/supply",
    label: "Supply",
    icon: "Truck",
    group: "Catalog",
    visible: (p) => p.canRead("drop"),
  },
  {
    href: "/demand",
    label: "Demand signals",
    icon: "TrendingUp",
    group: "Catalog",
    visible: (p) => p.canRead("drop"),
  },
  {
    href: "/content",
    label: "Content",
    icon: "Sparkles",
    group: "Catalog",
    visible: (p) => p.canRead("content-unlock"),
  },
  {
    href: "/media",
    label: "Media",
    icon: "Image",
    group: "Catalog",
    visible: (p) => p.hasResource("assets-documents-upload"),
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
    href: "/publish-drop",
    label: "Publish drop",
    icon: "Rocket",
    group: "Administration",
    visible: (p) => p.can("drop", "manage") || p.can("employee-role-mgmt", "manage"),
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

export const NAV_GROUP_ORDER = [
  "Overview",
  "Commerce",
  "Catalog",
  "Trust",
  "Administration",
] as const;

export function visibleNav(p: Permissions): NavItem[] {
  return NAV_ITEMS.filter((item) => item.visible(p));
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

export function humanizeRoleName(name: string): string {
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
