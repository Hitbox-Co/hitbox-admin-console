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
  // role assignment
  | "ACCESS_CONTROL_ASSIGNMENT_EXISTS"
  | "ACCESS_CONTROL_MISSING_ORG_SCOPE"
  | "ACCESS_CONTROL_ROLE_NOT_FOUND"
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
  fullName: string;
  handle: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
  joinedAt: string;
  roles: TeamRoleEntry[];
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
  refunds?: OrderPayment[];
}

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
  organizationId: string | null;
  performance: ProductPerformance;
  /**
   * Size / colour / material, as `optionName`:`optionValue` pairs.
   *
   * READ-ONLY: `ProductVariant` is a real table and comes back on every
   * product read, but the backend exposes no endpoint to create or edit one —
   * the product DTO says so outright ("a drop being created right now has no
   * variants yet"). A variant can therefore only be TARGETED when minting, not
   * authored here.
   */
  variants: ProductVariantRef[];
  /** Paginated — a 10,000-unit edition is a legitimate drop. */
  skuUnits: Paginated<ProductSkuUnit>;
}

export interface ProductVariantRef {
  id: string;
  label: string;
  /** e.g. "Size" */
  optionName: string;
  /** e.g. "L" */
  optionValue: string;
}

export interface ProductInput {
  name?: string;
  description?: string | null;
  vertical?: string;
  category?: string;
  rarity?: string;
  totalSupply?: number;
  purchaseLimit?: number | null;
  collectionId?: string | null;
  artistId?: string | null;
  organizationId?: string | null;
  releaseStart?: string | null;
  releaseEnd?: string | null;
  status?: string;
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
}

/* ------------------------------------------------------------------ */
/* Release approvals — /admin/releases (admin-write-apis.md §4)        */
/*                                                                      */
/* Append-only per version: resubmitting a rejected drop creates        */
/* version N+1 rather than overwriting the rejection.                   */
/* ------------------------------------------------------------------ */

export type ReleaseStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ComplianceStatus = "PENDING" | "CLEARED" | "FLAGGED";

export interface ReleaseApproval {
  id: string;
  productId: string;
  status: ReleaseStatus;
  version: number;
  comment: string | null;
  complianceStatus: ComplianceStatus;
  oddsDisclosureRef: string | null;
  approverId: string | null;
  approverEmail: string | null;
  approverName: string | null;
  checkedById: string | null;
  checkedAt: string | null;
  decidedAt: string | null;
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
  comment: string | null;
  complianceStatus: ComplianceStatus;
  approverId: string | null;
  approverEmail: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ReleaseApprovalDetail extends ReleaseApproval {
  /** Every prior decision on the product, newest version first. */
  history: ReleaseHistoryEntry[];
  /** Drive the approve/reject buttons from these, not from status. */
  canDecide: boolean;
  blockedReason: string | null;
}

export interface ReleaseDecisionInput {
  status: "APPROVED" | "REJECTED";
  /** Required when rejecting — the API refuses without one. */
  comment?: string;
  complianceStatus?: ComplianceStatus;
  oddsDisclosureRef?: string | null;
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
