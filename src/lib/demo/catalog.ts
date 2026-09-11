import type { PermissionGroup, Role } from "../types";

/**
 * The seeded permission catalog and the 12 system roles.
 *
 * This mirrors the backend catalog so demo mode gates sections exactly the
 * way the real service does. When HITBOX_API_URL is set, none of this is
 * used - the real catalog is served from /admin/authz/permissions.
 */

interface ResourceDef {
  resource: string;
  group: string;
  domain: "BUSINESS" | "TECHNICAL";
  actions: { action: string; label: string; description: string }[];
  scopes: ("own" | "organization" | "global")[];
}

const SCOPE_LABEL: Record<string, string> = {
  own: "Own records",
  organization: "Their organization",
  global: "Platform-wide",
};

const RESOURCES: ResourceDef[] = [
  {
    resource: "order",
    group: "Orders",
    domain: "BUSINESS",
    scopes: ["own", "organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View orders." },
      { action: "manage", label: "Manage", description: "Create and update orders." },
      { action: "refund", label: "Refund", description: "Issue a refund on an order." },
    ],
  },
  {
    resource: "payment-royalty",
    group: "Finance",
    domain: "BUSINESS",
    scopes: ["organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View payments, revenue and royalties." },
      { action: "manage", label: "Manage", description: "Configure gateways and settle royalties." },
    ],
  },
  {
    resource: "buyer-profile",
    group: "Buyers",
    domain: "BUSINESS",
    scopes: ["own", "organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View buyer profiles." },
      { action: "manage", label: "Manage", description: "Edit buyer profiles." },
    ],
  },
  {
    resource: "drop",
    group: "Drops & products",
    domain: "BUSINESS",
    scopes: ["own", "organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View products, inventory and supply." },
      { action: "manage", label: "Manage", description: "Create and edit drops." },
    ],
  },
  {
    resource: "release-approval",
    group: "Drops & products",
    domain: "BUSINESS",
    scopes: ["global"],
    actions: [
      { action: "read", label: "Read", description: "View the release approval queue." },
      { action: "approve", label: "Approve", description: "Sign off on a release for compliance." },
    ],
  },
  {
    resource: "content-unlock",
    group: "Content",
    domain: "BUSINESS",
    scopes: ["organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View content bundles and unlock stats." },
      { action: "manage", label: "Manage", description: "Create and edit content bundles." },
    ],
  },
  {
    resource: "brand-artist-record",
    group: "Brands & artists",
    domain: "BUSINESS",
    scopes: ["own", "organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View artist and organization records." },
      { action: "manage", label: "Manage", description: "Edit artist and organization records." },
    ],
  },
  {
    resource: "nfc-tag-claim",
    group: "Provenance",
    domain: "BUSINESS",
    scopes: ["own", "organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View tag claims and provenance cases." },
      { action: "manage", label: "Manage", description: "Resolve provenance cases." },
    ],
  },
  {
    resource: "collectible-instance",
    group: "Provenance",
    domain: "BUSINESS",
    scopes: ["own", "organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View individual collectible instances." },
      { action: "manage", label: "Manage", description: "Edit collectible instance state." },
    ],
  },
  {
    resource: "employee-role-mgmt",
    group: "Access control",
    domain: "BUSINESS",
    scopes: ["organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View roles and assignments." },
      { action: "manage", label: "Manage", description: "Create and edit roles." },
      { action: "assign", label: "Assign", description: "Grant a role to a user." },
      { action: "delete", label: "Revoke", description: "Revoke a role from a user." },
    ],
  },
  {
    resource: "audit-log",
    group: "Audit",
    domain: "BUSINESS",
    scopes: ["organization", "global"],
    actions: [{ action: "read", label: "Read", description: "View the audit log." }],
  },
  {
    resource: "reports-dashboards",
    group: "Reporting",
    domain: "BUSINESS",
    scopes: ["organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "View cross-cut market reporting." },
      { action: "export", label: "Export", description: "Export report data." },
    ],
  },
  {
    resource: "assets-documents-upload",
    group: "Media",
    domain: "BUSINESS",
    scopes: ["own", "organization", "global"],
    actions: [
      { action: "read", label: "Read", description: "Browse the media registry." },
      { action: "manage", label: "Manage", description: "Upload and archive assets." },
    ],
  },
  {
    resource: "platform-config",
    group: "Platform",
    domain: "TECHNICAL",
    scopes: ["global"],
    actions: [
      { action: "read", label: "Read", description: "View platform configuration." },
      { action: "manage", label: "Manage", description: "Change platform configuration." },
    ],
  },
  {
    resource: "service-health",
    group: "Platform",
    domain: "TECHNICAL",
    scopes: ["global"],
    actions: [
      { action: "read", label: "Read", description: "View service health and metrics." },
      { action: "manage", label: "Manage", description: "Restart and scale services." },
    ],
  },
  {
    resource: "feature-flag",
    group: "Platform",
    domain: "TECHNICAL",
    scopes: ["global"],
    actions: [
      { action: "read", label: "Read", description: "View feature flags." },
      { action: "manage", label: "Manage", description: "Toggle feature flags." },
    ],
  },
];

