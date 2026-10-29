/**
 * Shapes emitted by the HitBox Collectibles admin API.
 *
 * Sourced from the four backend docs handed off for this integration:
 *   - admin-api-reference.md    (module-by-module, "real shapes", authoritative on fields)
 *   - admin-console-api.md      (screen-by-screen, design-to-field mapping, documented gaps)
 *   - admin-write-apis.md       (markets, orders, products, releases, roles, team)
 *   - authentication.md         (Clerk session -> local authz resolution)
 *
 * The single most important rule this file encodes: a section the caller
 * cannot see is OMITTED, not empty. Every permission-gated section is
 * therefore declared optional, and the UI must branch on key presence
 * rather than on a truthy check of the contents.
 *
 * Where the docs disagree, the SERVICE MAPPER WINS. Two places they do:
 *
 *  1. Role create takes `permissions` (catalog key strings), not the
 *     `permissionIds` in admin-console-api.md §15 — the catalog exposes no
 *     permission `id` for that field to reference.
 *  2. A role is returned as `{ id, …, permissions: [{key, description}] }`.
 *     admin-console-api.md §15 shows `roleId`/`permissionCount`/
 *     `assignedCount` instead; none of those three fields exist. Checked
 *     against `toResponse()` in
 *     packages/access-control/src/service/role.service.ts. The assignment
 *     rows in that module disagree with the docs the same way — see
 *     RoleAssignment below.
 */

/** Money is always keyed by currency. Values are strings (Postgres numeric). */
export type Money = Record<string, string>;

export type Period = "week" | "month" | "year" | "custom";

