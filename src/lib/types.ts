/**
 * Shapes emitted by the HitBox Collectibles admin API.
 *
 * The single most important rule this file encodes: a section the caller
 * cannot see is OMITTED, not empty. Every permission-gated section is
 * therefore declared optional, and the UI must branch on key presence
 * rather than on a truthy check of the contents.
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
  | "AUTH_UNAUTHENTICATED"
  | "AUTH_EMAIL_UNVERIFIED"
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
  grossRevenue: Money;
  collectedRevenue: Money;
  refundedAmount: Money;
  netRevenue: Money;
  costOfGoods: Money;
  gatewayFees: Money;
  royalties: Money;
  profit: Money;
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

export interface ActivityEvent {
  eventId: string;
  occurredAt: string;
  type: string;
  actorId: string;
  /** The role the actor held AT THE TIME. Render this, not current roles. */
  actorRoleSnapshot: string;
  resourceType: string;
  resourceId: string;
  actionResult: "SUCCESS" | "FAILURE" | string;
  severity: "INFO" | "WARNING" | "CRITICAL" | string;
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
  /** Only with buyer-profile:read; truncated unless FULL visibility. */
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
  caseType: string;
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

export interface ProvenanceListResponse extends Paginated<ProvenanceCaseRow> {
  summary: Record<string, number>;
}

export interface ProductRow {
  id: string;
  name: string;
  status: string;
  organizationId: string;
  totalSupply: number;
  sold: number;
  available: number;
  createdAt: string;
}

export interface SupplyRow {
  id: string;
  vendorId: string;
  vendorName: string;
  productId: string;
  productName: string;
  status: string;
  quantityOrdered: number;
  quantityReceived: number;
  expectedAt: string | null;
}

export interface SupplyListResponse extends Paginated<SupplyRow> {
  activeVendors: number;
}

export interface ResaleRow {
  id: string;
  skuId: string;
  productName: string;
  status: string;
  listedAt: string;
  price?: string;
  currency?: string;
  sellerId?: string;
}

export interface ResaleListResponse extends Paginated<ResaleRow> {
  counts: Record<string, number>;
}

export interface DemandSignalRow {
  productId: string;
  productName: string;
  watchers: number;
  waitlisted: number;
  conversionRate: number;
}

/* ------------------------------------------------------------------ */
/* Authz administration                                                */
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

export interface Role {
  roleId: string;
  name: string;
  displayName: string;
  entityGroup: string;
  domain: PermissionDomain;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
  assignmentCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type ScopeType = "GLOBAL" | "ORGANIZATION" | "OWN";

export interface RoleAssignment {
  assignmentId: string;
  roleId: string;
  roleName: string;
  displayName: string;
  scopeType: ScopeType;
  organizationId: string | null;
  assignedAt: string;
  revokedAt: string | null;
}

export interface AdminUserRow {
  userId: string;
  email: string;
  displayName: string;
  roles: { roleId: string; roleName: string; displayName: string }[];
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

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
  /** An S3 key, not a URL. Never build a URL from it. */
  storageRef: string;
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
}