export const PERMISSION_GROUPS: PermissionGroup[] = RESOURCES.map((r) => ({
  resource: r.resource.toUpperCase().replace(/-/g, "_"),
  group: r.group,
  domain: r.domain,
  permissions: r.actions.flatMap((a) =>
    r.scopes.map((scope) => ({
      key: `${r.resource}:${a.action}:${scope}`,
      actionLabel: a.label,
      scopeLabel: SCOPE_LABEL[scope],
      description: a.description,
    }))
  ),
}));

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key)
);

/* ------------------------------------------------------------------ */
/* The 12 seeded system roles                                          */
/* ------------------------------------------------------------------ */

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  HITBOX_SYSTEM_ADMIN: [
    "order:manage:global",
    "order:refund:global",
    "payment-royalty:manage:global",
    "buyer-profile:manage:global",
    "drop:manage:global",
    "release-approval:approve:global",
    "content-unlock:manage:global",
    "brand-artist-record:manage:global",
    "nfc-tag-claim:manage:global",
    "collectible-instance:manage:global",
    "employee-role-mgmt:manage:global",
    "employee-role-mgmt:assign:global",
    "employee-role-mgmt:delete:global",
    "audit-log:read:global",
    "reports-dashboards:read:global",
    "reports-dashboards:export:global",
    "assets-documents-upload:manage:global",
  ],
  HITBOX_DROP_MANAGER: [
    "drop:manage:global",
    "release-approval:approve:global",
    "nfc-tag-claim:read:global",
    "collectible-instance:read:global",
    "order:read:global",
    "reports-dashboards:read:global",
    "assets-documents-upload:manage:global",
  ],
  HITBOX_CONTENT_MANAGER: [
    "content-unlock:manage:global",
    "drop:read:global",
    "brand-artist-record:read:global",
    "assets-documents-upload:manage:global",
  ],
  HITBOX_ORDER_MANAGER: [
    "order:manage:global",
    "order:refund:global",
    "buyer-profile:read:global",
    "nfc-tag-claim:read:global",
    "reports-dashboards:read:global",
  ],
  HITBOX_FINANCE_ADMIN: [
    "payment-royalty:manage:global",
    "order:read:global",
    "order:refund:global",
    "reports-dashboards:read:global",
    "reports-dashboards:export:global",
  ],
  HITBOX_SUPPORT: [
    "nfc-tag-claim:manage:global",
    "collectible-instance:read:global",
    "order:read:global",
  ],
  BRAND_ADMIN: [
    "order:read:organization",
    "payment-royalty:read:organization",
    "drop:manage:organization",
    "content-unlock:manage:organization",
    "brand-artist-record:manage:organization",
    "assets-documents-upload:manage:organization",
    "employee-role-mgmt:read:organization",
    "reports-dashboards:read:organization",
  ],
  BRAND_EMPLOYEE: [
    "order:read:organization",
    "drop:manage:organization",
    "brand-artist-record:read:organization",
    "assets-documents-upload:manage:organization",
  ],
  ARTIST: [
    "drop:read:own",
    "brand-artist-record:manage:own",
    "assets-documents-upload:manage:own",
    "collectible-instance:read:own",
  ],
  HITBOX_PLATFORM_ENGINEER: [
    "platform-config:manage:global",
    "service-health:manage:global",
    "feature-flag:manage:global",
  ],
  HITBOX_FULL_STACK_ENGINEER: [
    "platform-config:read:global",
    "service-health:read:global",
    "feature-flag:manage:global",
  ],
  HITBOX_COMPLIANCE_OFFICER: [
    "release-approval:approve:global",
    "audit-log:read:global",
    "nfc-tag-claim:read:global",
    "brand-artist-record:read:global",
  ],
};