export interface PeriodInfo {
  type: Period;
  from: string;
  to: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export type ErrorCode =
  // requireAuth pipeline (authentication.md §3) — checked in this order
  | "AUTH_UNAUTHENTICATED" // no token supplied
  | "AUTH_INVALID_TOKEN" // signature/expiry/azp failed — retry once with skipCache, then sign out
  | "AUTH_ACCOUNT_NOT_FOUND" // Clerk session valid, local User row not synced yet (webhook race)
  | "AUTH_ACCOUNT_SUSPENDED" // terminal — sign out
  | "AUTH_EMAIL_UNVERIFIED"
  // authorization
  | "AUTHZ_FORBIDDEN"
  | "SCOPE_MISMATCH"
  | "NOT_FOUND"
  | "AUTHZ_ROLE_IN_USE"
  | "AUTHZ_ROLE_IMMUTABLE"
  | "AUTHZ_DOMAIN_VIOLATION"
  | "VALIDATION_ERROR"
  | "INVALID_RANGE"
  | "STORAGE_UNAVAILABLE"
  | "UNSUPPORTED_MIME_TYPE"
  | "FILE_TOO_LARGE"
  | "INVALID_OWNER"
  // markets (admin-write-apis.md §8)
  | "MARKETS_NOT_FOUND"
  | "MARKETS_CODE_TAKEN"
  | "MARKETS_COUNTRY_TAKEN"
  | "MARKETS_IN_USE"
  | "MARKETS_DEFAULT_REQUIRED"
  // orders
  | "ORDERS_NOT_FOUND"
  | "ORDERS_INVALID_TRANSITION"
  | "ORDERS_STATUS_NOT_SETTABLE"
  // releases
  | "RELEASES_NOT_FOUND"
  | "RELEASES_ALREADY_DECIDED"
  | "RELEASES_ALREADY_PENDING"
  | "RELEASES_COMMENT_REQUIRED"
  | "RELEASES_COMPLIANCE_INCOMPLETE"
  // product upload / gallery (product-upload-api.md §4)
  | "BODY_REQUIRED"
  | "PRODUCTS_NOT_FOUND"
  | "PRODUCTS_CODE_TAKEN"
  | "PRODUCTS_MEDIA_UNAVAILABLE"
  | "PRODUCTS_IMAGE_ASSET_INVALID"
  | "PRODUCTS_IMAGE_DUPLICATE"
  | "PRODUCTS_IMAGE_NOT_FOUND"
  // market pricing (product-upload-api.md §3 and §5)
  | "PRODUCTS_MARKETS_UNAVAILABLE"
  | "PRODUCTS_PRICE_MARKET_INVALID"
  | "PRODUCTS_PRICE_NOT_FOUND"
  | "PRODUCTS_PRICE_REQUIRED"
  // tag manifests (sku-api.md §3a)
  | "SKUS_UNIT_NOT_IN_PRODUCT"
  | "SKUS_TAG_ALREADY_BOUND"
  | "SKUS_TAG_REPLACE_REFUSED"
  // serialized units (sku-api.md §7)
  | "SKUS_NOT_FOUND"
  | "SKUS_PRODUCT_NOT_FOUND"
  | "SKUS_SUPPLY_EXCEEDED"
  | "SKUS_TAG_TAKEN"
  | "SKUS_SERIAL_TAKEN"
  | "SKUS_VARIANT_MISMATCH"
  | "SKUS_FORBIDDEN"
  | "PRODUCTS_MINTING_UNAVAILABLE"
  | "PRODUCTS_SUPPLY_EXCEEDED"
  // finance — royalties, payouts, adjustments (docs/finance/api-reference.md)
  | "FINANCE_NOT_FOUND"
  | "FINANCE_FORBIDDEN"
  | "FINANCE_NO_RULE"
  | "FINANCE_NOT_ACCRUABLE"
  | "FINANCE_INVALID_RULE"
  | "FINANCE_IMMUTABLE"
  | "FINANCE_INVALID_TRANSITION"
  | "FINANCE_NOTHING_TO_PAY"
  | "FINANCE_ALREADY_REVERSED"
  // payments — charges, refunds, disputes, gateways
  | "PAYMENTS_NOT_FOUND"
  | "PAYMENTS_FORBIDDEN"
  | "PAYMENTS_NOT_PURCHASABLE"
  | "PAYMENTS_OUT_OF_STOCK"
  | "PAYMENTS_NO_PRICE"
  | "PAYMENTS_RESERVATION_EXPIRED"
  | "PAYMENTS_INVALID_SIGNATURE"
  | "PAYMENTS_NO_GATEWAY"
  | "PAYMENTS_INVALID_TRANSITION"
  | "PAYMENTS_NOT_REFUNDABLE"
  | "PAYMENTS_RETURN_NOT_CONFIRMED"
  | "PAYMENTS_AMOUNT_EXCEEDS_CAPTURE"
  | "PAYMENTS_GATEWAY_UNAVAILABLE"
  // role assignment
  | "ACCESS_CONTROL_ASSIGNMENT_EXISTS"
  | "ACCESS_CONTROL_MISSING_ORG_SCOPE"
  | "ACCESS_CONTROL_ROLE_NOT_FOUND"
  // staff invitations (admin-provisioning.md §6). These are the access-control
  // module's OWN codes, prefixed AUTHZ_ rather than ACCESS_CONTROL_ — the two
  // families are not interchangeable and the invitation routes emit these.
  | "AUTHZ_ROLE_NOT_FOUND"
  | "AUTHZ_MISSING_ORG_SCOPE"
  | "AUTHZ_ASSIGNMENT_EXISTS"
  | "NETWORK_ERROR";

/* ------------------------------------------------------------------ */
/* authz/me                                                            */
/* ------------------------------------------------------------------ */

export interface AuthzRoleRef {
  roleId: string;
  roleName: string;
  organizationId: string | null;
}

export interface AuthzMe {
  userId: string;
  permissions: string[];
  roles: AuthzRoleRef[];
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DashboardSummary {
  totalUsers?: number;
  newUsers?: number;
  adminUsers?: number;
  totalOrders?: number;
  newOrders?: number;
  totalProducts?: number;
  grossRevenue?: Money;
  netRevenue?: Money;
  refunds?: Money;
  profit?: Money;
}

export interface UsersSection {
  total: number;
  new: number;
  active: number;
  inactive: number;
  newAdmins?: number;
  totalAdmins?: number;
  /** null when the previous window was empty - distinct from 0. */
  growthPercentage: number | null;
  trend: { date: string; users: number }[];
  byMarket: {
    marketId: string;
    code: string;
    name: string;
    users: number;
    newUsers: number;
  }[];
}

export interface OrdersSection {
  total: number;
  new: number;
  growthPercentage: number | null;
  pendingPayment: number;
  paid: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  refunded: number;
  trend: { date: string; orders: number }[];
  byMarket: { marketId: string; orders: number; newOrders: number }[];
}

export interface FinanceSection {
  grossRevenue: Money; // sum of Order.amount
  collectedRevenue: Money; // succeeded payments only
  refundedAmount: Money; // processed refunds only
  netRevenue: Money; // collected - refunded
  costOfGoods: Money;
  gatewayFees: Money;
  royalties: Money;
  profit: Money; // net - costOfGoods - gatewayFees - royalties
}

export interface PaymentsSection {
  successful: number;
  pending: number;
  initiated: number;
  failed: number;
  needsReview: number;
  amount: Money;
}

export interface RefundsSection {
  requested: number;
  awaitingReturn: number;
  approved: number;
  processed: number;
  rejected: number;
  /** Present only with payment-royalty:read. */
  amount?: Money;
}

export interface MarketRow {
  marketId: string;
  code: string;
  name: string;
  currency: string;
  users: number;
  newUsers: number;
  orders: number;
  newOrders: number;
  /** Keyed only by this market's own currency — always exactly one key. */
  revenue?: Money;
}

export interface InventoryRow {
  productId: string;
  name: string;
  totalSupply: number;
  reserved: number;
  committed: number;
  claimed: number;
  sold: number;
  available: number;
}

export interface ProductsSection {
  total: number;
  new: number;
  draft: number;
  submitted: number;
  inReview: number;
  approved: number;
  rejected: number;
  published: number;
  active: number;
  ended: number;
  archived: number;
  /** Capped at 10. Full list is the /products sub-endpoint. */
  inventory: InventoryRow[];
}

export interface ContentSection {
  totalBundles: number;
  activeBundles: number;
  newBundles: number;
  unlocksThisPeriod: number;
  avgAccessCount: number;
}

export interface ArtistsSection {
  total: number;
  active: number;
  new: number;
  public: number;
}

export interface OrganizationsSection {
  total: number;
  byType: Record<string, number>;
}

export interface OperationsSection {
  ordersPendingPayment: number;
  ordersProcessing: number;
  ordersAwaitingShipment: number;
  ordersShipped: number;
  ordersDelivered: number;
  refundsAwaitingAction: number;
  /** Present only with payment-royalty:read. */
  paymentsNeedingReview?: number;
}

export interface ProvenanceSection {
  claimed: Record<string, number>;
  lifecycle: Record<string, number>;
  resaleBlocked: number;
  tampered: number;
  cases: Record<string, number>;
}

export interface PaymentGatewayConfig {
  id: string;
  scope: string;
  gateway: string;
  isDefault: boolean;
  status: string;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The normalised audit event every component renders.
 *
 * The two endpoints that carry audit events disagree on one field name, so
 * `useActivity` normalises to this before anything sees it:
 *
 *   GET /admin/dashboard          -> `activity[]`, mapped server-side: `type`
 *   GET /admin/dashboard/activity -> `items[]`, a raw passthrough of the
 *                                    select: `eventType` (plus `actorType`
 *                                    and `organizationId`, which the mapped
 *                                    version drops)
 *
 * `dashboard.service.ts` does the rename in its aggregate branch and not in
 * its `activity()` branch. Rendering `type` straight from the sub-endpoint is
 * therefore `undefined`, which is what crashed the Activity screen.
 */
export interface ActivityEvent {
  eventId: string;
  occurredAt: string;
  type: string;
  actorId: string;
  /**
   * The role the actor held AT THE TIME. Render this, not their current
   * roles. NULLABLE in the schema (AuditEvent.actorRoleSnapshot is String?) —
   * a system-generated event has no role behind it.
   */
  actorRoleSnapshot: string | null;
  resourceType: string;
  resourceId: string;
  actionResult: "SUCCESS" | "FAILURE" | string;
  severity: "INFO" | "WARNING" | "CRITICAL" | string;
  /** Sub-endpoint only — absent on the dashboard aggregate's copy. */
  actorType?: string;
  organizationId?: string | null;
}

/** Exactly what GET /admin/dashboard/activity puts on the wire. */
export interface ActivityEventRaw extends Omit<ActivityEvent, "type"> {
  eventType?: string;
  /** Present when the payload came from the aggregate rather than the list. */
  type?: string;
}

/** Every section below `period` is optional - omitted means "not permitted". */
export interface DashboardResponse {
  period: PeriodInfo;
  summary: DashboardSummary;
  users?: UsersSection;
  orders?: OrdersSection;
  finance?: FinanceSection;
  payments?: PaymentsSection;
  refunds?: RefundsSection;
  markets?: MarketRow[];
  products?: ProductsSection;
  content?: ContentSection;
  artists?: ArtistsSection;
  organizations?: OrganizationsSection;
  operations?: OperationsSection;
  provenance?: ProvenanceSection;
  paymentGatewayConfig?: PaymentGatewayConfig[];
  activity?: ActivityEvent[];
}

/* ------------------------------------------------------------------ */
/* Paginated sub-endpoints                                             */
/* ------------------------------------------------------------------ */

export interface Paginated<T> {
  page: number;
  limit: number;
  total: number;
  items: T[];
}

export interface OrderRow {
  id: string;
  status: string;
  quantity: number;
  marketId: string;
  organizationId: string;
  productId: string;
  skuId: string;
  placedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  /** Only with payment-royalty:read. */
  amount?: string;
  currency?: string;
  /** Only with buyer-profile:read; truncated to 8 chars + ellipsis unless FULL visibility. */
  buyerId?: string;
}

export interface ReleaseApprovalRow {
  id: string;
  productId: string;
  status: string;
  version: number;
  comment: string | null;
  complianceStatus: string;
  oddsDisclosureRef: string | null;
  decidedAt: string | null;
  createdAt: string;
  product: {
    name: string;
    isAgeSpecific: boolean;
    minimumAge: number | null;
    status: string;
  };
}

export interface ProvenanceCaseRow {
  id: string;
  /** COUNTERFEIT | STOLEN | CLONED | TAMPERED */
  caseType: string;
  /** OPEN | INVESTIGATING | RESOLVED */
  status: string;
  tagId: string;
  skuId: string;
  reporterId: string;
  description: string;
  resolvedAt: string | null;
  createdAt: string;
  sku: {
    tagLifecycleState: string;
    tamperStatus: string | null;
    claimedStatus: string;
  };
}

/** `summary.cases` is unfiltered — always every status regardless of the query. */
export interface ProvenanceListResponse extends Paginated<ProvenanceCaseRow> {
  summary: { cases: Record<string, number> };
}

/**
 * GET /admin/dashboard/products — the CATALOG row, not the inventory row.
 *
 * admin-console-api.md §7 says these items are "the same inventory shape the
 * dashboard previews" (with sold/available/claimed). They are not: the
 * repository selects the catalog columns below and no counts at all. Checked
 * against `listProducts()` in
 * packages/dashboard/src/repository/dashboard.repository.ts.
 *
 * Sold / available / claimed live on AdminProductDetail.performance, one
 * product at a time — so the list links into the detail rather than showing
 * columns the endpoint cannot fill.
 */
export interface ProductRow {
  id: string;
  groupCode: string;
  name: string;
  status: string;
  totalSupply: number;
  complianceStatus: string | null;
  isAgeSpecific: boolean;
  minimumAge: number | null;
  organizationId: string | null;
  artistId: string | null;
  publishedAt: string | null;
  createdAt: string;
  publicCode?: string;
  collectionId?: string | null;
  isActive?: boolean;
}

/**
 * Documented gap (admin-console-api.md §8): no product name, no status enum,
 * no ordered-vs-received split. This is the entire real shape — do not
 * fabricate the fields the design shows but the API does not return.
 */
export interface SupplyRow {
  id: string;
  vendorId: string;
  itemType: string;
  quantity: number;
  batchRef: string | null;
  receivedAt: string | null;
  notes: string | null;
  vendor: { name: string; vendorType: string };
}

export interface SupplyListResponse extends Paginated<SupplyRow> {
  activeVendors: number;
}

/**
 * Documented gap (admin-console-api.md §5): items carry `skuId` only — no
 * product name, no seller id. `createdAt` is the field name (not `listedAt`).
 */
export interface ResaleRow {
  id: string;
  skuId: string;
  status: string;
  createdAt: string;
  /** Only with payment-royalty:read. */
  price?: string;
  currency?: string;
}

/** `counts` is unfiltered — always every status regardless of the `status` query. */
export interface ResaleListResponse extends Paginated<ResaleRow> {
  counts: Record<string, number>;
}

/**
 * `follows` counts follows of the product's ARTIST, not the product itself —
 * that is what the underlying query does (admin-console-api.md §9). Label it
 * as artist reach, not "watchers", or it misrepresents what is being counted.
 * No pagination: always the top 10 by wishlist count.
 */
export interface DemandSignalRow {
  productId: string;
  name: string;
  follows: number;
  wishlists: number;
}

/* ------------------------------------------------------------------ */
/* Authorization administration                                        */
/* ------------------------------------------------------------------ */

export type PermissionDomain = "BUSINESS" | "TECHNICAL";

export interface PermissionEntry {
  key: string;
  actionLabel: string;
  scopeLabel: string;
  description: string;
}

export interface PermissionGroup {
  resource: string;
  group: string;
  domain: PermissionDomain;
  permissions: PermissionEntry[];
}

/** One entry of a role's permission set. The catalog is the only source. */
export interface RolePermissionRef {
  key: string;
  description: string | null;
}

/**
 * GET /admin/authz/roles and /roles/:roleId return the SAME shape — the list
 * already carries every permission, so the detail screen needs no second call
 * (admin-write-apis.md §6).
 *
 * Verified against `toResponse()` in
 * packages/access-control/src/service/role.service.ts, which is authoritative
 * over the docs here: admin-console-api.md §15 shows `permissionCount` /
 * `assignedCount` and admin-write-apis.md §6 shows `permissions[]`. Only the
 * latter is real, and the primary key is `id` — never `roleId`.
 */
export interface Role {
  id: string;
  name: string;
  displayName: string;
  entityGroup: string;
  domain: PermissionDomain;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  permissions: RolePermissionRef[];
}

/** The list and the detail are one shape; the alias keeps call sites honest. */
export type RoleSummary = Role;

export type ScopeType = "GLOBAL" | "ORGANIZATION" | "OWN";

/**
 * GET/POST /admin/authz/users/:userId/roles — `AssignmentResponse` from
 * packages/access-control/src/service/role-assignment.service.ts. Note this
 * is NOT the nested shape the team list uses: here the row's own id is `id`,
 * the label is `roleDisplayName`, and the timestamp is `grantedAt`.
 */
export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  roleDisplayName: string;
  domain: PermissionDomain;
  scopeType: ScopeType;
  organizationId: string | null;
  grantedById: string | null;
  grantedAt: string;
  /** Revoking is a soft delete — the row survives with this set, for audit. */
  revokedAt: string | null;
}

/**
 * GET /admin/authz/team — "anyone holding at least one live role", one row
 * per person with roles nested (the union of their grants, never merged).
 */
export interface TeamRoleEntry {
  assignmentId: string;
  roleId: string;
  name: string;
  displayName: string;
  domain: PermissionDomain;
  /** Drives the internalOnly filter server-side; shown as the persona family. */
  entityGroup: string;
  isSystem: boolean;
  scopeType: ScopeType;
  organizationId: string | null;
  grantedAt: string;
}

export interface TeamMember {
  userId: string;
  /*
   * Both null for a member who holds a role but has not filled in a profile —
   * typically someone provisioned by invitation who has only ever confirmed an
   * email. Render them through personLabel()/personInitials().
   */
  fullName: string | null;
  handle: string | null;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
  joinedAt: string;
  roles: TeamRoleEntry[];
}

/* ------------------------------------------------------------------ */
/* Staff invitations                                                   */
/*                                                                     */
/* Provisioning a colleague who has no HitBox account yet              */
/* (docs/authorization/admin-provisioning.md §6).                      */
/*                                                                     */
/* The role is NOT carried in Clerk's invitation metadata — it lives in */
/* a StaffInvitation row in this database, so the grant is auditable,   */
/* revocable through our own API and readable by the permission engine  */
/* (§3.2). Clerk is told one thing: email this address a sign-up link.  */
/* The role lands later, when `users.account.provisioned` fires after   */
/* the User row commits — which is why an invitation can sit SENT for   */
/* days and why this is a queue the dashboard has to show.              */
/* ------------------------------------------------------------------ */

/**
 * PENDING is the row written BEFORE the provider is called (§3.4): a crash
 * between the write and the send leaves one, and an operator has to be able
 * to see it and retry. FAILED carries the provider's own refusal in
 * `providerError` and is deliberately not rolled back into silence.
 *
 * So neither PENDING nor FAILED is a state the happy path rests in, and the
 * UI treats both as needing attention rather than as "in progress".
 */
export type StaffInvitationStatus =
  | "PENDING"
  | "SENT"
  | "ACCEPTED"
  | "REVOKED"
  | "EXPIRED"
  | "FAILED";

export interface StaffInvitation {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  roleDisplayName: string;
  scopeType: ScopeType;
  organizationId: string | null;
  status: StaffInvitationStatus;
  invitedById: string | null;
  invitedAt: string;
  /** 72 hours after `invitedAt` by default (`ADMIN_INVITATION_TTL_HOURS`). */
  expiresAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
  /** The grant, once it lands — set immediately on the ROLE_ASSIGNED path. */
  assignmentId: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  /** Why the provider refused, on a FAILED row. */
  providerError: string | null;
}

/**
 * Which of the two paths `POST /invitations` took.
 *
 * It is in the response BODY rather than inferred from the status, because
 * the dashboard has to say two different things (§4): "Priya now has the
 * Order Manager role" when the address already had an account, versus "we've
 * emailed priya@… ; she'll have the role once she accepts" when it did not.
 */
export type InvitationOutcome = "INVITATION_SENT" | "ROLE_ASSIGNED";

export interface CreateInvitationInput {
  email: string;
  roleId: string;
  /**
   * Optional. Omitted, the role's natural scope is used — so the dashboard
   * does not have to know that BRAND_ADMIN is org-scoped and HITBOX_SUPPORT
   * is not. An org-scoped role sent without an `organizationId` is a 400.
   */
  scopeType?: ScopeType;
  organizationId?: string | null;
}

export interface CreateInvitationResult {
  outcome: InvitationOutcome;
  /** Non-null only on the ROLE_ASSIGNED path. */
  assignmentId: string | null;
  invitation: StaffInvitation;
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

/**
 * There is no virus scanner in this deployment — no SQS, no scan worker, no
 * callback. Every asset uploaded now is created SKIPPED and is immediately
 * servable. CLEAN appears only on rows predating the change; treat CLEAN and
 * SKIPPED identically as servable, PENDING and INFECTED as not. Do not poll
 * this field and do not build a "processing" state — nothing transitions.
 */
export type VirusScanStatus = "PENDING" | "CLEAN" | "INFECTED" | "SKIPPED";

export type AssetType =
  | "DROP_IMAGE"
  | "PROFILE_IMAGE"
  | "EXCLUSIVE_CONTENT"
  | "LEGAL_DOCUMENT"
  | "SUPPLY_SPREADSHEET"
  | "OTHER";

export interface MediaAsset {
  assetId: string;
  assetType: AssetType;
  fileName: string;
  /** An S3 key, not a URL. Never build a URL from it — use publicUrl or /url. */
  storageRef: string;
  /**
   * The permanent object URL. Non-null ONLY for DROP_IMAGE and PROFILE_IMAGE
   * (the two anonymously-readable prefixes) — render it directly, no
   * per-render call. Null for every other type; fetch GET /:assetId/url.
   */
  publicUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  virusScanStatus: VirusScanStatus;
  productId: string | null;
  collectionId: string | null;
  organizationId: string | null;
  artistId: string | null;
  uploadedById: string;
  archivedAt: string | null;
  createdAt: string;
}

export interface MediaListResponse extends Paginated<MediaAsset> {
  byType: Record<string, number>;
  byScanStatus: Record<string, number>;
}

export interface UploadUrlResponse {
  assetId: string;
  uploadUrl: string;
  expiresIn: number;
  storageRef: string;
  bucket: string;
  publicUrl: string | null;
}

/**
 * GET /admin/media/:assetId/url. A client that just renders `url` needs no
 * branching between the two shapes: fetch fresh when `expiresIn` is a
 * number, cache/store when it is null (permanent).
 */
export interface MediaAssetUrl {
  url: string;
  expiresIn: number | null;
  public: boolean;
}

/* ------------------------------------------------------------------ */
/* Markets — /admin/markets (admin-write-apis.md §1)                   */
/*                                                                      */
/* Distinct from MarketRow above: that one is the reporting re-slice    */
/* (/admin/dashboard/markets), this one is the managed record.          */
/* ------------------------------------------------------------------ */

export type MarketCurrency = "USD" | "INR" | "GBP";

export interface AdminMarket {
  id: string;
  code: string;
  name: string;
  currency: string;
  isActive: boolean;
  /** Exactly one market carries this at all times; promoting demotes the other. */
  isDefault: boolean;
  countryCodes: string[];
  /** Live reference counts — a non-zero productPrices refuses an archive. */
  usage: { productPrices: number; orders: number };
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketInput {
  code?: string;
  name?: string;
  currency?: MarketCurrency;
  isActive?: boolean;
  isDefault?: boolean;
  /** Replaced wholesale on PATCH, never merged — always send the full list. */
  countryCodes?: string[];
}

/* ------------------------------------------------------------------ */
/* Orders — /admin/orders (admin-write-apis.md §2)                     */
/* ------------------------------------------------------------------ */

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

/** PAID and REFUNDED are written by the payment pipelines, never by hand. */
export type SettableOrderStatus = "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

/**
 * Richer than the dashboard OrderRow: the buyer email and the product
 * code/name are resolved at the database, so a page of 20 orders costs two
 * joins rather than 40 client-side lookups.
 */
export interface AdminOrderRow {
  id: string;
  status: OrderStatus;
  quantity: number;
  productId: string;
  productCode: string;
  productName: string;
  variantId: string | null;
  skuId: string | null;
  marketId: string;
  organizationId: string | null;
  placedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  /** The next three only with buyer-profile:read. */
  buyerId?: string;
  buyerEmail?: string;
  buyerName?: string;
  /** The next three only with payment-royalty:read. */
  amount?: string;
  unitPrice?: string;
  currency?: string;
  /**
   * When a packer scanned the physical unit (order-unit-assignment-api.md).
   * Until it is set, `skuId` is only the checkout PLACEHOLDER, and SHIPPED is
   * refused (400 ORDERS_UNIT_NOT_ASSIGNED).
   */
  unitAssignedAt?: string | null;
}

/**
 * ALLOCATED — settled and owned by this order.
 * HELD      — a temporary hold while payment is pending; reservationExpiresAt
 *             is when a sweeper releases it.
 * RELEASED  — the hold expired or the order was cancelled.
 */
export type SkuAllocation = "ALLOCATED" | "HELD" | "RELEASED";

export interface OrderSkuUnit {
  skuId: string;
  skuCode: string;
  serialNumber: number;
  allocation: SkuAllocation;
  claimedStatus: string | null;
  tagId: string | null;
  tagLifecycleState: string | null;
  ownerId: string | null;
  resaleBlocked: boolean;
  reservationId: string | null;
  reservationExpiresAt: string | null;
}

export interface OrderAddress {
  usage: string;
  label: string | null;
  labelCustom: string | null;
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  countryCode: string;
  phone: string | null;
}

export interface OrderPayment {
  id: string;
  status: string;
  gateway: string | null;
  amount: string;
  currency: string;
  createdAt: string;
  /** The Stripe charge (`pi_…`) — link to the Stripe dashboard with it. */
  gatewayRef?: string | null;
  needsReview?: boolean;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  /** Why a FAILED attempt failed. */
  failureReason?: string | null;
  updatedAt?: string;
}

/** A refund as embedded on the order detail (order-payments-and-refunds-api.md §2). */
export interface OrderRefund {
  id: string;
  status: string;
  reasonCode: string;
  reason: string;
  amount: string;
  currency: string;
  physicalReturnRequired: boolean;
  physicalReturnConfirmedAt: string | null;
  nfcTagCondition: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  /** The Stripe refund (`re_…`). */
  gatewayRefundId: string | null;
  processedAt: string | null;
  claimRevokedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  /** Legacy shape — older payloads carried only these. */
  gateway?: string | null;
  gatewayStatus?: RefundGatewayStatus | null;
  gatewayFailureReason?: string | null;
}

/** Stripe's view of the money, separate from the workflow `status`. */
export type RefundGatewayStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";

export type RefundBlockedReason =
  | "NO_PERMISSION"
  | "ORDER_NOT_REFUNDABLE"
  | "REFUND_IN_PROGRESS"
  | "FULLY_REFUNDED";

/**
 * The order's money, worked out server-side (§3) — use it for the headline
 * numbers and the Refund button, never re-derive it. Strings with two
 * decimals, in `currency`.
 */
export interface OrderMoneySummary {
  currency: string;
  charged: string;
  /** SUCCEEDED payments only. */
  paid: string;
  /** PROCESSED refunds only — money actually given back. */
  refunded: string;
  /** The open refund's amount, else "0.00". */
  refundInProgress: string;
  /**
   * PROCESSED refunds Stripe then failed or cancelled. Non-zero = the order
   * says refunded but the buyer has no money.
   */
  refundFailed?: string;
  /** charged − refunded: the most a new refund may ask for. */
  refundable: string;
  canRequestRefund: boolean;
  refundBlockedReason: RefundBlockedReason | string | null;
  openRefundId: string | null;
}

export interface AdminOrderDetail extends AdminOrderRow {
  gateway: string | null;
  trackingNote: string | null;
  termsAcceptedAt: string | null;
  updatedAt: string;
  archivedAt: string | null;
  market: { id: string; code: string; name: string; currency: string } | null;
  skuUnits: OrderSkuUnit[];
  addresses: OrderAddress[];
  /**
   * Precomputed by the server so the UI enables exactly the buttons that will
   * work. Drive the action row from this, never from a hardcoded list.
   */
  allowedTransitions: SettableOrderStatus[];
  /** Both only with payment-royalty:read. */
  payments?: OrderPayment[];
  refunds?: OrderRefund[];
  /** Only with payment-royalty:read. */
  money?: OrderMoneySummary;
  /** When payment settled; null until PAID. */
  paidAt?: string | null;
  unitAssignedById?: string | null;
  /** Every status the order went through, oldest first (order-history-and-shipments.md §6). */
  history?: OrderHistoryEntry[];
  /** The live shipment, or null. */
  shipment?: OrderShipment | null;
  /** Every shipment, newest first, VOIDED corrections included. */
  shipments?: OrderShipment[];
  /** PROCESSING + unit scanned + no shipment yet → "Ship (add tracking)". */
  canRecordShipment?: boolean;
  /** SHIPPED with a shipment → "Correct tracking". */
  canCorrectShipment?: boolean;
}

export type OrderHistorySource =
  | "CHECKOUT"
  | "PAYMENT"
  | "PACKING"
  | "SHIPMENT"
  | "ADMIN"
  | "NFC_CLAIM"
  | "REFUND"
  | "CHECKOUT_SWEEP"
  | "BACKFILL";

export interface OrderHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  source: OrderHistorySource | string;
  actorId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export interface OrderShipment {
  id: string;
  carrierName: string;
  trackingNumber: string;
  trackingUrl: string | null;
  /** Internal — never shown to the buyer. */
  note: string | null;
  status: "ACTIVE" | "VOIDED" | string;
  createdById: string | null;
  createdAt: string;
  deliveredAt: string | null;
  /** "ADMIN" (staff confirmed) or "NFC_CLAIM" (buyer tapped the tag). */
  deliveredVia: "ADMIN" | "NFC_CLAIM" | string | null;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
}

/** POST /admin/orders/:id/shipment — the only way an order becomes SHIPPED. */
export interface RecordShipmentInput {
  carrierName: string;
  /** Spaces are stripped server-side; then 4–40 letters, digits or dashes. */
  trackingNumber: string;
  /** Must start with https:// — shown to the buyer. */
  trackingUrl?: string;
  /** Internal, never shown to the buyer. */
  note?: string;
  /** Same carrier + number already on another order, deliberately. */
  allowDuplicate?: boolean;
}

/** PUT …/shipment — voids the current shipment and records a new one. */
export type CorrectShipmentInput = RecordShipmentInput & { reason: string };

export interface OrderStatusInput {
  status: SettableOrderStatus;
  trackingNote?: string;
  /** Required when cancelling — the API rejects a cancellation without one. */
  reason?: string;
}

/* ------------------------------------------------------------------ */
/* Products — /admin/products (admin-write-apis.md §3)                 */
/* ------------------------------------------------------------------ */

export interface ProductPerformance {
  skuTotal: number;
  claimed: number;
  unclaimed: number;
  reservedHeld: number;
  reservedCommitted: number;
  orders: number;
  ordersByStatus: Record<string, number>;
  /** Excludes cancelled orders. Never sum across currencies. */
  revenue: Money;
  resaleActive: number;
  wishlists: number;
}

export interface ProductSkuUnit {
  skuId: string;
  skuCode: string;
  serialNumber: number;
  variantId: string | null;
  claimedStatus: string;
  ownerId: string | null;
  /** Resolved server-side: a disputed unit is useless without a person. */
  ownerEmail: string | null;
  ownerHandle: string | null;
  tagId: string | null;
  tagLifecycleState: string | null;
  vendorId: string | null;
  resaleBlocked: boolean;
  resaleBlockedReason: string | null;
  tamperStatus: string | null;
  lastTapCounter: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminProductDetail {
  id: string;
  groupCode: string;
  name: string;
  description: string | null;
  vertical: string | null;
  category: string | null;
  rarity: string | null;
  status: string;
  complianceStatus: string | null;
  totalSupply: number;
  purchaseLimit: number | null;
  releaseStart: string | null;
  releaseEnd: string | null;
  publishedAt: string | null;
  isAgeSpecific: boolean;
  minimumAge: number | null;
  oddsDisclosureRef: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  collectionId: string | null;
  artistId: string | null;
  artistName?: string | null;
  organizationId: string | null;
  /**
   * Artwork URLs, ordered primary-first. `[]` when the drop has no artwork
   * yet — which is itself something an approver is signing off, so say so
   * rather than rendering a broken image. Per-image metadata (alt text,
   * position) is on GET /admin/products/:id/images.
   */
  images?: string[];
  /** Base price in the default market, or null when none is configured. */
  price?: { amount: string | null; currency: string; isFree: boolean } | null;
  performance: ProductPerformance;
  /**
   * The drop's type (drop-types-and-variants.md §6) — which variants it may
   * have. `null` on a legacy drop created before types existed: no variant
   * rules apply to it.
   */
  dropType?: DropTypeRef | null;
  /**
   * The drop's sellable options (size × color, pack size…). Authored through
   * /admin/products/:id/variants; the variants endpoint additionally carries
   * `mintedUnits` and archived rows.
   */
  variants: ProductVariantRef[];
  /** Paginated — a 10,000-unit edition is a legitimate drop. */
  skuUnits: Paginated<ProductSkuUnit>;
}

export interface ProductVariantRef {
  id: string;
  label: string;
  /** Legacy pair, kept on every variant: "size/color". */
  optionName: string;
  /** "M/BLK". */
  optionValue: string;
  /** `{groupCode}-{values}` — unique platform-wide. Absent on old payloads. */
  variantCode?: string;
  options?: VariantOption[];
  /** Per-variant cap, or null = drawn from the drop's total. */
  totalSupply?: number | null;
  isActive?: boolean;
}

export interface ProductInput {
  /**
   * A drop-type code, case-insensitive. Omitted or null = a legacy drop with
   * no variant rules. On PATCH it can change only while the drop has no
   * variants (409 PRODUCTS_DROP_TYPE_LOCKED otherwise).
   */
  dropType?: string | null;
  name?: string;
  description?: string | null;
  vertical?: string | null;
  category?: string | null;
  rarity?: string | null;
  totalSupply?: number;
  purchaseLimit?: number | null;
  collectionId?: string | null;
  artistId?: string | null;
  organizationId?: string | null;
  releaseStart?: string | null;
  releaseEnd?: string | null;
  /*
   * No `status`. A drop's status is the outcome of the workflow — submit and
   * decide (/admin/releases), publish (POST /admin/products/:id/publish),
   * archive (DELETE) — and the update schema is .strict(), so sending it is
   * a 422 naming the field. Create defaults to DRAFT on its own.
   */
  isAgeSpecific?: boolean;
  minimumAge?: number | null;
  oddsDisclosureRef?: string | null;
  /** Create only — a 4-digit suffix; the server prefixes 8 random digits. */
  groupCode?: string;
  /**
   * Create only. Mints the edition in the SAME transaction as the product, so
   * the request either produces a drop with N units or produces nothing.
   * Omit the block entirely to create a catalog entry with no units.
   *
   * There is deliberately no `tagIds` here: binding a physical tag needs
   * nfc-tag-claim:manage, which this route does not check. Mint tags through
   * POST /admin/products/:id/skus instead.
   */
  skus?: { count: number; variantId?: string | null };
  /**
   * Create only. Attaches already-uploaded assets as the gallery, in the SAME
   * transaction as the product and its units — so the request produces a
   * complete drop (catalog row, units, gallery) or produces nothing.
   *
   * Asset ids are validated BEFORE the product is written, so one typo'd uuid
   * fails the request without creating anything.
   */
  images?: ProductImageInput[];
  /**
   * Create only, and **required** there — see `ProductCreateInput`.
   *
   * Optional on this shared shape because PATCH does not take it: the price
   * list is edited through /admin/products/:id/prices, not by patching the
   * product.
   */
  prices?: ProductPriceInput[];
}

/**
 * What POST /admin/products actually accepts.
 *
 * `prices` is required with at least one entry (product-upload-api.md §3) —
 * a **breaking change**: a create that worked without it now returns 422
 * `prices: At least one market price is required`. A drop with no price is
 * not purchasable anywhere, because the storefront reads ProductPrice for the
 * buyer's market and finds nothing to show and nothing to charge.
 *
 * Splitting the type rather than commenting the field is what makes the
 * breaking change a compile error here instead of a 422 in front of an
 * operator.
 */
export type ProductCreateInput = ProductInput & { prices: ProductPriceInput[] };

/* ------------------------------------------------------------------ */
/* Drop types & variants — /admin/drop-types,                          */
/* /admin/products/:id/variants (drop-types-and-variants.md)           */
/* ------------------------------------------------------------------ */

/** NONE: no variants · OPTIONAL: may have them · REQUIRED: ≥ 1 to submit, every unit belongs to one. */
export type VariantMode = "NONE" | "OPTIONAL" | "REQUIRED";
export type DimensionDisplayType = "TEXT" | "COLOR";

/** The short form every product response carries. */
export interface DropTypeRef {
  code: string;
  name: string;
  variantMode: VariantMode;
}

export interface DropTypeValue {
  code: string;
  label: string;
  /** `#RRGGBB` on a COLOR dimension; null = no swatch. */
  hexCode: string | null;
  position: number;
  archived: boolean;
}

export interface DropTypeDimension {
  /** camelCase: size, packSize. */
  code: string;
  label: string;
  position: number;
  required: boolean;
  /** The admin may type a value not in the list, for one drop. */
  allowCustomValues: boolean;
  displayType: DimensionDisplayType;
  archived: boolean;
  values: DropTypeValue[];
}

/** One value code, or a list (any of them). */
export type RuleMatch = Record<string, string | string[]>;

export type DropTypeRule =
  | { kind: "require"; when: RuleMatch; dimensions: string[] }
  | { kind: "forbid"; when: RuleMatch; dimensions: string[] }
  | { kind: "exclude"; match: RuleMatch };

export interface DropType extends DropTypeRef {
  id: string;
  publicCode?: string;
  description: string | null;
  /** Tokens {groupCode} and {values}; both mandatory. */
  variantCodePattern: string;
  /** Goes up whenever the rules change. */
  version: number;
  isActive: boolean;
  rules: DropTypeRule[];
  dimensions: DropTypeDimension[];
  /** On GET /:code only. */
  dropCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DropTypeValueInput {
  code: string;
  label: string;
  hexCode?: string | null;
  position?: number;
}

export interface DropTypeDimensionInput {
  code: string;
  label: string;
  required?: boolean;
  allowCustomValues?: boolean;
  displayType?: DimensionDisplayType;
  position?: number;
  values?: DropTypeValueInput[];
}

export interface CreateDropTypeInput {
  code: string;
  name: string;
  description?: string | null;
  variantMode: VariantMode;
  variantCodePattern?: string;
  dimensions?: DropTypeDimensionInput[];
  rules?: DropTypeRule[];
}

export interface UpdateDropTypeInput {
  name?: string;
  description?: string | null;
  /** Only while no drop uses the type — 409 PRODUCTS_DROP_TYPE_LOCKED. */
  variantMode?: VariantMode;
  variantCodePattern?: string;
  /** Replaces the whole list; bumps `version`. */
  rules?: DropTypeRule[];
  isActive?: boolean;
}

export interface UpdateDimensionInput {
  label?: string;
  required?: boolean;
  allowCustomValues?: boolean;
  displayType?: DimensionDisplayType;
  position?: number;
}

export interface UpdateDimensionValueInput {
  label?: string;
  hexCode?: string | null;
  position?: number;
}

/** Labels and hex are SNAPSHOTS taken at creation. */
export interface VariantOption {
  dimension: string;
  dimensionLabel?: string;
  value: string;
  label: string;
  hexCode: string | null;
}

export interface DropVariant {
  id: string;
  publicCode?: string;
  variantCode: string;
  label: string;
  options: VariantOption[];
  optionName: string;
  optionValue: string;
  position: number;
  /** Per-variant cap, or null = drawn from the drop's total. */
  totalSupply: number | null;
  mintedUnits: number;
  isActive: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A value code, or — on an `allowCustomValues` dimension — a one-drop value. */
export type VariantOptionValue =
  | string
  | { code: string; label?: string; hexCode?: string | null };

export interface VariantInput {
  options: Record<string, VariantOptionValue>;
  label?: string;
  position?: number;
  totalSupply?: number | null;
}

export interface GenerateVariantsInput {
  select: Record<string, VariantOptionValue[]>;
  totalSupplyEach?: number | null;
  dryRun?: boolean;
}

export interface VariantProblem {
  index?: number;
  dimension?: string;
  rule: string;
  message: string;
}

/** A dry-run preview row — the full variant object once written. */
export interface VariantPreview {
  variantCode: string;
  label: string;
  totalSupply: number | null;
  options: VariantOption[];
}

export interface GenerateVariantsResult {
  dryRun: boolean;
  created: VariantPreview[];
  /** Archived variants restored because their combination was selected again. */
  revived: VariantPreview[];
  /** Combinations the drop already has; untouched. */
  existing: VariantPreview[];
  /** Refused by the rules, with why. */
  skipped: { options: unknown; problems: VariantProblem[] }[];
}

export interface UpdateVariantInput {
  label?: string;
  position?: number;
  /** Cannot go below `mintedUnits`. */
  totalSupply?: number | null;
  /** false stops new units being minted for it. */
  isActive?: boolean;
}

export interface RemoveVariantResult {
  /** "archived" when a unit, price, order or wishlist entry points at it. */
  outcome: "deleted" | "archived";
  variant: DropVariant | null;
}

/* ------------------------------------------------------------------ */
/* Release approvals — /admin/releases (admin-write-apis.md §4)        */
/*                                                                      */
/* Append-only per version: resubmitting a rejected drop creates        */
/* version N+1 rather than overwriting the rejection.                   */
/* ------------------------------------------------------------------ */

export type ReleaseStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ComplianceStatus = "PENDING" | "CLEARED" | "FLAGGED";

/**
 * Who is entitled to decide this drop. Resolved from the drop's organization
 * when the review opens and FROZEN on the row — not re-derived on read, so a
 * drop that changes hands mid-review is still answered by the party that was
 * asked.
 *
 *   ARTIST_INDIVIDUAL org      -> ARTIST       the artist named on the drop
 *   BRAND org                  -> ORGANIZATION someone with a role in that brand
 *   HITBOX org                 -> PLATFORM     HitBox staff
 *   no org, but an artist      -> ARTIST       the artist
 *   no org AND no artist       -> NONE         nobody — the review auto-passes
 *
 * NONE is not a bypass: the row is real, APPROVED on creation, with
 * legalComplianceAccepted false and no checker, because nobody accepted
 * anything. The drop is filed under the HitBox organization in the same
 * transaction.
 *
 * The discriminator is Organization.type, NOT "does the drop have an
 * artistId": most brand drops carry both, because the artist is signed to the
 * brand and the brand is accountable.
 *
 * A HitBox administrator cannot approve a brand's or an artist's drop. That
 * is not a scoping accident — an approval records a named person accepting
 * the legal compliance terms, and an administrator accepting on a brand's
 * behalf would record consent that brand never gave.
 */
export type ReleaseAuthority = "ARTIST" | "ORGANIZATION" | "PLATFORM" | "NONE";

export interface ReleaseApproval {
  id: string;
  productId: string;
  status: ReleaseStatus;
  version: number;
  /** Frozen when the review opened. See ReleaseAuthority. */
  authority: ReleaseAuthority;
  /** Who the frozen authority names, carried forward by /reopen. */
  requiredArtistId: string | null;
  requiredArtistName: string | null;
  requiredOrganizationId: string | null;
  requiredOrganizationName: string | null;
  comment: string | null;
  complianceStatus: ComplianceStatus;
  oddsDisclosureRef: string | null;
  approverId: string | null;
  approverEmail: string | null;
  approverName: string | null;
  checkedById: string | null;
  checkedAt: string | null;
  decidedAt: string | null;
  /*
   * What was accepted, not merely that a box was ticked. The version is the
   * wording in force at the moment of acceptance, so the trail stays readable
   * after the terms are revised.
   */
  legalComplianceAccepted: boolean;
  legalComplianceAcceptedAt: string | null;
  legalComplianceVersion: string | null;
  /*
   * Set only on a row opened by /reopen, which is what distinguishes an
   * administrator sending a rejection back from an ordinary resubmission.
   */
  reopenedFromVersion: number | null;
  reopenedById: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    groupCode: string;
    name: string;
    status: string;
    complianceStatus: string | null;
    isAgeSpecific: boolean;
    minimumAge: number | null;
    oddsDisclosureRef: string | null;
    totalSupply: number;
    organizationId: string | null;
    artistId: string | null;
  };
}

export interface ReleaseHistoryEntry {
  id: string;
  version: number;
  status: ReleaseStatus;
  /** The rejection note, when this version was rejected. */
  comment: string | null;
  complianceStatus: ComplianceStatus;
  authority: ReleaseAuthority;
  approverId: string | null;
  approverEmail: string | null;
  /** Who actually recorded the decision — null on an auto-pass. */
  checkedById: string | null;
  legalComplianceAccepted: boolean;
  legalComplianceVersion: string | null;
  reopenedFromVersion: number | null;
  reopenReason: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ReleaseApprovalDetail extends ReleaseApproval {
  /** Every prior decision on the product, newest version first. */
  history: ReleaseHistoryEntry[];
  /*
   * Drive the two buttons from canApprove and canReject SEPARATELY, never
   * from one flag: for an administrator looking at a brand's drop they
   * differ, because refusal is broader than consent. approveBlockedReason is
   * the sentence to show when approval alone is barred.
   */
  canApprove: boolean;
  canReject: boolean;
  approveBlockedReason: string | null;
  /** Both decisions barred — already decided, typically. */
  canDecide: boolean;
  blockedReason: string | null;
  /** Needs release-approval:override, and a decided review to send back. */
  canReopen: boolean;
  /*
   * The exact wording to put beside the tickmark, and the version that gets
   * recorded. Render it as an UNTICKED checkbox — never pre-ticked, never a
   * hidden field.
   */
  legalComplianceStatement: string;
  legalComplianceVersionRequired: string;
}

export interface ReleaseDecisionInput {
  status: "APPROVED" | "REJECTED";
  /**
   * Required, and must be true, when approving. Omitting it or sending false
   * is a 422 the schema refuses before the service is reached.
   */
  acceptLegalCompliance?: boolean;
  /** Required when rejecting — the API refuses without one. */
  comment?: string;
  complianceStatus?: ComplianceStatus;
  oddsDisclosureRef?: string | null;
}

/** POST /admin/releases/:approvalId/reopen — needs release-approval:override. */
export interface ReleaseReopenInput {
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Publishing — POST /admin/products/:id/publish                        */
/* (drop-approval-lifecycle.md §11)                                     */
/* ------------------------------------------------------------------ */

/**
 * ACTIVE is what the public storefront lists; PUBLISHED is staged — orders
 * accept it, the storefront does not show it.
 */
export type PublishTarget = "ACTIVE" | "PUBLISHED";

export interface PublishProductInput {
  /** Defaults to ACTIVE server-side. */
  target?: PublishTarget;
  /** Recorded on the audit entry, not on the drop. */
  note?: string;
}

/** Which review authorised the drop going live — echoed so no second read is needed. */
export interface ClearedReview {
  approvalId: string | null;
  version: number | null;
  status: string | null;
  authority: string | null;
}

export interface PublishProductResult {
  product: AdminProductDetail;
  clearedReview: ClearedReview;
}

/** GET /admin/media?archived=… — `live` is the default, deliberately. */
export type ArchivedFilter = "live" | "archived" | "all";

/* ------------------------------------------------------------------ */
/* Serialized units — /admin/products/:id/skus and /admin/skus         */
/* (sku-api.md)                                                         */
/*                                                                      */
/* CAREFUL: this is NOT the same shape as AdminProductDetail.skuUnits.  */
/* That one is flat (ownerEmail, tagId at the top level) and comes from */
/* the product detail endpoint. THIS one is nested, and each nested     */
/* block is OMITTED ENTIRELY when the caller lacks the grant behind it. */
/* Two endpoints, two shapes, both real — do not unify them.            */
/* ------------------------------------------------------------------ */

export type ClaimedStatus = "UNCLAIMED" | "CLAIMED" | "IN_TRANSFER" | "FLAGGED";

export type TagLifecycleState =
  | "UNPROVISIONED"
  | "BOUND"
  | "ACTIVE"
  | "LOST"
  | "REVOKED"
  | "DISPUTED";

/** Gated by `collectible-instance` at FULL visibility. */
export interface SkuTrustBlock {
  resaleBlocked: boolean;
  resaleBlockedReason: string | null;
  tamperStatus: string | null;
}

/** Gated by `nfc-tag-claim`. `lastTapCounter` is FULL-visibility only. */
export interface SkuTagBlock {
  tagId: string | null;
  tagLifecycleState: TagLifecycleState | null;
  lastTapCounter?: number | null;
}

/** Gated by `buyer-profile`. The email arrives already masked when the
 *  caller's grant is `:masked` — the server does the masking, not the UI. */
export interface SkuOwnerBlock {
  ownerId: string | null;
  email: string | null;
  handle: string | null;
}

/** Gated by `nfc-tag-claim`. Money inside additionally needs payment-royalty. */
export interface SkuProvenanceBlock {
  claimCount: number;
  ledgerEntries: number;
  firstClaimedAt: string | null;
  currentHolderSince: string | null;
  currentHolderPaid?: { amount: string; currency: string };
}

/** Gated by `order`. Money inside additionally needs payment-royalty. */
export interface SkuCommerceBlock {
  allocatedOrderId: string | null;
  allocatedOrderStatus: string | null;
  reservationStatus: string | null;
  amount?: string;
  currency?: string;
}

/**
 * The identity fields are always present; every optional property below is a
 * whole block that is absent — not null, not {} — when the grant behind it is
 * missing. Branch with `'owner' in sku`, never on a role name, and render an
 * absent block as NOTHING: no label, no row, no empty state.
 */
export interface SkuUnit {
  skuId: string;
  skuCode: string;
  serialNumber: number;
  claimedStatus: ClaimedStatus;
  variantId: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  /**
   * Moves on every write through the inventory endpoints. Optional because
   * the list projection is not documented to carry it while the unit detail
   * is — render it with a fallback rather than assuming.
   */
  updatedAt?: string | null;
  trust?: SkuTrustBlock;
  tag?: SkuTagBlock;
  owner?: SkuOwnerBlock;
}

/** GET /admin/skus/:skuId and /admin/skus/code/:skuCode. */
export interface SkuUnitDetail extends SkuUnit {
  product: {
    productId: string;
    groupCode: string;
    name: string;
    organizationId: string | null;
    status: string;
    totalSupply: number;
  };
  provenance?: SkuProvenanceBlock;
  commerce?: SkuCommerceBlock;
}

/**
 * A THIRD envelope shape. The dashboard uses `{page, limit, total, items}` at
 * the top level and the aggregates use `{data}` — the SKU list uses
 * `{data, meta}` with the paging under `meta`. Do not reuse Paginated<T> here.
 */
export interface SkuListResponse {
  data: SkuUnit[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** The same `{data, meta}` envelope, for the directories below. */
export interface MetaPaginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * `byTagLifecycleState`, `tagged` and `untagged` are omitted entirely for a
 * caller without `nfc-tag-claim`.
 *
 * `remainingSupply` is null when totalSupply is 0 — "no cap declared" is a
 * different fact from "cap reached", and both would render as 0.
 */
export interface SkuSummary {
  productId: string;
  total: number;
  byClaimedStatus: Record<string, number>;
  byTagLifecycleState?: Record<string, number>;
  tagged?: number;
  untagged?: number;
  remainingSupply: number | null;
}

export interface SkuListParams {
  page?: number;
  limit?: number;
  claimedStatus?: string;
  tagLifecycleState?: string;
  variantId?: string;
  tagged?: boolean;
  resaleBlocked?: boolean;
  includeArchived?: boolean;
  /** Matches serial number, skuCode fragment, or a full tag UID. */
  search?: string;
  sort?: "serial_asc" | "serial_desc" | "newest";
}

export interface MintSkusInput {
  /** 1–1000. Larger editions are minted in sequential batches. */
  count: number;
  variantId?: string | null;
  /**
   * Exactly `count` entries or omitted entirely — a shorter list would
   * silently leave the tail of the batch untagged. Requires
   * nfc-tag-claim:manage on top of the mint gate.
   */
  tagIds?: string[];
  vendorId?: string | null;
  provisioningBatchId?: string | null;
  isActive?: boolean;
}

export interface MintResult {
  productId?: string;
  minted: number;
  firstSerial: number;
  lastSerial: number;
  skuCodes: string[];
  tagsBound: number;
}

/* ------------------------------------------------------------------ */
/* Owner directories — /admin/artists and /admin/organizations         */
/*                                                                      */
/* Read-only pickers for the drop form's brand and artist fields, and   */
/* for putting a NAME on a catalog row that otherwise carries only a    */
/* uuid. Both are gated on `drop:read` rather than                      */
/* `brand-artist-record:read`, deliberately, so a Drop Manager can fill  */
/* the form without holding the brand-record grant.                     */
/*                                                                      */
/* Envelope note: these answer `{ data, meta }` — a fourth shape in this */
/* API, and NOT the dashboard's `{ page, limit, total, items }`. Running  */
/* one through `unwrap` yields the rows and drops `meta`, which is right  */
/* for a picker and wrong for a paginated table.                        */
/* ------------------------------------------------------------------ */

export type OrganizationType = "HITBOX" | "BRAND" | "ARTIST_INDIVIDUAL";

/**
 * One option in a brand picker.
 *
 * `type` is part of the row rather than a detail because the picker is
 * otherwise ambiguous: "Kaze" as an ARTIST_INDIVIDUAL organization and "Kaze"
 * as an Artist record are different rows with different ids, and choosing the
 * wrong one files the drop under the wrong owner.
 */
export interface AdminOrganization {
  id: string;
  name: string;
  type: OrganizationType | string;
  slug: string;
  isActive: boolean;
  archivedAt: string | null;
  /** Live reference counts — "safe to retire?", and a sort key. */
  counts: { artists: number; products: number };
}

/**
 * One option in an artist picker.
 *
 * `organizationId`/`organizationName` ride along because an artist alone is
 * ambiguous on a form that also asks for a brand: the same artist under a
 * brand and under their own artist-individual organization are different
 * drops, and the API cannot tell which was meant.
 */
export interface AdminArtist {
  id: string;
  name: string;
  slug: string;
  genre: string | null;
  avatarUrl: string | null;
  /** Unrelated to `isActive`: an artist can be live and unlisted. */
  isPublic: boolean;
  isActive: boolean;
  archivedAt: string | null;
  organizationId: string | null;
  organizationName: string | null;
  counts: { products: number; collections: number; followers?: number };
}

export type ArtistDirectorySort = "name" | "newest" | "oldest" | "drops" | "collections" | "followers";

/** GET /admin/artists query (artist-admin-api.md §3). Booleans are strict true/false. */
export interface AdminArtistFilters {
  search?: string;
  organizationId?: string;
  isActive?: "true" | "false";
  isPublic?: "true" | "false";
  includeArchived?: "true" | "false";
  sort?: ArtistDirectorySort;
  page?: number;
  limit?: number;
}

/** Money as the API sends it: one string amount per currency, never summed. */
export type CurrencyMap = Record<string, string>;

/** GET /admin/artists/summary. Counts are of live artists except `archived`. */
export interface ArtistDirectorySummary {
  total: number;
  active: number;
  inactive: number;
  public: number;
  unlisted: number;
  archived: number;
  newThisMonth: number;
  withoutAvatar: number;
  withoutBio: number;
  withoutAccount: number;
  withoutCompliance: number;
  moneyVisible: boolean;
  /** Ranked by units sold, all time. null when reporting isn't wired. */
  topBySales:
    | {
        artistId: string;
        name: string;
        slug: string;
        avatarUrl: string | null;
        orders: number;
        unitsSold: number;
        revenue?: CurrencyMap;
      }[]
    | null;
}

/** GET /admin/artists/:id/profile — the staff view of an artist. */
export interface ArtistStaffProfile {
  id: string;
  publicCode: string;
  name: string;
  slug: string;
  bio: string | null;
  genre: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  isActive: boolean;
  archivedAt: string | null;
  /** Whether the artist can edit their own profile. */
  editable: boolean;
  /** null while the invitation is unaccepted. userId is the audit actor id. */
  account: {
    userId: string;
    email: string | null;
    fullName: string | null;
    isActive: boolean;
    joinedAt: string;
  } | null;
  invitationId: string | null;
  organization: { id: string; name: string; type: string } | null;
  brandLinks: {
    id: string;
    organizationId: string;
    organizationName: string;
    linkType: string;
    startDate: string | null;
    endDate: string | null;
    isActive: boolean;
  }[];
  compliance: { attested: boolean; attestedAt: string | null; attestedById: string | null };
  payouts: {
    lastPayout: {
      id: string;
      publicCode: string;
      status: string;
      currency: string;
      amount?: string;
      scheduledAt: string | null;
      paidAt: string | null;
      failureReason: string | null;
    } | null;
    openBatches: number;
    failedBatches: number;
    outstanding?: CurrencyMap;
    totalPaid?: CurrencyMap;
  } | null;
  tax: {
    documents: {
      id: string;
      documentType: string;
      countryCode: string;
      status: string;
      expiresAt: string | null;
      verifiedAt: string | null;
      backupWithholdingApplied: boolean;
    }[];
    hasApprovedDocument: boolean;
    backupWithholding: boolean;
  } | null;
  counts: { drops: number; collections: number; followers: number; claims: number };
  createdAt: string;
  updatedAt: string;
}

export type ArtistStatsPeriod = "week" | "month" | "year" | "custom";

export interface ArtistSalesFigures {
  orders: number;
  unitsSold: number;
  revenue?: CurrencyMap;
}

/** GET /admin/artists/:id/stats. Money keys are absent when moneyVisible is false. */
export interface ArtistStats {
  artistId: string;
  moneyVisible: boolean;
  period: { type: ArtistStatsPeriod; from: string; to: string };
  sales: {
    lifetime: ArtistSalesFigures;
    period: ArtistSalesFigures;
    /** Units sold per bucket. */
    trend: { date: string; value: number }[];
  };
  royalties?: {
    earned: CurrencyMap;
    paid: CurrencyMap;
    outstanding: CurrencyMap;
    periodEarned: CurrencyMap;
  };
  claims: { lifetime: number; period: number; revoked: number };
  followers: {
    total: number;
    period: number;
    trend: { date: string; new: number; total: number }[];
  };
  topDrops: {
    id: string;
    publicCode: string;
    name: string;
    status: string;
    orders: number;
    unitsSold: number;
    revenue?: CurrencyMap;
  }[];
}

/** PATCH /admin/artists/:id — strict body, send only what changes. */
export interface ArtistStaffUpdate {
  name?: string;
  slug?: string;
  bio?: string | null;
  genre?: string | null;
  /** Only null: staff can take an image down, not put one up. */
  avatarUrl?: null;
  coverUrl?: null;
  complianceAttested?: boolean;
  reason?: string;
}

export type ArtistStateAction = "activate" | "deactivate" | "archive" | "restore" | "publish" | "unlist";


/* ------------------------------------------------------------------ */
/* Market pricing — /admin/products/:id/prices                         */
/* (product-upload-api.md §3)                                           */
/*                                                                      */
/* ProductPrice is scoped to (product, variant, market): an admin       */
/* prices the drop once per market they sell in, and the drop must      */
/* carry at least one price at all times.                               */
/* ------------------------------------------------------------------ */

/** `DISABLED` stages a price without making it live — the documented way to
 *  stop selling in a market without deleting the pricing. */
export type ProductPriceStatus = "ACTIVE" | "DISABLED";

export interface ProductPrice {
  priceId: string;
  marketId: string;
  marketCode: string;
  marketName: string;
  /**
   * The MARKET's currency, never one sent per price. Accepting one per price
   * would let a drop be quoted in GBP inside a market that settles in INR,
   * and no constraint in the schema would catch it.
   */
  currency: string;
  /**
   * Decimal string, `"0"` for a free price. `null` only for a row carrying
   * neither an amount nor `isFree` — which the API will not create.
   */
  amount: string | null;
  isFree: boolean;
  /** Unit cost, so finance computes margin without re-deriving it. */
  costOfGoods: string | null;
  status: ProductPriceStatus;
  /** Non-null when the row prices one variant rather than the whole product. */
  variantId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One row of the pricing table, as sent.
 *
 * Money is carried as a STRING on purpose: a price that round-trips through a
 * JavaScript float can arrive as 1999.9899999999998, and `Decimal(12, 2)`
 * would round it silently — on the column that decides what a buyer is
 * charged. The column holds 10 digits and 2 decimal places.
 *
 * There is deliberately no `currency`. It is the market's.
 */
export interface ProductPriceInput {
  /** Exactly one of `marketId` or `marketCode`. The console sends the code. */
  marketId?: string;
  marketCode?: string;
  /** Required unless `isFree`; the two cannot be combined. */
  amount?: string;
  isFree?: boolean;
  costOfGoods?: string | null;
  status?: ProductPriceStatus;
  variantId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Product gallery — /admin/products/:id/images                        */
/* (product-upload-api.md §3)                                           */
/* ------------------------------------------------------------------ */

export interface ProductImage {
  imageId: string;
  assetId: string;
  /** null on a deployment with no bucket configured. */
  url: string | null;
  /** Always present, so a client can build its own URL if it must. */
  storageRef: string;
  position: number;
  isPrimary: boolean;
  altText: string | null;
  createdAt: string;
}

/**
 * `assetId` is the only required field: the FILE belongs to the media module,
 * and these endpoints only arrange where it sits on the drop.
 *
 * Omit `position` entirely unless the operator reordered — arrival order is
 * respected, and sending stale positions fights the server's normalisation.
 */
export interface ProductImageInput {
  assetId: string;
  position?: number;
  isPrimary?: boolean;
  altText?: string | null;
}

/**
 * Every gallery mutation returns the WHOLE gallery, because the server
 * normalises two invariants on every write and a response carrying only the
 * touched row would leave the client guessing what cascaded:
 *
 *  1. Positions are made contiguous and 0-first (`0,5,5,11` -> `0,1,2,3`).
 *  2. Exactly one image is primary — two claimants and the first wins; none
 *     and position 0 gets it. Deleting the primary promotes the next.
 *
 * So: re-render from the response, never from local optimism.
 */
export type ProductGallery = ProductImage[];

/* ------------------------------------------------------------------ */
/* NFC tag manifests — sku-api.md §3a                                   */
/* ------------------------------------------------------------------ */

/**
 * One row of a vendor manifest. Exactly one of `serialNumber` or `skuCode`
 * per row — the CSV that arrives with a box of tags has one or the other.
 */
export interface TagBinding {
  serialNumber?: number;
  skuCode?: string;
  /** Hex, any separator style; normalised and upper-cased server-side. */
  tagId: string;
}

export interface BindTagsInput {
  /** Up to 1000 per call. A 10,000-unit edition is ten calls. */
  bindings: TagBinding[];
  vendorId?: string | null;
  provisioningBatchId?: string | null;
  /** Allow overwriting a tag already bound. Default false. */
  replace?: boolean;
}

export interface BindTagsResult {
  productId: string;
  bound: number;
  items: {
    skuCode: string;
    serialNumber: number;
    tagId: string;
    replaced: boolean;
  }[];
}

export interface RetagUnitInput {
  tagId: string;
  replace?: boolean;
  provisioningBatchId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Finance & payments (docs/finance/api-reference.md)                   */
/*                                                                      */
/* Two modules, one capability family. Shapes verified against          */
/* packages/finance/src/dto/finance.dto.ts and                          */
/* packages/payments/src/dto/payments.dto.ts rather than the prose, so  */
/* nullable columns stay nullable here.                                 */
/*                                                                      */
/* THE RULE THAT GOVERNS THIS WHOLE SECTION: every monetary value is a  */
/* STRING with two decimal places, in and out. A royalty of 11.25 sent  */
/* as a JSON number is a float by the time it reaches the browser, and  */
/* two of them added together give 22.499999999999996. Nothing in the   */
/* console parses one except for chart geometry and sorting.            */
/* ------------------------------------------------------------------ */

/** The three currencies the finance DTOs accept. There is no FX rate. */
export type FinanceCurrency = "USD" | "INR" | "GBP";

export const FINANCE_CURRENCIES: FinanceCurrency[] = ["USD", "INR", "GBP"];

/* ---- Royalty rules ------------------------------------------------ */

export type RoyaltyBasis = "NET_PROFIT" | "GROSS_REVENUE";

export type PayoutFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY";

/**
 * One payee's share, as it is stored inside `splitConfig`.
 *
 * `splitsOf()` in packages/finance/src/domain/royalty-calculation.ts accepts
 * `percentage` as either a number or a string and skips any entry naming no
 * payee — so both are declared here rather than assumed away.
 */
export interface RoyaltySplit {
  payeeType: "ARTIST" | "ORGANIZATION";
  artistId?: string | null;
  organizationId?: string | null;
  percentage: string | number;
}

export interface RoyaltyRule {
  id: string;
  scope: {
    organizationId: string | null;
    artistId: string | null;
    collectionId: string | null;
    productId: string | null;
  };
  basis: RoyaltyBasis | string;
  splitType: string;
  /** Null on a multi-party deal — the shares live in `splitConfig`. */
  percentage: string | null;
  /** `{ splits: RoyaltySplit[] }`, or something else entirely. Parse defensively. */
  splitConfig: unknown;
  payoutThreshold: string | null;
  payoutFrequency: PayoutFrequency | string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Server-computed: in force at the moment of the read. */
  isInForce: boolean;
  createdAt: string;
}

export interface RoyaltyRuleInput {
  organizationId?: string;
  artistId?: string;
  collectionId?: string;
  productId?: string;
  basis: RoyaltyBasis;
  splitType?: string;
  percentage?: string;
  splits?: RoyaltySplit[];
  payoutThreshold?: string;
  payoutFrequency?: PayoutFrequency;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface CloseRuleInput {
  effectiveTo: string;
  reason: string;
}

/* ---- Royalty ledger ----------------------------------------------- */

export type RoyaltyEntryStatus = "ACCRUED" | "PENDING_PAYOUT" | "PAID" | "REVERSED";

export type RoyaltyEntryType = "ORIGINAL" | "ADJUSTMENT";

export type ReversalReasonCode =
  | "REFUND_REVERSAL"
  | "DISPUTE_LOSS"
  | "CALCULATION_ERROR"
  | "RULE_CORRECTION"
  | "MANUAL_CORRECTION";

export interface RoyaltyPayee {
  type: string;
  artistId: string | null;
  organizationId: string | null;
  name: string | null;
}

export interface RoyaltyEntry {
  id: string;
  orderId: string;
  ruleId: string;
  skuId: string | null;
  claimId: string | null;
  payee: RoyaltyPayee;
  /**
   * The arithmetic that produced `amount`, carried on the row itself.
   *
   * This is the reliable way for an artist to see the terms applied to them:
   * rule listing filters by ORGANIZATION ids, so a rule scoped to the artist
   * alone is invisible to them even though it is the rule pricing their
   * royalties (api-reference.md, "Endpoints an artist can reach").
   */
  calculation: {
    basis: RoyaltyBasis | string;
    percentage: string | null;
    grossRevenue: string | null;
    costOfGoods: string | null;
    netProfit: string | null;
  };
  amount: string;
  currency: string;
  entryType: RoyaltyEntryType | string;
  status: RoyaltyEntryStatus | string;
  adjustsEntryId: string | null;
  payoutId: string | null;
  accruedAt: string;
  paidAt: string | null;
  createdAt: string;
}

/** The detail view adds every adjustment posted against the entry. */
export interface RoyaltyEntryDetail extends RoyaltyEntry {
  adjustments: Adjustment[];
}

export interface ReverseEntryInput {
  reasonCode: ReversalReasonCode;
  reason: string;
}

/* ---- Balances and payouts ----------------------------------------- */

export interface RoyaltyBalance {
  payeeType: string;
  payeeId: string | null;
  payeeName: string | null;
  currency: string;
  accrued: string;
  pendingPayout: string;
  paid: string;
  reversed: string;
  /** accrued + pendingPayout — owed but not yet in the bank. */
  outstanding: string;
  entryCount: number;
  threshold: string;
  thresholdMet: boolean;
}

export type PayoutStatus = "SCHEDULED" | "APPROVED" | "PAID" | "FAILED" | "CANCELLED";

export interface Payout {
  id: string;
  payee: RoyaltyPayee;
  amount: string;
  currency: string;
  entryCount: number;
  thresholdApplied: string | null;
  status: PayoutStatus | string;
  scheduledAt: string;
  approvedById: string | null;
  approvedAt: string | null;
  gatewayPayoutRef: string | null;
  paidAt: string | null;
  failureReason: string | null;
}

export interface SchedulePayoutsInput {
  artistId?: string;
  organizationId?: string;
  currency?: FinanceCurrency;
  /** Explicit, never a default — pays a balance that has not reached the bar. */
  thresholdOverride?: string;
  dryRun?: boolean;
}

/**
 * `skipped` matters as much as `scheduled`: a payee below their threshold is
 * reported with the reason rather than silently dropped, which is what makes
 * a dry run worth reading.
 */
export interface SchedulePayoutsResult {
  scheduled: Payout[];
  skipped: { payeeId: string; reason: string }[];
}

export interface ExecutePayoutInput {
  gatewayPayoutRef: string;
  paidAt?: string;
}

/* ---- Adjustments and the platform ledger -------------------------- */

export type AdjustmentTargetType =
  | "ROYALTY_LEDGER_ENTRY"
  | "FINANCE_LEDGER_ENTRY"
  | "ORDER"
  | "PAYMENT_TRANSACTION"
  | "ROYALTY_PAYOUT";

export type AdjustmentReasonCode =
  | "REFUND_REVERSAL"
  | "DISPUTE_LOSS"
  | "CHARGEBACK_FEE"
  | "CALCULATION_ERROR"
  | "RULE_CORRECTION"
  | "GOODWILL"
  | "MANUAL_CORRECTION";

export interface Adjustment {
  id: string;
  targetType: AdjustmentTargetType | string;
  targetId: string;
  orderId: string | null;
  /** Signed: "-11.25" reverses, "5.00" posts a make-good. */
  amountAdjustment: string;
  currency: string;
  reasonCode: AdjustmentReasonCode | string;
  reason: string;
  actorId: string | null;
  refundRequestId: string | null;
  disputeCaseId: string | null;
  resultingEntryId: string | null;
  createdAt: string;
}

export interface AdjustmentInput {
  targetType: AdjustmentTargetType;
  targetId: string;
  orderId?: string;
  amountAdjustment: string;
  currency: FinanceCurrency;
  reasonCode: AdjustmentReasonCode;
  reason: string;
  metadata?: Record<string, unknown>;
}

export type FinanceCategory =
  | "SALE_REVENUE"
  | "COST_OF_GOODS"
  | "GATEWAY_FEE"
  | "REFUND"
  | "CHARGEBACK"
  | "ROYALTY_EXPENSE"
  | "ROYALTY_PAYOUT"
  | "ADJUSTMENT";

export type FinanceDirection = "CREDIT" | "DEBIT";

export interface FinanceEntry {
  id: string;
  orderId: string | null;
  entryType: string;
  direction: FinanceDirection | string;
  category: FinanceCategory | string;
  amount: string;
  currency: string;
  costOfGoods: string | null;
  gatewayFee: string | null;
  description: string | null;
  createdAt: string;
}

/**
 * ONE ROW PER CURRENCY, never summed across them. There is no FX rate in this
 * system and a "total revenue" that adds dollars to rupees is worse than no
 * total at all.
 */
export interface RevenueSummaryRow {
  currency: string;
  grossRevenue: string;
  costOfGoods: string;
  gatewayFees: string;
  refunds: string;
  chargebacks: string;
  royaltyExpense: string;
  /** gross less cogs, fees, refunds, chargebacks and royalties. */
  netMargin: string;
  orderCount: number;
}

/* ---- Payment transactions ----------------------------------------- */

export type PaymentStatus =
  | "INITIATED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "NEEDS_REVIEW";

export interface PaymentTransaction {
  id: string;
  orderId: string;
  gateway: string;
  gatewayRef: string | null;
  status: PaymentStatus | string;
  amount: string;
  currency: string;
  /**
   * NEEDS_REVIEW exists so a transaction with something wrong about it —
   * settled but unfulfillable, mismatched amount — stops rather than failing.
   */
  needsReview: boolean;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  failureReason: string | null;
  settledAt: string | null;
  createdAt: string;
}

/** The note is required: clearing a parked charge is a decision with a name on it. */
export interface ReviewPaymentInput {
  decision: "APPROVE" | "REJECT";
  note: string;
}

/* ---- Refunds ------------------------------------------------------- */

export type RefundStatus =
  | "REQUESTED"
  | "AWAITING_RETURN"
  | "APPROVED"
  | "PROCESSED"
  | "REJECTED";

export type RefundReasonCode =
  | "DEFECTIVE_ITEM"
  | "DEFECTIVE_TAG"
  | "NOT_AS_DESCRIBED"
  | "NOT_DELIVERED"
  | "DUPLICATE_CHARGE"
  | "BUYER_CHANGED_MIND"
  | "FRAUDULENT_CHARGE"
  | "OTHER";

export type NfcTagCondition = "INTACT" | "DAMAGED" | "MISSING" | "TAMPERED";

export interface Refund {
  id: string;
  orderId: string;
  requestedById: string;
  reason: string;
  reasonCode: RefundReasonCode | string;
  status: RefundStatus | string;
  amount: string;
  currency: string;
  physicalReturnRequired: boolean;
  physicalReturnConfirmedAt: string | null;
  nfcTagCondition: NfcTagCondition | string | null;
  approvedById: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  gatewayRefundId: string | null;
  processedAt: string | null;
  /** Filled in by `process`: ownership revoked, tag quarantined. */
  claimRevokedAt: string | null;
  resaleBlockedUntil: string | null;
  createdAt: string;
  /** null until Stripe reports; FAILED/CANCELED after PROCESSED = buyer not paid. */
  gatewayStatus?: RefundGatewayStatus | null;
  /** Stripe's reason, e.g. expired_or_canceled_card. */
  gatewayFailureReason?: string | null;
  gatewayStatusAt?: string | null;
  /** Raw next statuses. Prefer `allowedActions` for buttons. */
  allowedTransitions: (RefundStatus | string)[];
  /**
   * Exactly which buttons to show, computed for THIS caller — it knows the
   * return rule and the caller's permission. `[]` for terminal refunds and
   * for callers without order:refund:global. Absent on older backends.
   */
  allowedActions?: RefundActionCode[];
  updatedAt?: string;
}

export type RefundActionCode =
  | "CONFIRM_RETURN"
  | "APPROVE"
  | "APPROVE_WITH_OVERRIDE"
  | "PROCESS"
  | "REJECT";

/** POST /refunds — omit `amount` for a full refund. */
export interface RequestRefundInput {
  orderId: string;
  reasonCode: RefundReasonCode;
  reason: string;
  amount?: string;
  /** Default true. False where there is nothing to send back. */
  physicalReturnRequired?: boolean;
}

export interface ConfirmReturnInput {
  nfcTagCondition: NfcTagCondition;
  note?: string;
  receivedAt?: string;
}

export interface ApproveRefundInput {
  note?: string;
  /** Approving without the item back. Needs a reason — the API refuses otherwise. */
  overridePhysicalReturn?: boolean;
  overrideReason?: string;
}

export interface ProcessRefundInput {
  /** Required on a deployment with no gateway adapter wired. */
  gatewayRefundId?: string;
  processedAt?: string;
}

/* ---- Disputes ------------------------------------------------------ */

export type DisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "EVIDENCE_SUBMITTED"
  | "WON"
  | "LOST"
  | "ACCEPTED"
  | "WITHDRAWN";

export type DisputeReasonCode =
  | "FRAUDULENT"
  | "PRODUCT_NOT_RECEIVED"
  | "PRODUCT_UNACCEPTABLE"
  | "DUPLICATE"
  | "SUBSCRIPTION_CANCELED"
  | "CREDIT_NOT_PROCESSED"
  | "UNRECOGNIZED"
  | "OTHER";

export type DisputeOutcome = "WON" | "LOST" | "ACCEPTED" | "WITHDRAWN";

export interface Dispute {
  id: string;
  orderId: string;
  paymentTransactionId: string | null;
  gateway: string;
  gatewayCaseRef: string | null;
  reasonCode: DisputeReasonCode | string;
  reason: string | null;
  status: DisputeStatus | string;
  amount: string;
  currency: string;
  feeAmount: string | null;
  /** The countdown the dispute queue is ordered by. */
  evidenceDueBy: string | null;
  evidenceSubmittedAt: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  openedAt: string;
}

export interface OpenDisputeInput {
  orderId: string;
  paymentTransactionId?: string;
  gateway?: "STRIPE";
  gatewayCaseRef?: string;
  reasonCode: DisputeReasonCode;
  reason?: string;
  amount: string;
  currency: FinanceCurrency;
  feeAmount?: string;
  evidenceDueBy?: string;
}

export interface SubmitEvidenceInput {
  evidence: Record<string, unknown>;
  note?: string;
}

/** LOST/ACCEPTED book the chargeback and reverse the royalty. WON changes only status. */
export interface ResolveDisputeInput {
  outcome: DisputeOutcome;
  resolutionNote: string;
  feeAmount?: string;
}

/* ---- Gateway configuration ---------------------------------------- */

export type GatewayScope = "PLATFORM" | "ORGANIZATION" | "DROP";

export type GatewayConfigStatus = "ACTIVE" | "INACTIVE";

export interface GatewayConfig {
  id: string;
  scope: GatewayScope | string;
  organizationId: string | null;
  gateway: string;
  isDefault: boolean;
  /** A POINTER into the secrets manager, never the credential itself. */
  credentialsRef: string;
  status: GatewayConfigStatus | string;
  createdAt: string;
  updatedAt: string;
}

export interface GatewayConfigInput {
  scope: GatewayScope;
  organizationId?: string;
  gateway: "STRIPE";
  isDefault?: boolean;
  credentialsRef: string;
  status?: GatewayConfigStatus;
}

export interface GatewayConfigUpdate {
  isDefault?: boolean;
  status?: GatewayConfigStatus;
  credentialsRef?: string;
}

/* ---- Webhook replay queue ------------------------------------------ */

/**
 * The stored raw `payload` is deliberately NOT returned by the API: it is the
 * provider's JSON, it can carry cardholder detail, and this screen only needs
 * to know what arrived and whether it processed.
 */
export interface WebhookEvent {
  id: string;
  provider: string;
  eventType: string;
  signatureVerified: boolean;
  processedAt: string | null;
  processingError: string | null;
  receivedAt: string;
}

/* ------------------------------------------------------------------ */
/* Supply & inventory — /admin/supply (supply-inventory-api.md)        */
/*                                                                     */
/* The upstream of the SKU module. A Sku is "#014 of 500"; an NfcTag    */
/* is the chip inside it; a SupplyBatch is the carton it arrived in; a  */
/* Vendor made it. A chip is a row of its own because it has a life the */
/* item does not — QC'd before binding, replaceable while the item      */
/* keeps its provenance, and its UID unique for ever after retirement.  */
/*                                                                     */
/* Four gates, not one "can you see supply" flag:                       */
/*   drop:read              consignment headers                         */
/*   drop:read at GLOBAL    the vendor directory                        */
/*   nfc-tag-claim:read     the chip inventory                          */
/*   nfc-tag-claim:manage   every write, globalOnly                     */
/*   reports-dashboards     the metrics rollup                          */
/* ------------------------------------------------------------------ */

/**
 * What a vendor MAKES, not what kind of supplier it is.
 *
 * Every item on this platform arrives with its NFC chip already embedded —
 * nobody ships a reel of loose tags — so there is no "tag manufacturer" in
 * this supply chain. A vendor is the factory that makes the figure, the
 * keychain or the jersey, and the chip is inside it when the carton is opened.
 *
 * The values mirror Drop.category deliberately, so "who makes our jerseys" and
 * "which drops are jerseys" answer with the same word.
 *
 * The former NFC_TAG_MANUFACTURER and MERCHANDISE_MANUFACTURER no longer
 * exist: sending either is a 422 rather than a silent landing in OTHER.
 */
export type VendorType =
  | "FIGURE"
  | "KEYCHAIN"
  | "JERSEY"
  | "APPAREL"
  | "TRADING_CARD"
  | "POSTER"
  | "PLUSH"
  | "MERCHANDISE"
  | "OTHER";

/** Ordered for a picker: the specific categories first, catch-alls last. */
export const VENDOR_TYPES: VendorType[] = [
  "FIGURE",
  "KEYCHAIN",
  "JERSEY",
  "APPAREL",
  "TRADING_CARD",
  "POSTER",
  "PLUSH",
  "MERCHANDISE",
  "OTHER",
];

export interface Vendor {
  id: string;
  name: string;
  legalName: string | null;
  country: string | null;
  vendorType: VendorType;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Live, and what a "safe to retire?" check reads. */
  counts: { batches: number; units: number };
}

export interface VendorInput {
  name?: string;
  legalName?: string | null;
  /** ISO 3166-1 alpha-2. A consignment crossing a border is a customs question first. */
  country?: string | null;
  vendorType?: VendorType;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  isActive?: boolean;
  /** Soft retire: sets archivedAt AND clears isActive. There is deliberately no DELETE. */
  archived?: boolean;
}

export type SupplyBatchStatus = "UPLOADED" | "VALIDATED" | "ACCEPTED" | "REJECTED";

/**
 * What is in the carton — the same product categories as VendorType.
 *
 * The chip arrives already embedded in the goods, so a consignment is
 * described by what the goods ARE rather than by whether it carried chips.
 * The former NFC_TAG and COLLECTIBLE are gone; the backend migration
 * 20260928120000_supply_item_type_product_categories mapped COLLECTIBLE rows
 * to the linked drop category where it matched one of these values, and
 * everything else to OTHER.
 *
 * Aliased rather than re-declared: the two enums are the same set by design,
 * and a second literal list would be a second thing to forget to update.
 */
export type SupplyItemType = VendorType;

/** Offered when booking a consignment in — the same list, the same order. */
export const SUPPLY_ITEM_TYPES: SupplyItemType[] = VENDOR_TYPES;

/**
 * Consignment categories that carry chips, and so accept a manifest.
 *
 * Every category, which looks like a check that does nothing. It mirrors the
 * backend allowlist deliberately, so a category added later that carries no
 * chips — packaging, say — has to opt in on both sides rather than inheriting
 * permission by silence.
 */
export const CHIP_BEARING_ITEM_TYPES: SupplyItemType[] = VENDOR_TYPES;

export interface SupplyBatch {
  id: string;
  vendorId: string;
  vendor: { id: string; name: string; vendorType: VendorType } | null;
  dropId: string | null;
  drop: { id: string; groupCode: string; name: string } | null;
  itemType: SupplyItemType;
  status: SupplyBatchStatus;
  quantity: number;
  batchRef: string | null;
  vendorInvoiceRef: string | null;
  receivedAt: string | null;
  batchDate: string | null;
  rowsReceived: number;
  rowsAccepted: number;
  rowsRejected: number;
  sourceFileRef: string | null;
  validationReportRef: string | null;
  enteredById: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * One line per variant for a consignment of a drop allotted by variant;
   * [] (or absent on older reads) otherwise. `quantity` is their sum, and
   * every manifest row must then name one of these variants.
   */
  lines?: SupplyBatchLine[];
  /** Coverage against the vendor's allotment — single-batch reads and the vendor's create response. */
  allotment?: BatchAllotment | null;
  /**
   * The number the intake screen exists to surface: what the vendor's
   * paperwork declared against what was actually keyed in.
   *
   * `tagsRegistered` — the chip rows that genuinely exist against this
   * consignment — is present ONLY for a caller holding nfc-tag-claim:read.
   * It is what catches a manifest counted twice.
   */
  reconciliation: {
    declared: number;
    registered: number;
    shortfall: number;
    tagsRegistered?: number;
  };
}

export interface SupplyBatchLine {
  variantId: string;
  variantCode?: string;
  label?: string;
  quantity: number;
  rowsReceived: number;
  rowsAccepted: number;
  rowsRejected: number;
  shortfall?: number;
}

export interface SupplyBatchInput {
  vendorId: string;
  dropId?: string | null;
  itemType: SupplyItemType;
  /** Optional split per variant; staff bookings are not capped by allotments. */
  lines?: { variantId: string; quantity: number }[];
  /** With `lines`, optional — and must equal their sum if sent. */
  quantity?: number;
  batchRef?: string;
  vendorInvoiceRef?: string;
  /** Defaults to now; batchDate then defaults to this. */
  receivedAt?: string;
  sourceFileRef?: string;
  notes?: string;
}

/**
 * What an ACCEPT minted into the drop: one unit per chip that did not fail
 * QC, with that chip's variant, bound to it. Absent for other decisions, and
 * for a consignment with no drop (its chips only become stock).
 */
export interface SupplyAcceptStock {
  minted: number;
  units: { variantId: string | null; count: number; firstSerial: number; lastSerial: number }[];
}

export interface SupplyBatchDecisionResult extends SupplyBatch {
  stock?: SupplyAcceptStock | null;
}

/** `details.lines[]` of 409 SUPPLY_MANIFEST_INCOMPLETE. */
export interface ManifestIncompleteLine {
  variantId?: string;
  variantCode?: string | null;
  quantity: number;
  registered: number;
  shortfall: number;
}

export interface SupplyBatchDecisionInput {
  status: SupplyBatchStatus;
  /**
   * Required to reject. Appended to `notes` prefixed with the decision, so a
   * rejection reason never overwrites the discrepancy that prompted it.
   */
  note?: string;
  validationReportRef?: string;
}

export type TagQcStatus = "PENDING" | "PASSED" | "FAILED";

export interface TagManifestRow {
  /** Any separator style; normalised server-side, and never returned again. */
  uid: string;
  /**
   * The variant of the product this chip is embedded in. REQUIRED when the
   * consignment has lines (and must be one of them); NOT ALLOWED when it has none.
   */
  variantId?: string;
  qcStatus?: TagQcStatus;
  qcNotes?: string;
}

export interface TagManifestInput {
  dryRun?: boolean;
  /** At most SUPPLY_MANIFEST_MAX — one physical carton, one transaction. */
  tags: TagManifestRow[];
}

export interface TagManifestResult {
  batchId: string;
  dryRun: boolean;
  registered: number;
  /** Offending rows are identified BY POSITION, never by UID. */
  duplicates: { row: number; reason: string }[];
  batch: {
    rowsReceived: number;
    rowsAccepted: number;
    rowsRejected: number;
    status: SupplyBatchStatus;
  };
  /** Per-variant counts after this call, for a consignment with lines. */
  lines?: Pick<SupplyBatchLine, "variantId" | "quantity" | "rowsReceived" | "rowsAccepted" | "rowsRejected">[];
}

/**
 * A chip in inventory.
 *
 * There is no `uid` field and no capability adds one. A UID is the platform's
 * anti-counterfeiting secret — whoever holds one can write it to a blank chip
 * — so the repository never selects the hash or the ciphertext in the first
 * place, rather than stripping them later.
 */
export interface NfcTagRow {
  id: string;
  /** NT + 8-digit ordinal, zero-padded so lexical order is numeric order. */
  nfcTagCode: string;
  supplyBatchId: string | null;
  batch: {
    id: string;
    batchRef: string | null;
    vendorId: string;
    vendorName: string;
  } | null;
  skuId: string | null;
  sku: { id: string; skuCode: string; serialNumber: number } | null;
  qcStatus: TagQcStatus;
  qcReportedAt: string | null;
  qcNotes: string | null;
  lifecycleState: TagLifecycleState;
  lastTapCounter: number;
  tamperStatus: string | null;
  personalizedAt: string | null;
  boundAt: string | null;
  activatedAt: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TagQcInput {
  qcStatus: TagQcStatus;
  qcNotes?: string | null;
}

export interface SupplyTagFilters {
  supplyBatchId?: string;
  vendorId?: string;
  skuId?: string;
  lifecycleState?: string;
  qcStatus?: string;
  /** true = chips not yet in an item, i.e. free stock. */
  unbound?: boolean;
  nfcTagCode?: string;
  page?: number;
  limit?: number;
}

export interface SupplyBatchFilters {
  vendorId?: string;
  dropId?: string;
  status?: string;
  itemType?: string;
  search?: string;
  receivedFrom?: string;
  receivedTo?: string;
  page?: number;
  limit?: number;
}

export interface VendorFilters {
  search?: string;
  vendorType?: string;
  country?: string;
  isActive?: boolean;
  includeArchived?: boolean;
  page?: number;
  limit?: number;
}

/* ------------------------------------------------------------------ */
/* Vendor administration — /admin/supply/vendors/:id/{members,drops}    */
/* (vendor-admin-api.md) and the vendor's own portal — /vendor          */
/* (vendor-portal-api.md).                                              */
/*                                                                      */
/* A VendorMember is the part only supply knows: WHICH vendor a signed- */
/* in account acts for. The VENDOR role itself (vendor-supply:*:own)    */
/* comes from the staff invitation it is linked to.                     */
/* ------------------------------------------------------------------ */

/**
 *   INVITED ──(accepts)──▶ ACTIVE
 *      │                     │
 *      └────(admin revokes)──┴──▶ REVOKED   (final — re-invite is a new row)
 */
export type VendorMemberStatus = "INVITED" | "ACTIVE" | "REVOKED";

export const VENDOR_MEMBER_STATUSES: VendorMemberStatus[] = ["INVITED", "ACTIVE", "REVOKED"];

export interface VendorMember {
  id: string;
  vendorId: string;
  email: string;
  status: VendorMemberStatus;
  userId: string | null;
  invitationId: string | null;
  invitedById: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface VendorMemberInviteInput {
  /** Defaults to the vendor's contactEmail server-side. */
  email?: string;
}

export interface VendorMemberInviteResult {
  /**
   * INVITATION_SENT — Clerk emailed a sign-up link; member is INVITED.
   * ROLE_ASSIGNED — the address already had an account; member is ACTIVE.
   */
  outcome: "INVITATION_SENT" | "ROLE_ASSIGNED";
  member: VendorMember;
  invitationExpiresAt: string | null;
}

/**
 * Supply progress against an allotment.
 *
 * `booked` counts units in this vendor's NON-rejected consignments — a
 * rejected carton gives its allotment back — and MAY exceed `allotted`:
 * a vendor can book over, and `overBooked` says by how much. `approved` is
 * what HitBox has ACCEPTED, the figure the allotment must cover.
 * `registered`/`accepted` are chips (accepted = not failed QC).
 *
 * Drop-level progress compares totals only, so it can hide a variant that is
 * over — always read the per-variant rows for warnings.
 */
export interface AllotmentProgress {
  /** null = uncapped (drop without variants, no quantity). */
  allotted: number | null;
  booked: number;
  registered: number;
  accepted: number;
  approved: number;
  /** allotted − booked, never negative; null when uncapped. */
  remaining: number | null;
  /** booked − allotted, never negative. */
  overBooked: number;
}

export interface VendorVariantAllotment extends AllotmentProgress {
  variantId: string;
  /** null for a variant booked WITHOUT an allotment (then allotted is 0). */
  variantCode: string | null;
  label: string | null;
  /** e.g. "color=RED|size=S". */
  options: string | null;
  allotted: number;
  remaining: number;
}

/** One variant's figures in a consignment's coverage check. */
export interface BatchAllotmentFigures {
  allotted: number | null;
  /** The vendor's units already ACCEPTED in other consignments. */
  acceptedElsewhere: number;
  thisBatch: number;
  /** acceptedElsewhere + thisBatch. */
  required: number;
  /** How far the allotment must grow before HitBox can accept this. */
  shortBy: number;
}

export interface BatchAllotmentVariant extends BatchAllotmentFigures {
  variantId: string;
  variantCode: string | null;
  label: string | null;
}

/**
 * Could HitBox ACCEPT this consignment as the allotment stands?
 *
 * On GET …/batches/:id (admin and vendor), on the vendor's create response,
 * and as `details` of 409 SUPPLY_ALLOTMENT_INSUFFICIENT. null when the vendor
 * is not assigned to the drop (e.g. staff-booked stock).
 */
export interface BatchAllotment {
  covered: boolean;
  byVariant: boolean;
  /** [] for a drop-level check — `total` carries the figures then. */
  variants: BatchAllotmentVariant[];
  total: BatchAllotmentFigures | null;
  /** The PATCH …/allotment body that would cover it, when one does. */
  suggestedPatch: VendorAllotmentInput | null;
}

export interface VendorDropAssignment {
  id: string;
  vendorId: string;
  dropId: string;
  drop: { id: string; groupCode: string; name: string; status: string };
  assignedById: string | null;
  assignedAt: string;
  /**
   * True when the drop is allotted per variant (the drop had live variants
   * at assignment). False → `variants` is [] and `progress` is drop-level.
   */
  byVariant: boolean;
  progress: AllotmentProgress;
  variants: VendorVariantAllotment[];
}

/**
 * POST …/drops (with dropId), PUT …/drops/:dropId/allotment and PATCH of the
 * same (without). A drop with live variants takes `variants` (required); one
 * without takes an optional `quantity` — omitted or null means no cap.
 *
 * PUT REPLACES: variants left out are removed. PATCH sets only the variants
 * sent (adding new ones) and leaves the rest alone. Neither may go below what
 * HitBox has already ACCEPTED (409 SUPPLY_ALLOTMENT_BELOW_ACCEPTED); going
 * below merely booked units is allowed.
 */
export interface VendorAllotmentInput {
  variants?: { variantId: string; quantity: number }[];
  quantity?: number | null;
}

/** GET /vendor/me — the signed-in vendor user's own membership and vendor. */
export interface VendorMe {
  member: VendorMember;
  vendor: {
    id: string;
    name: string;
    legalName: string | null;
    country: string | null;
    vendorType: VendorType;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    /** False when HitBox deactivated or archived the vendor — reads work, writes are refused. */
    isActive: boolean;
  };
}

/** POST /vendor/batches — vendorId is never sent; it is always the caller's own. */
export interface VendorBatchInput {
  dropId: string;
  itemType: SupplyItemType;
  /** For a by-variant drop: one line per variant, each ≤ its remaining allotment. */
  lines?: { variantId: string; quantity: number }[];
  /** For a drop without variants. With `lines` it is optional and must equal their sum. */
  quantity?: number;
  batchRef?: string;
  receivedAt?: string;
  batchDate?: string;
  vendorInvoiceRef?: string;
  sourceFileRef?: string;
  notes?: string;
}

export type VendorBatchFilters = Omit<SupplyBatchFilters, "vendorId">;

/**
 * The rollup.
 *
 * EVERY BLOCK IS OPTIONAL, and that is load-bearing. A block the caller may
 * not see is ABSENT, never zeroed: `tags: { total: 0 }` would read as "no
 * chips exist", which is a different and actionable claim from "you cannot
 * see this". Check for the PRESENCE of the key, never for a zero value.
 *
 * Rates are two-decimal STRINGS, never floats. Same reasoning as money: a
 * client that receives a string cannot accidentally re-round it into
 * something that disagrees with what another screen shows.
 */
export interface SupplyMetrics {
  generatedAt: string;
  scope: string;
  organizationIds: string[] | null;

  tags?: {
    total: number;
    byLifecycle: Record<string, number>;
    byQc: Record<string, number>;
    qcFailureRate: string;
    unbound: number;
    bound: number;
  };

  batches?: {
    total: number;
    byStatus: Record<string, number>;
    byItemType: Record<string, number>;
    quantityDeclared: number;
    rowsReceived: number;
    rowsAccepted: number;
    rowsRejected: number;
    acceptanceRate: string;
    pendingReview: number;
  };

  vendors?: {
    active: number;
    byType: Record<string, number>;
    /**
     * Ranked by rows REJECTED, not by size — the list exists to surface the
     * unreliable vendor, not the biggest one.
     */
    leaders: {
      vendorId: string;
      name: string;
      vendorType: VendorType;
      batches: number;
      quantityDeclared: number;
      rowsAccepted: number;
      rowsRejected: number;
      rejectionRate: string;
    }[];
  };

  inventory?: {
    drops: number;
    totalSupply: number;
    minted: number;
    unminted: number;
    claimed: number;
    unclaimed: number;
    tagged?: number;
    untagged?: number;
  };

  reconciliation?: {
    shortfalls: {
      batchId: string;
      batchRef: string | null;
      vendorName: string;
      declared: number;
      registered: number;
      shortfall: number;
    }[];
    unboundTagStock?: number;
    untaggedUnits?: number;
  };

  /**
   * Drops within 10% of exhausting their UNMINTED supply — supply that exists
   * on paper but has no serialized row yet. A drop whose units are all minted
   * and all sold is not low on supply; it is sold out, which is another screen.
   */
  lowStock?: {
    productId: string;
    groupCode: string;
    name: string;
    totalSupply: number;
    minted: number;
    remaining: number;
    percentRemaining: string;
  }[];
}

export interface SupplyMetricsParams {
  /**
   * Narrows only. Naming an organization you hold nothing for is a 403, not
   * an empty result — an empty result would let you probe which organizations
   * exist by watching response shapes.
   */
  organizationId?: string;
  vendorId?: string;
  receivedFrom?: string;
  receivedTo?: string;
}

/* ------------------------------------------------------------------ */
/* Drop inventory — editing SKU records                                */
/* (sku-inventory-management.md)                                       */
/*                                                                     */
/* Minting creates units; this is everything that happens afterwards:   */
/* staging a release (isActive), fraud and disputes (flagged,           */
/* resaleBlocked, tamperStatus), tag custody (tagLifecycleState) and    */
/* retiring stock (archived). Three of the four routinely apply to a    */
/* RANGE of an edition, which is why the batch selectors look as they   */
/* do.                                                                  */
/* ------------------------------------------------------------------ */

/**
 * The full filter set, shared by /admin/skus and the nested product route.
 *
 * 🔒 A FILTER IS A READ OF THE COLUMN IT NAMES. The response projection omits
 * a tag UID from a caller without nfc-tag-claim; left ungated, `?tagId=…`
 * hands them the same fact anyway — one row back means yes, zero means no,
 * and enough of those questions is the whole secret. So every filter naming a
 * gated column is gated by the grant that gates the column, and a refused
 * filter is a 403 SKUS_FILTER_FORBIDDEN naming all of them at once.
 *
 * `tagged`, `tagLifecycleState` and `hasOwner` are deliberately NOT gated:
 * they are population facts, not identifying ones. "How many units still need
 * a tag" is the documented way a Drop Manager drives a partial rollout, and no
 * amount of asking it yields a UID.
 */
export interface SkuFilters {
  page?: number;
  limit?: number;
  productId?: string;
  /** Narrows within your reach. It does not widen it. */
  organizationId?: string;
  variantId?: string;
  hasVariant?: boolean;
  /** Repeatable: "UNCLAIMED,FLAGGED". */
  claimedStatus?: string;
  tagLifecycleState?: string;
  serialFrom?: number;
  serialTo?: number;
  skuCode?: string;
  /* Tag custody 🔒 nfc-tag-claim */
  tagged?: boolean;
  tagId?: string;
  vendorId?: string;
  provisioningBatchId?: string;
  /* Trust 🔒 collectible-instance at FULL */
  resaleBlocked?: boolean;
  tampered?: boolean;
  tamperStatus?: string;
  /* Ownership 🔒 buyer-profile at FULL */
  ownerId?: string;
  hasOwner?: boolean;
  /* Lifecycle */
  isActive?: boolean;
  includeArchived?: boolean;
  archivedOnly?: boolean;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  /** Serial number, skuCode fragment, or a full tag UID — the last gated. */
  search?: string;
  sort?:
    | "serial_asc"
    | "serial_desc"
    | "newest"
    | "oldest"
    | "recently_updated"
    | "code_asc";
}

/**
 * PATCH semantics throughout: an ABSENT key means "leave it alone", and null
 * is a value. `{"tamperStatus": null}` clears the note; omitting it does not
 * touch it. The body is strict — an unknown field is a 422, not a silently
 * ignored key, because a caller who believes they just transferred ownership
 * should find out on the request rather than a week later.
 *
 * The tag block needs nfc-tag-claim:manage ON TOP OF
 * collectible-instance:manage. A body mixing both when you hold only the
 * first is refused IN FULL with a 403 naming the fields — nothing partial is
 * written.
 */
export interface SkuUpdateInput {
  variantId?: string | null;
  isActive?: boolean;
  /** true archives AND delists. Refused on a held unit. */
  archived?: boolean;
  resaleBlocked?: boolean;
  resaleBlockedReason?: string | null;
  tamperStatus?: string | null;
  /**
   * The investigation freeze, and the only way claimedStatus moves here.
   * Unflagging does not restore "whatever it was before" — that is not
   * recorded anywhere — it derives from ownership: with an owner, CLAIMED;
   * without, UNCLAIMED.
   */
  flagged?: boolean;
  /* 🔒 nfc-tag-claim:manage */
  tagLifecycleState?: TagLifecycleState;
  vendorId?: string | null;
  provisioningBatchId?: string | null;
  vendorAuthenticated?: boolean;
  /**
   * Audit trail only — not a column. REQUIRED for the four changes that stop
   * something: flagging, archiving, and marking a tag LOST or REVOKED. Each
   * stops the unit being sellable, listed, or its tag trusted, and six months
   * later the only question anybody asks about that row is why.
   */
  reason?: string;
}

/** Exactly one selector. The three serial-based ones need a productId. */
export interface SkuBatchTargets {
  skuIds?: string[];
  skuCodes?: string[];
  serialNumbers?: number[];
  serialFrom?: number;
  serialTo?: number;
}

export interface SkuBatchInput {
  /** Comes from the path on the nested route. */
  productId?: string;
  targets: SkuBatchTargets;
  changes: SkuUpdateInput;
  /**
   * Resolves and validates everything, writes nothing, records nothing —
   * what a confirmation dialog shows before somebody commits to archiving a
   * hundred units.
   */
  dryRun?: boolean;
}

export interface SkuBatchResult {
  productId: string | null;
  /** How many units the selector named. */
  requested: number;
  /** How many of those exist and you can reach. */
  matched: number;
  /** How many actually differed and were written. */
  changed: number;
  /** Matched, but already in the requested state. NOT refusals. */
  unchanged: number;
  dryRun: boolean;
  items: {
    skuId: string;
    skuCode: string;
    serialNumber: number;
    /** The columns that moved — empty for a no-op. */
    changed: string[];
  }[];
}

/** Up to 1000 units per call, and a serial range may span at most 1000. */
export const SKU_BATCH_MAX = 1000;
/** SUPPLY_MANIFEST_MAX — matched to a physical carton. */
export const SUPPLY_MANIFEST_MAX = 1000;

/* ------------------------------------------------------------------ */
/* Artist self-service profile — /artist/me (artist-profile-api.md)    */
/*                                                                      */
/* Always the SIGNED-IN artist's own profile: no artist id in any URL.  */
/* ------------------------------------------------------------------ */

export interface ArtistProfile {
  id: string;
  publicCode: string;
  name: string;
  /** Public handle: 3–60, a-z 0-9 and single hyphens. */
  slug: string;
  bio: string | null;
  /** Stored as the genre LABEL ("Hip-Hop"). May predate the list. */
  genre: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  isActive: boolean;
  archivedAt: string | null;
  /** false when HitBox archived or deactivated the profile — read-only. */
  editable: boolean;
  compliance: { attested: boolean; attestedAt: string | null };
  organization: { id: string; name: string; type: string } | null;
  counts: { drops: number; collections: number; followers: number };
  createdAt: string;
  updatedAt: string;
}

export interface ArtistGenre {
  code: string;
  label: string;
}

/** Only the fields being changed; at least one. Anything else is a 422. */
export interface ArtistProfileUpdate {
  name?: string;
  slug?: string;
  bio?: string | null;
  /** A genre code or label; null clears it. */
  genre?: string | null;
  isPublic?: boolean;
}

export type ArtistImageKind = "avatar" | "cover";

export interface ArtistImageUploadUrl {
  kind: ArtistImageKind;
  assetId: string;
  /** Presigned PUT, bound to Content-Type and size. */
  uploadUrl: string;
  /** Seconds — 300. */
  expiresIn: number;
  publicUrl: string;
}

/* ------------------------------------------------------------------ */
/* Order unit assignment — scan-to-assign at packing                   */
/* (order-unit-assignment-api.md)                                      */
/* ------------------------------------------------------------------ */

/**
 * PROVISIONAL — paid, nothing scanned; `unit` is only the placeholder.
 * ASSIGNED    — a packer scanned it; `unit` is the one in the parcel.
 * NONE        — holds no stock (unpaid / cancelled): nothing to pack.
 */
export type OrderUnitState = "PROVISIONAL" | "ASSIGNED" | "NONE";

/** GET /admin/orders/:orderId/unit/candidates — a unit a scan would accept for this order. */
export interface UnitCandidate {
  skuId: string;
  skuCode: string;
  serialNumber: number;
  tagId: string | null;
  variantId: string | null;
  /** Already held for THIS order (its placeholder or the confirmed unit). */
  heldForThisOrder: boolean;
}

/** details of 409 ORDERS_UNIT_UNAVAILABLE. */
export interface UnitUnavailableDetails {
  skuCode: string;
  reason: "SOLD" | "HELD";
  orderId: string | null;
  orderPublicCode: string | null;
  orderStatus: string | null;
}

export interface OrderPackingState {
  orderId: string;
  publicCode: string;
  status: OrderStatus;
  productId: string;
  productCode: string;
  productName: string;
  variantId: string | null;
  /** WHAT TO PICK — "S / Red". Null on a drop with no variants. */
  variantLabel: string | null;
  variantCode: string | null;
  unitState: OrderUnitState;
  unit: {
    skuId: string;
    skuCode: string;
    serialNumber: number;
    tagId: string | null;
    variantId: string | null;
  } | null;
  unitAssignedAt: string | null;
  unitAssignedById: string | null;
  /** Assigned and PROCESSING. */
  readyToShip: boolean;
  placedAt: string;
}

/** Exactly ONE of tagId / skuCode / serialNumber. */
export type UnitScan =
  | { tagId: string; skuCode?: never; serialNumber?: never }
  | { skuCode: string; tagId?: never; serialNumber?: never }
  | { serialNumber: number; tagId?: never; skuCode?: never };

export type AssignOrderUnitInput = UnitScan & {
  /** Swap a unit that is already assigned. */
  replace?: boolean;
};

/** Scan-first: serialNumber is ambiguous without an order, so it is refused. */
export type AssignByScanInput = { tagId: string } | { skuCode: string };

export interface FulfilmentQueueParams {
  productId?: string;
  variantId?: string;
  page?: number;
  limit?: number;
}

/* ------------------------------------------------------------------ */
/* Artist collections (artist-collection-api.md, admin-monitoring-api) */
/* ------------------------------------------------------------------ */

export type ArtistCollectionStatus = "LIVE" | "ARCHIVED";

export interface ArtistCollectionCounts {
  /** Every drop ever filed under it, retired ones included. */
  drops: number;
  /** Not archived, any status — while above 0 the collection can't be deleted. */
  liveDrops: number;
  /** What the artist is shown: ACTIVE, switched on, not archived, theirs. */
  activeDrops: number;
}

export interface ArtistCollectionActions {
  canEdit: boolean;
  canArchive: boolean;
  archiveBlockedReason: "HAS_DROPS" | "ARCHIVED" | null;
  canRestore: boolean;
}

export interface ArtistCollection {
  id: string;
  publicCode: string;
  name: string;
  slug: string;
  description: string | null;
  heroImageUrl: string | null;
  /** 0-based order among live collections. */
  position: number;
  isPublic: boolean;
  isActive: boolean;
  archivedAt: string | null;
  status: ArtistCollectionStatus;
  counts: ArtistCollectionCounts;
  createdAt: string;
  updatedAt: string;
  /** Artist routes only. */
  actions?: ArtistCollectionActions;
}

/** GET /artist/collections/:id — only the drops on sale and the artist's own. */
export interface ArtistCollectionDrop {
  id: string;
  publicCode: string;
  name: string;
  groupCode: string;
  totalSupply: number;
  publishedAt: string | null;
  releaseStart: string | null;
  releaseEnd: string | null;
}

export interface ArtistCollectionDetail extends ArtistCollection {
  drops: ArtistCollectionDrop[];
}

/** GET /artist/collections/:id/available-drops — the Add drops picker. */
export interface AvailableCollectionDrop {
  id: string;
  publicCode: string;
  name: string;
  groupCode: string;
  totalSupply: number;
  publishedAt: string | null;
  /** Only ever set with includeFiled=true — adding it moves it here. */
  currentCollection: { id: string; name: string } | null;
}

export interface AvailableDropsParams {
  includeFiled?: boolean;
  q?: string;
  page?: number;
  limit?: number;
}

export interface AddCollectionDropsInput {
  /** 1–50, no duplicates. */
  dropIds: string[];
  /** Lets drops already in another of my collections move here. */
  move?: boolean;
}

/** POST …/drops and DELETE …/drops/:dropId. */
export interface CollectionDropsResult {
  collection: ArtistCollectionDetail;
  dropIds: string[];
  /** dropId → the collection it left. */
  movedFrom: Record<string, string>;
}

export type CollectionDropProblemCode =
  | "NOT_FOUND"
  | "NOT_ACTIVE"
  | "ALREADY_IN_COLLECTION"
  | "IN_ANOTHER_COLLECTION";

/** details.problems[] of ARTIST_COLLECTION_DROPS_INVALID. */
export interface CollectionDropProblem {
  dropId: string;
  problem: CollectionDropProblemCode;
  collection?: { id: string; name: string };
}

export interface CreateArtistCollectionInput {
  name: string;
  slug?: string;
  description?: string | null;
  isPublic?: boolean;
}

export type UpdateArtistCollectionInput = Partial<CreateArtistCollectionInput>;

export interface ArtistCollectionHeroUploadUrl {
  assetId: string;
  uploadUrl: string;
  expiresIn: number;
  publicUrl: string;
}

/** GET /admin/artist-collections — the monitoring list item. */
export interface AdminArtistCollection extends ArtistCollection {
  artist: {
    id: string;
    /** Null for an artist not yet linked to an account. */
    userId: string | null;
    name: string;
    slug: string;
    isActive: boolean;
    archived: boolean;
  };
  organization: { id: string; name: string } | null;
}

export interface AdminArtistCollectionDrop {
  id: string;
  name: string;
  status: string;
  archivedAt: string | null;
  createdAt: string;
  /** ACTIVE, switched on, not archived, and sameArtist. */
  shownToArtist: boolean;
  /** false is legacy data — the drop belongs to a different artist. */
  sameArtist: boolean;
}

export interface AdminArtistCollectionDetail extends AdminArtistCollection {
  drops: AdminArtistCollectionDrop[];
}

export interface AdminArtistCollectionSummary {
  total: number;
  live: number;
  archived: number;
  public: number;
  private: number;
  empty: number;
  createdLast30Days: number;
  artistsWithCollections: number;
  topArtists: { artistId: string; name: string; liveCollections: number }[];
}

export interface AdminArtistCollectionFilters {
  status?: "all" | "live" | "archived";
  artistId?: string;
  organizationId?: string;
  isPublic?: "true" | "false";
  empty?: "true" | "false";
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  sort?: "newest" | "oldest" | "updated" | "name";
  page?: number;
  limit?: number;
}

/** A row from GET /admin/audit/events — the full event, states included. */
export interface AuditTrailEvent {
  eventId: string;
  occurredAt: string;
  eventType: string;
  actorType: string;
  actorId: string | null;
  actorRoleSnapshot: string | null;
  organizationId: string | null;
  resourceType: string;
  resourceId: string | null;
  actionResult: "SUCCESS" | "FAILURE" | "DENIED" | string;
  severity: "INFO" | "WARNING" | "CRITICAL" | string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  correlationId: string;
  /** `aud…` — human-readable, never a key. */
  publicCode?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  /** Provenance actions: the BlockchainLedger row produced. */
  ledgerReferenceId?: string | null;
  /** Write time — the gap from occurredAt shows clock skew and late writes. */
  insertedAt?: string;
}

export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AuditActionResult = "SUCCESS" | "FAILURE" | "DENIED";

/** GET /admin/audit/event-types — one catalog row. */
export interface AuditEventTypeRow {
  eventType: string;
  publicCode?: string | null;
  personaGroup: string;
  description: string;
  defaultSeverity: AuditSeverity;
  /** The requirement that justified recording it. */
  sourceStories: string[];
  isActive: boolean;
  createdAt: string;
}

/** GET /admin/audit/retention — one row per severity. */
export interface AuditRetentionPolicy {
  severity: AuditSeverity;
  retentionDays: number;
  notes: string;
  /** Events older than this, at this severity, are out of policy. */
  cutoff: string;
  /** Only with ?withCounts=true or the prune plan. */
  pendingDeletion?: number;
}

export interface UpdateRetentionInput {
  /** 1 – 36,500. */
  retentionDays: number;
  /** 10 – 1,000 characters, required. */
  notes: string;
}

export interface AuditTrailPage {
  data: AuditTrailEvent[];
  meta: { limit: number; returned: number; nextCursor: string | null; hasMore: boolean };
}

export interface AuditTrailQuery {
  eventType?: string;
  actorId?: string;
  organizationId?: string;
  resourceType?: string;
  resourceId?: string;
  actionResult?: string;
  severity?: string;
  correlationId?: string;
  /** Inclusive. */
  from?: string;
  /** Exclusive. */
  to?: string;
  /** ≤ 200. */
  limit?: number;
}
