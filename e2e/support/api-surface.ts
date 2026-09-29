/**
 * Every endpoint the console calls, in one place.
 *
 * Transcribed from `src/lib/api/hooks.ts` — the console's only caller — so the
 * manifest describes what this application actually uses rather than what the
 * backend happens to expose. Paths are relative to `/api/hitbox/`, which the
 * ingress rewrites to `<HITBOX_API_URL>/api/v1/...`.
 *
 * `kind` is the distinction the suite is built on:
 *
 *   read   safe to call against any environment, including production;
 *   write  creates or edits a record;
 *   act    advances a state machine — money moves, ownership changes, a
 *          decision is recorded against someone's name.
 *
 * Only `read` endpoints are ever called for real. `write` and `act` are
 * exercised for their REFUSALS (unauthenticated, unauthorised, illegal
 * transition) and for the UI's gating of them — never for their success path.
 * See docs/TESTING-APPROACH.md, "What this suite deliberately does not do".
 */

export type Kind = "read" | "write" | "act";
export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface Endpoint {
  method: Method;
  /** Relative to /api/hitbox/. `:param` marks a path parameter. */
  path: string;
  kind: Kind;
  /** The permission the backend guard requires, as documented. */
  requires: string;
  /** Which operator workflow this belongs to, when it belongs to one. */
  workflow?: string;
  /** A sample this suite may call unauthenticated to assert the refusal. */
  probe?: string;
}