const ROLE_META: Record<
  string,
  { displayName: string; entityGroup: string; domain: "BUSINESS" | "TECHNICAL" }
> = {
  HITBOX_SYSTEM_ADMIN: { displayName: "System Admin", entityGroup: "hitbox", domain: "BUSINESS" },
  HITBOX_DROP_MANAGER: { displayName: "Drop Manager", entityGroup: "hitbox", domain: "BUSINESS" },
  HITBOX_CONTENT_MANAGER: { displayName: "Content Manager", entityGroup: "hitbox", domain: "BUSINESS" },
  HITBOX_ORDER_MANAGER: { displayName: "Order Manager", entityGroup: "hitbox", domain: "BUSINESS" },
  HITBOX_FINANCE_ADMIN: { displayName: "Finance Admin", entityGroup: "hitbox", domain: "BUSINESS" },
  HITBOX_SUPPORT: { displayName: "Support", entityGroup: "hitbox", domain: "BUSINESS" },
  HITBOX_COMPLIANCE_OFFICER: { displayName: "Compliance Officer", entityGroup: "hitbox", domain: "BUSINESS" },
  BRAND_ADMIN: { displayName: "Brand Admin", entityGroup: "brand_artist", domain: "BUSINESS" },
  BRAND_EMPLOYEE: { displayName: "Brand Employee", entityGroup: "brand_artist", domain: "BUSINESS" },
  ARTIST: { displayName: "Artist", entityGroup: "brand_artist", domain: "BUSINESS" },
  HITBOX_PLATFORM_ENGINEER: { displayName: "Platform Engineer", entityGroup: "hitbox", domain: "TECHNICAL" },
  HITBOX_FULL_STACK_ENGINEER: { displayName: "Full Stack Engineer", entityGroup: "hitbox", domain: "TECHNICAL" },
};

export const SYSTEM_ROLES: Role[] = Object.entries(ROLE_PERMISSIONS).map(
  ([name, permissions], i) => ({
    roleId: `r-sys-${String(i + 1).padStart(2, "0")}`,
    name,
    displayName: ROLE_META[name].displayName,
    entityGroup: ROLE_META[name].entityGroup,
    domain: ROLE_META[name].domain,
    isSystem: true,
    isActive: true,
    permissions,
    assignmentCount: [23, 6, 4, 9, 5, 14, 3, 38, 61, 512, 7, 11][i] ?? 1,
    createdAt: "2026-01-04T09:00:00.000Z",
    updatedAt: "2026-06-18T11:20:00.000Z",
  })
);

/** Roles an operator created on top of the seeded set. */
export const CUSTOM_ROLES: Role[] = [
  {
    roleId: "r-cus-01",
    name: "BRAND_CONTENT_EDITOR",
    displayName: "Brand Content Editor",
    entityGroup: "brand_artist",
    domain: "BUSINESS",
    isSystem: false,
    isActive: true,
    permissions: ["content-unlock:manage:organization", "drop:manage:organization"],
    assignmentCount: 12,
    createdAt: "2026-07-22T14:10:00.000Z",
    updatedAt: "2026-08-30T16:45:00.000Z",
  },
  {
    roleId: "r-cus-02",
    name: "REGIONAL_OPS_LEAD",
    displayName: "Regional Ops Lead",
    entityGroup: "hitbox",
    domain: "BUSINESS",
    isSystem: false,
    isActive: false,
    permissions: [
      "order:read:global",
      "reports-dashboards:read:global",
      "nfc-tag-claim:read:global",
    ],
    assignmentCount: 0,
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-09-01T08:15:00.000Z",
  },
];

export function permissionsForRole(roleName: string): string[] {
  return ROLE_PERMISSIONS[roleName] ?? ROLE_PERMISSIONS.HITBOX_SYSTEM_ADMIN;
}
