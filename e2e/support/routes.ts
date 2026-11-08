/**
 * Every destination the console owns, in one place.
 *
 * `title` is the string the page pushes through `usePageChrome()`, which the
 * topbar renders as the page's only <h1> — so it doubles as the "this screen
 * actually mounted" assertion. `requires` is the permission key the screen's
 * own PageGuard checks, taken from the page file, not guessed; the gating spec
 * uses it to explain a lock rather than to decide one.
 *
 * Keep this in step with src/lib/authz.ts NAV_ITEMS: the nav spec asserts that
 * every navigable route here is reachable from the sidebar and vice versa.
 */

export interface AppRoute {
  path: string;
  /** The <h1> the topbar shows once the screen mounts. */
  title: string;
  /** Permission key the page's PageGuard requires, or null when ungated. */
  requires: string | null;
  /** Sidebar group, or null for routes reached only from another screen. */
  group: "Overview" | "Commerce" | "Catalog" | "Trust" | "Administration" | null;
  /** False for sub-pages and detail screens that have no sidebar entry. */
  inNav: boolean;
}

export const APP_ROUTES: AppRoute[] = [
  { path: "/dashboard", title: "Dashboard", requires: null, group: "Overview", inNav: true },
  { path: "/artist", title: "My workspace", requires: "brand-artist-record:read:own", group: "Overview", inNav: true },
  { path: "/markets", title: "Markets", requires: "reports-dashboards:read", group: "Overview", inNav: true },

  { path: "/users", title: "Buyers", requires: "buyer-profile:read", group: "Commerce", inNav: true },
  { path: "/orders", title: "Orders", requires: "order:read", group: "Commerce", inNav: true },
  { path: "/finance", title: "Finance", requires: "payment-royalty:read", group: "Commerce", inNav: true },
  { path: "/payments", title: "Payments", requires: "payment-royalty:read", group: "Commerce", inNav: true },
  { path: "/resale", title: "Resale", requires: "order:read", group: "Commerce", inNav: true },

  { path: "/products", title: "Drops", requires: "drop:read", group: "Catalog", inNav: true },
  { path: "/release-approvals", title: "Approvals", requires: "release-approval:read", group: "Catalog", inNav: true },
  { path: "/supply", title: "Vendors", requires: "drop:read", group: "Catalog", inNav: true },
  { path: "/demand", title: "Product demand", requires: "drop:read", group: "Catalog", inNav: true },
  { path: "/content", title: "Exclusive content", requires: "content-unlock:read", group: "Catalog", inNav: true },
  { path: "/media", title: "Media management", requires: "assets-documents-upload:read", group: "Catalog", inNav: true },

  { path: "/provenance", title: "Provenance", requires: "collectible-instance:read", group: "Trust", inNav: true },
  { path: "/activity", title: "Audit log", requires: "audit-log:read", group: "Trust", inNav: true },

  { path: "/roles", title: "Roles", requires: "employee-role-mgmt:read", group: "Administration", inNav: true },
  { path: "/team", title: "Team", requires: "employee-role-mgmt:read", group: "Administration", inNav: true },

  /* Sub-navigation under /team — the invitation queue has no sidebar entry. */
  { path: "/team/invitations", title: "Invitations", requires: "employee-role-mgmt:read", group: null, inNav: false },

  /* Sub-navigation under /finance and /payments — no sidebar entry of their own. */
  { path: "/finance/rules", title: "Royalty rules", requires: "payment-royalty:read", group: null, inNav: false },
  { path: "/finance/royalties", title: "Royalties", requires: "payment-royalty:read", group: null, inNav: false },
  { path: "/finance/ledger", title: "Platform ledger", requires: "payment-royalty:read", group: null, inNav: false },
  { path: "/finance/balances", title: "Balances", requires: "payment-royalty:read", group: null, inNav: false },
  { path: "/finance/payouts", title: "Payouts", requires: "payment-royalty:read", group: null, inNav: false },
  { path: "/finance/adjustments", title: "Adjustments", requires: "payment-royalty:manage", group: null, inNav: false },

  { path: "/payments/refunds", title: "Refunds", requires: "payment-royalty:read", group: null, inNav: false },
  { path: "/payments/disputes", title: "Disputes", requires: "payment-royalty:read", group: null, inNav: false },
  { path: "/payments/gateways", title: "Gateway configuration", requires: "payment-royalty:configure", group: null, inNav: false },
  { path: "/payments/webhooks", title: "Webhook deliveries", requires: "payment-royalty:read", group: null, inNav: false },

  /* Create screen; the [roleId] detail screen is covered from the list. */
  { path: "/roles/new", title: "New role", requires: "employee-role-mgmt:manage", group: null, inNav: false },
];

/** Public routes — the only three `isPublic` in src/proxy.ts admits. */
export const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-up"] as const;

/** Nav labels, as the sidebar renders them, keyed by href. */
export const NAV_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/markets": "Markets",
  "/users": "Buyers",
  "/orders": "Orders",
  "/finance": "Finance",
  "/payments": "Payments",
  "/resale": "Resale",
  "/products": "Drops",
  "/release-approvals": "Approvals",
  "/supply": "Vendors",
  "/demand": "Product demand",
  "/content": "Exclusive content",
  "/media": "Media management",
  "/provenance": "Provenance",
  "/activity": "Audit log",
  "/roles": "Roles",
  "/team": "Team",
};

export const NAVIGABLE = APP_ROUTES.filter((r) => r.inNav);