export const API: Endpoint[] = [
  /* ---- identity ---------------------------------------------------- */
  { method: "GET", path: "authz/me", kind: "read", requires: "-", probe: "authz/me" },

  /* ---- dashboard --------------------------------------------------- */
  { method: "GET", path: "admin/dashboard", kind: "read", requires: "reports-dashboards:read", probe: "admin/dashboard" },
  { method: "GET", path: "admin/dashboard/users", kind: "read", requires: "buyer-profile:read" },
  { method: "GET", path: "admin/dashboard/finance", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/dashboard/markets", kind: "read", requires: "reports-dashboards:read" },
  { method: "GET", path: "admin/dashboard/orders", kind: "read", requires: "order:read" },
  { method: "GET", path: "admin/dashboard/products", kind: "read", requires: "drop:read" },
  { method: "GET", path: "admin/dashboard/release-approvals", kind: "read", requires: "release-approval:read" },
  { method: "GET", path: "admin/dashboard/provenance", kind: "read", requires: "collectible-instance:read" },
  { method: "GET", path: "admin/dashboard/supply", kind: "read", requires: "drop:read" },
  { method: "GET", path: "admin/dashboard/resale", kind: "read", requires: "order:read" },
  { method: "GET", path: "admin/dashboard/demand-signals", kind: "read", requires: "drop:read" },

  /* ---- access control ---------------------------------------------- */
  { method: "GET", path: "admin/authz/roles", kind: "read", requires: "employee-role-mgmt:read", probe: "admin/authz/roles" },
  { method: "GET", path: "admin/authz/roles/:roleId", kind: "read", requires: "employee-role-mgmt:read" },
  { method: "GET", path: "admin/authz/permissions", kind: "read", requires: "employee-role-mgmt:read" },
  { method: "GET", path: "admin/authz/team", kind: "read", requires: "employee-role-mgmt:read" },
  { method: "POST", path: "admin/authz/roles", kind: "write", requires: "employee-role-mgmt:manage", workflow: "role-lifecycle" },
  { method: "PATCH", path: "admin/authz/roles/:roleId", kind: "write", requires: "employee-role-mgmt:manage", workflow: "role-lifecycle" },
  { method: "DELETE", path: "admin/authz/roles/:roleId", kind: "write", requires: "employee-role-mgmt:manage", workflow: "role-lifecycle" },
  { method: "POST", path: "admin/authz/users/:userId/roles", kind: "act", requires: "employee-role-mgmt:manage", workflow: "role-assignment" },
  { method: "DELETE", path: "admin/authz/users/:userId/roles/:assignmentId", kind: "act", requires: "employee-role-mgmt:manage", workflow: "role-assignment" },
  { method: "GET", path: "admin/authz/invitations", kind: "read", requires: "employee-role-mgmt:read" },
  { method: "POST", path: "admin/authz/invitations", kind: "act", requires: "employee-role-mgmt:assign", workflow: "staff-invitation" },
  { method: "POST", path: "admin/authz/invitations/:invitationId/revoke", kind: "act", requires: "employee-role-mgmt:delete", workflow: "staff-invitation" },

  /* ---- orders ------------------------------------------------------ */
  { method: "GET", path: "admin/orders", kind: "read", requires: "order:read", probe: "admin/orders" },
  { method: "GET", path: "admin/orders/:orderId", kind: "read", requires: "order:read" },
  { method: "PATCH", path: "admin/orders/:orderId/status", kind: "act", requires: "order:manage", workflow: "order-lifecycle" },

  /* ---- drops and units --------------------------------------------- */
  { method: "GET", path: "admin/products", kind: "read", requires: "drop:read", probe: "admin/products" },
  { method: "GET", path: "admin/products/:productId", kind: "read", requires: "drop:read" },
  { method: "GET", path: "admin/products/:productId/skus", kind: "read", requires: "collectible-instance:read" },
  { method: "GET", path: "admin/products/:productId/skus/summary", kind: "read", requires: "collectible-instance:read" },
  { method: "GET", path: "admin/products/:productId/images", kind: "read", requires: "drop:read" },
  { method: "GET", path: "admin/products/:productId/prices", kind: "read", requires: "drop:read" },
  /* Owner directories for the drop form's pickers and for naming catalog rows.
     Gated on drop:read, NOT brand-artist-record:read — that is deliberate. */
  { method: "GET", path: "admin/organizations", kind: "read", requires: "drop:read" },
  { method: "GET", path: "admin/artists", kind: "read", requires: "drop:read" },
  { method: "GET", path: "admin/skus", kind: "read", requires: "collectible-instance:read" },
  { method: "GET", path: "admin/skus/:skuId", kind: "read", requires: "collectible-instance:read" },
  { method: "GET", path: "admin/skus/code/:skuCode", kind: "read", requires: "collectible-instance:read" },
  { method: "POST", path: "admin/products", kind: "write", requires: "drop:manage", workflow: "drop-creation" },
  { method: "PATCH", path: "admin/products/:productId", kind: "write", requires: "drop:manage", workflow: "drop-creation" },
  { method: "DELETE", path: "admin/products/:productId", kind: "write", requires: "drop:manage", workflow: "drop-creation" },
  { method: "POST", path: "admin/products/:productId/publish", kind: "act", requires: "drop:manage:global", workflow: "release-approval" },
  { method: "POST", path: "admin/products/:productId/images", kind: "write", requires: "drop:manage", workflow: "drop-gallery" },
  { method: "PUT", path: "admin/products/:productId/images", kind: "write", requires: "drop:manage", workflow: "drop-gallery" },
  { method: "PUT", path: "admin/products/:productId/prices", kind: "write", requires: "drop:manage", workflow: "drop-pricing" },
  { method: "DELETE", path: "admin/products/:productId/images/:imageId", kind: "write", requires: "drop:manage", workflow: "drop-gallery" },
  { method: "POST", path: "admin/products/:productId/skus", kind: "act", requires: "collectible-instance:manage", workflow: "minting" },
  { method: "POST", path: "admin/products/:productId/skus/tags", kind: "act", requires: "nfc-tag-claim:manage", workflow: "tag-binding" },
  { method: "POST", path: "admin/skus/:skuId/tag", kind: "act", requires: "nfc-tag-claim:manage", workflow: "tag-binding" },

  /* ---- release approvals ------------------------------------------- */
  { method: "GET", path: "admin/releases", kind: "read", requires: "release-approval:read", probe: "admin/releases" },
  { method: "GET", path: "admin/releases/:approvalId", kind: "read", requires: "release-approval:read" },
  { method: "POST", path: "admin/releases", kind: "act", requires: "drop:manage", workflow: "release-approval" },
  { method: "PATCH", path: "admin/releases/:approvalId", kind: "act", requires: "release-approval:manage", workflow: "release-approval" },
  { method: "POST", path: "admin/releases/:approvalId/decision", kind: "act", requires: "release-approval:approve|reject|manage", workflow: "release-approval" },
  { method: "POST", path: "admin/releases/:approvalId/reopen", kind: "act", requires: "release-approval:override", workflow: "release-approval" },

  /* ---- markets ----------------------------------------------------- */
  { method: "GET", path: "admin/markets", kind: "read", requires: "reports-dashboards:read", probe: "admin/markets" },
  { method: "GET", path: "admin/markets/:marketId", kind: "read", requires: "reports-dashboards:read" },
  { method: "POST", path: "admin/markets", kind: "write", requires: "reports-dashboards:manage", workflow: "market-admin" },
  { method: "PATCH", path: "admin/markets/:marketId", kind: "write", requires: "reports-dashboards:manage", workflow: "market-admin" },
  { method: "DELETE", path: "admin/markets/:marketId", kind: "write", requires: "reports-dashboards:manage", workflow: "market-admin" },

  /* ---- media ------------------------------------------------------- */
  { method: "GET", path: "admin/media", kind: "read", requires: "assets-documents-upload:read", probe: "admin/media" },
  { method: "GET", path: "admin/media/:assetId/url", kind: "read", requires: "assets-documents-upload:read" },
  { method: "DELETE", path: "admin/media/:assetId", kind: "write", requires: "assets-documents-upload:manage", workflow: "media" },

  /* ---- finance ----------------------------------------------------- */
  { method: "GET", path: "admin/finance/royalty-rules", kind: "read", requires: "payment-royalty:read", probe: "admin/finance/royalty-rules" },
  { method: "GET", path: "admin/finance/royalty-entries", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/finance/royalty-entries/:entryId", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/finance/balances", kind: "read", requires: "payment-royalty:read", probe: "admin/finance/balances" },
  { method: "GET", path: "admin/finance/payouts", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/finance/payouts/:payoutId", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/finance/adjustments", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/finance/ledger", kind: "read", requires: "payment-royalty:read" },
  { method: "POST", path: "admin/finance/royalty-rules", kind: "write", requires: "payment-royalty:manage", workflow: "royalty-rules" },
  { method: "POST", path: "admin/finance/royalty-rules/:ruleId/close", kind: "act", requires: "payment-royalty:manage", workflow: "royalty-rules" },
  { method: "POST", path: "admin/finance/royalty-entries/:entryId/reverse", kind: "act", requires: "payment-royalty:override", workflow: "royalty-reversal" },
  { method: "POST", path: "admin/finance/payouts", kind: "act", requires: "payment-royalty:manage", workflow: "payout-run" },
  { method: "POST", path: "admin/finance/payouts/:payoutId/approve", kind: "act", requires: "payment-royalty:manage", workflow: "payout-run" },
  { method: "POST", path: "admin/finance/payouts/:payoutId/execute", kind: "act", requires: "payment-royalty:manage", workflow: "payout-run" },
  { method: "POST", path: "admin/finance/payouts/:payoutId/fail", kind: "act", requires: "payment-royalty:manage", workflow: "payout-run" },
  { method: "POST", path: "admin/finance/adjustments", kind: "act", requires: "payment-royalty:manage", workflow: "adjustment" },

  /* ---- payments ---------------------------------------------------- */
  { method: "GET", path: "admin/payments/transactions", kind: "read", requires: "payment-royalty:read", probe: "admin/payments/transactions" },
  { method: "GET", path: "admin/payments/transactions/:paymentId", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/payments/refunds", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/payments/refunds/:refundId", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/payments/disputes", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/payments/disputes/:disputeId", kind: "read", requires: "payment-royalty:read" },
  { method: "GET", path: "admin/payments/gateway-configs", kind: "read", requires: "payment-royalty:configure" },
  { method: "GET", path: "admin/payments/webhook-events", kind: "read", requires: "payment-royalty:read" },
  { method: "POST", path: "admin/payments/transactions/:paymentId/review", kind: "act", requires: "payment-royalty:manage", workflow: "payment-review" },
  { method: "POST", path: "admin/payments/refunds/:refundId/confirm-return", kind: "act", requires: "order:refund + payment-royalty", workflow: "refund" },
  { method: "POST", path: "admin/payments/refunds/:refundId/approve", kind: "act", requires: "order:refund + payment-royalty", workflow: "refund" },
  { method: "POST", path: "admin/payments/refunds/:refundId/reject", kind: "act", requires: "order:refund + payment-royalty", workflow: "refund" },
  { method: "POST", path: "admin/payments/refunds/:refundId/process", kind: "act", requires: "order:refund + payment-royalty", workflow: "refund" },
  { method: "POST", path: "admin/payments/disputes", kind: "write", requires: "payment-royalty:manage", workflow: "dispute" },
  { method: "POST", path: "admin/payments/disputes/:disputeId/evidence", kind: "act", requires: "payment-royalty:manage", workflow: "dispute" },
  { method: "POST", path: "admin/payments/disputes/:disputeId/resolve", kind: "act", requires: "payment-royalty:manage", workflow: "dispute" },
  { method: "PATCH", path: "admin/payments/gateway-configs/:configId", kind: "write", requires: "payment-royalty:configure", workflow: "gateway-config" },

  /* ---- audit ------------------------------------------------------- */
  { method: "GET", path: "admin/audit-logs", kind: "read", requires: "audit-log:read", probe: "admin/audit-logs" },
];

export const READS = API.filter((e) => e.kind === "read");
export const WRITES = API.filter((e) => e.kind !== "read");

/** Endpoints with no path parameter — callable without knowing a live id. */
export const COLLECTION_READS = READS.filter((e) => !e.path.includes(":"));

/**
 * The operator workflows, as state machines.
 *
 * `terminal` states accept nothing further. These are asserted against the
 * server's own `allowedTransitions`, never used to drive a write.
 */
export interface Workflow {
  name: string;
  /** The screen an operator drives it from. */
  screen: string;
  steps: string[];
  /** Why getting this wrong is expensive. */
  stakes: string;
}

export const WORKFLOWS: Workflow[] = [
  {
    name: "refund",
    screen: "/payments/refunds",
    steps: ["confirm-return", "approve", "reject", "process"],
    stakes:
      "process revokes ownership, quarantines the tag, sends the money and reverses the royalty — four irreversible effects in one call",
  },
  {
    name: "payout-run",
    screen: "/finance/payouts",
    steps: ["schedule", "approve", "execute", "fail"],
    stakes: "execute pays real money to real people",
  },
  {
    name: "release-approval",
    screen: "/release-approvals",
    steps: ["submit", "amend", "decision", "reopen", "publish"],
    stakes:
      "an approval is a compliance record attributed to whoever made it; reversing one needs the override permission",
  },
  {
    name: "order-lifecycle",
    screen: "/orders",
    steps: ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"],
    stakes:
      "PAID and REFUNDED are written by the payment pipelines, never by hand — the console must not offer them",
  },
  {
    name: "royalty-reversal",
    screen: "/finance/royalties",
    steps: ["reverse"],
    stakes:
      "cancels money someone is owed, and reversing twice would double-credit it",
  },
  {
    name: "role-lifecycle",
    screen: "/roles",
    steps: ["create", "edit", "deactivate", "delete"],
    stakes: "seeded roles are immutable; a role still assigned cannot be deleted",
  },
  {
    name: "role-assignment",
    screen: "/team",
    steps: ["assign", "revoke"],
    stakes: "a person holds a list of roles — assignment is additive, not a replace",
  },
  {
    name: "staff-invitation",
    screen: "/team/invitations",
    steps: ["invite", "revoke"],
    stakes:
      "an invitation is a role assignment that lands later — the escalation check runs when it is CREATED and is never re-run at claim time",
  },
  {
    name: "dispute",
    screen: "/payments/disputes",
    steps: ["open", "evidence", "resolve"],
    stakes: "evidence has a deadline the platform loses the case by missing",
  },
  {
    name: "minting",
    screen: "/products",
    steps: ["mint", "bind-tag"],
    stakes:
      "minting past declared supply, or binding a tag already bound, corrupts the authenticity record",
  },
];
