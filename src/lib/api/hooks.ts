"use client";

import * as React from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { ApiError, api, unwrap, type QueryValue } from "./client";
import type {
  AdminArtistCollection,
  AdminArtistCollectionDetail,
  AdminArtistCollectionFilters,
  AdminArtistCollectionSummary,
  ArtistCollection,
  ArtistCollectionDetail,
  ArtistCollectionHeroUploadUrl,
  AdminArtistFilters,
  ArtistDirectorySummary,
  ArtistStaffProfile,
  ArtistStaffUpdate,
  ArtistStateAction,
  ArtistStats,
  ArtistStatsPeriod,
  AddCollectionDropsInput,
  AvailableCollectionDrop,
  AvailableDropsParams,
  CollectionDropsResult,
  AuditEventTypeRow,
  AuditRetentionPolicy,
  AuditTrailEvent,
  AuditTrailPage,
  AuditTrailQuery,
  AuditSeverity,
  UpdateRetentionInput,
  CreateArtistCollectionInput,
  UpdateArtistCollectionInput,
  AssignByScanInput,
  CorrectShipmentInput,
  RecordShipmentInput,
  AssignOrderUnitInput,
  FulfilmentQueueParams,
  OrderPackingState,
  UnitCandidate,
  ArtistGenre,
  ArtistImageKind,
  ArtistImageUploadUrl,
  ArtistProfile,
  ArtistProfileUpdate,
  CreateDropTypeInput,
  DropType,
  DropTypeDimensionInput,
  DropTypeValueInput,
  DropVariant,
  GenerateVariantsInput,
  GenerateVariantsResult,
  RemoveVariantResult,
  UpdateDimensionInput,
  UpdateDimensionValueInput,
  UpdateDropTypeInput,
  UpdateVariantInput,
  VariantInput,
  ActivityEvent,
  ActivityEventRaw,
  Adjustment,
  AdjustmentInput,
  AdminArtist,
  AdminMarket,
  AdminOrganization,
  ApproveRefundInput,
  CloseRuleInput,
  ConfirmReturnInput,
  Dispute,
  ExecutePayoutInput,
  FinanceEntry,
  GatewayConfig,
  GatewayConfigInput,
  GatewayConfigUpdate,
  OpenDisputeInput,
  PaymentTransaction,
  Payout,
  ProcessRefundInput,
  Refund,
  RequestRefundInput,
  ResolveDisputeInput,
  ReverseEntryInput,
  ReviewPaymentInput,
  RevenueSummaryRow,
  RoyaltyBalance,
  RoyaltyEntry,
  RoyaltyEntryDetail,
  RoyaltyRule,
  RoyaltyRuleInput,
  SchedulePayoutsInput,
  SchedulePayoutsResult,
  SubmitEvidenceInput,
  WebhookEvent,
  AdminOrderDetail,
  AdminOrderRow,
  AdminProductDetail,
  ArchivedFilter,
  AuthzMe,
  ComplianceStatus,
  DashboardResponse,
  DemandSignalRow,
  FinanceSection,
  MarketInput,
  ProductCreateInput,
  MarketRow,
  MediaAssetUrl,
  MediaListResponse,
  OrderRow,
  OrderStatusInput,
  Paginated,
  PermissionGroup,
  Period,
  ProductInput,
  PublishProductInput,
  PublishProductResult,
  ProductRow,
  ProvenanceListResponse,
  ReleaseApproval,
  ReleaseApprovalDetail,
  ReleaseApprovalRow,
  ReleaseDecisionInput,
  MetaPaginated,
  NfcTagRow,
  SkuBatchInput,
  SkuBatchResult,
  SkuFilters,
  SkuUpdateInput,
  SupplyBatch,
  SupplyBatchDecisionInput,
  SupplyBatchDecisionResult,
  SupplyBatchFilters,
  SupplyBatchInput,
  SupplyMetrics,
  SupplyMetricsParams,
  SupplyTagFilters,
  TagManifestInput,
  TagManifestResult,
  TagQcInput,
  Vendor,
  VendorFilters,
  VendorInput,
  VendorAllotmentInput,
  VendorBatchFilters,
  VendorBatchInput,
  VendorDropAssignment,
  VendorMe,
  VendorMember,
  VendorMemberInviteInput,
  VendorMemberInviteResult,
  VendorMemberStatus,
  ReleaseReopenInput,
  ResaleListResponse,
  AssetType,
  BindTagsInput,
  BindTagsResult,
  ProductGallery,
  ProductImageInput,
  ProductPrice,
  ProductPriceInput,
  RetagUnitInput,
  UploadUrlResponse,
  MintResult,
  MintSkusInput,
  SkuListParams,
  SkuListResponse,
  SkuSummary,
  SkuUnitDetail,
  Role,
  RoleAssignment,
  ScopeType,
  StaffInvitation,
  CreateInvitationInput,
  CreateInvitationResult,
  SupplyListResponse,
  TeamMember,
  UsersSection,
} from "../types";

/**
 * Never retry a deliberate refusal — the answer will not change.
 *
 * AUTH_ACCOUNT_SUSPENDED is terminal (authentication.md §3). AUTH_INVALID_TOKEN
 * and AUTH_ACCOUNT_NOT_FOUND are intentionally left OUT of this set: the docs
 * ask for a bounded retry on both (token refresh; webhook-provisioning race),
 * which the default `retry: count < 2` below already provides.
 */
const TERMINAL = new Set([401, 403, 404, 409, 422, 503]);
const TERMINAL_CODES = new Set(["AUTH_ACCOUNT_SUSPENDED"]);

function retry(count: number, err: unknown): boolean {
  if (err instanceof ApiError) {
    if (TERMINAL_CODES.has(err.code)) return false;
    if (err.code === "AUTH_INVALID_TOKEN" || err.code === "AUTH_ACCOUNT_NOT_FOUND") {
      return count < 2;
    }
    if (TERMINAL.has(err.status)) return false;
  }
  return count < 2;
}

const baseOptions = {
  retry,
  staleTime: 30_000,
  refetchOnWindowFocus: false,
} satisfies Partial<UseQueryOptions>;

/**
 * Warm page N+1 as soon as page N lands, so "next" paints instantly.
 *
 * The prefetched key is built exactly the way the list hook builds its own —
 * [base, {...params, page: page + 1}] — and TanStack hashes keys
 * structurally, so when the user actually pages, the hook finds this entry
 * instead of issuing a request. It stops at the last page, so the cost is one
 * spare request per list, not one per row.
 */
function useNextPageWarm<T>(
  base: string,
  path: string,
  /** Any list's filter object — read only to be re-serialised with page + 1. */
  params: object,
  meta: { page?: number; limit?: number; total?: number } | undefined
) {
  const qc = useQueryClient();
  // `params` is a fresh object every render; serialise it so the effect
  // compares by value rather than firing on each parent re-render.
  const paramsKey = JSON.stringify(params);
  const page = meta?.page;
  const limit = meta?.limit;
  const total = meta?.total;

  React.useEffect(() => {
    if (!page || !limit || !total) return;
    if (page * limit >= total) return;
    const next = {
      ...(JSON.parse(paramsKey) as Record<string, unknown>),
      page: page + 1,
    };
    void qc.prefetchQuery({
      ...baseOptions,
      queryKey: [base, next],
      queryFn: () => api.get<T>(path, next as Record<string, QueryValue>),
    });
  }, [qc, base, path, paramsKey, page, limit, total]);
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export function useAuthzMe() {
  return useQuery({
    queryKey: ["authz", "me"],
    queryFn: () => api.get<unknown>("authz/me").then(unwrap<AuthzMe>),
    staleTime: 5 * 60_000,
    retry,
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DashboardFilters {
  period: Period;
  from?: string;
  to?: string;
  organizationId?: string;
  marketId?: string;
}

export function useDashboard(filters: DashboardFilters) {
  return useQuery({
    ...baseOptions,
    queryKey: ["dashboard", filters],
    queryFn: () => api.get<DashboardResponse>("admin/dashboard", { ...filters }),
  });
}

export function useDashboardUsers(period: Period) {
  return useQuery({
    ...baseOptions,
    queryKey: ["dashboard", "users", period],
    queryFn: () =>
      api.get<unknown>("admin/dashboard/users", { period }).then(unwrap<UsersSection>),
  });
}

export function useDashboardFinance(period: Period) {
  return useQuery({
    ...baseOptions,
    queryKey: ["dashboard", "finance", period],
    queryFn: () =>
      api.get<unknown>("admin/dashboard/finance", { period }).then(unwrap<FinanceSection>),
  });
}

export function useMarkets(period: Period) {
  return useQuery({
    ...baseOptions,
    queryKey: ["dashboard", "markets", period],
    queryFn: () =>
      api.get<unknown>("admin/dashboard/markets", { period }).then(unwrap<MarketRow[]>),
  });
}

export interface ListParams {
  page?: number;
  limit?: number;
  [key: string]: string | number | undefined;
}

export function useOrders(params: ListParams) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["orders", params],
    queryFn: () => api.get<Paginated<OrderRow>>("admin/dashboard/orders", params),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<OrderRow>>("orders", "admin/dashboard/orders", params, query.data);
  return query;
}

export function useProducts(params: ListParams) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["products", params],
    queryFn: () => api.get<Paginated<ProductRow>>("admin/dashboard/products", params),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<ProductRow>>("products", "admin/dashboard/products", params, query.data);
  return query;
}

export function useReleaseApprovals(params: ListParams) {
  return useQuery({
    ...baseOptions,
    queryKey: ["release-approvals", params],
    queryFn: () =>
      api.get<Paginated<ReleaseApprovalRow>>("admin/dashboard/release-approvals", params),
    placeholderData: (prev) => prev,
  });
}

export function useProvenance(params: ListParams) {
  return useQuery({
    ...baseOptions,
    queryKey: ["provenance", params],
    queryFn: () => api.get<ProvenanceListResponse>("admin/dashboard/provenance", params),
    placeholderData: (prev) => prev,
  });
}

export function useSupply(params: ListParams) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply", params],
    queryFn: () => api.get<SupplyListResponse>("admin/dashboard/supply", params),
    placeholderData: (prev) => prev,
  });
}

export function useResale(params: ListParams) {
  return useQuery({
    ...baseOptions,
    queryKey: ["resale", params],
    queryFn: () => api.get<ResaleListResponse>("admin/dashboard/resale", params),
    placeholderData: (prev) => prev,
  });
}

/**
 * Normalises `eventType` -> `type` before anything renders.
 *
 * The aggregate dashboard renames this field server-side and the list
 * endpoint does not (see ActivityEvent in types.ts), so the shared
 * ActivityFeed received `undefined` here and crashed on `type.split(".")`.
 * Normalising once at the boundary means components never have to know which
 * endpoint their events came from.
 */
export function useActivity(params: ListParams) {
  return useQuery({
    ...baseOptions,
    queryKey: ["activity", params],
    queryFn: async () => {
      const res = await api.get<Paginated<ActivityEventRaw>>(
        "admin/dashboard/activity",
        params
      );
      return {
        ...res,
        items: res.items.map(normalizeActivityEvent),
      } satisfies Paginated<ActivityEvent>;
    },
    placeholderData: (prev) => prev,
  });
}

/** Accepts either wire shape; `type` is always a string afterwards. */
export function normalizeActivityEvent(e: ActivityEventRaw): ActivityEvent {
  const { eventType, type, ...rest } = e;
  return { ...rest, type: type ?? eventType ?? "unknown" };
}

/** No pagination on this endpoint — always the top 10 by wishlist count. */
export function useDemandSignals() {
  return useQuery({
    ...baseOptions,
    queryKey: ["demand-signals"],
    queryFn: () =>
      api.get<unknown>("admin/dashboard/demand-signals").then(unwrap<DemandSignalRow[]>),
  });
}

/* ------------------------------------------------------------------ */
/* Authorization administration                                        */
/* ------------------------------------------------------------------ */

export function usePermissionCatalog(domain?: string) {
  return useQuery({
    ...baseOptions,
    staleTime: 10 * 60_000,
    queryKey: ["authz", "permissions", domain ?? "all"],
    queryFn: () =>
      api
        .get<unknown>("admin/authz/permissions", { shape: "grouped", domain })
        .then(unwrap<PermissionGroup[]>),
  });
}

/**
 * The list already carries every role's full permission set, so the edit
 * screen needs no second call (admin-write-apis.md §6).
 */
export function useRoles(domain?: string) {
  return useQuery({
    ...baseOptions,
    queryKey: ["authz", "roles", domain ?? "all"],
    queryFn: () => api.get<unknown>("admin/authz/roles", { domain }).then(unwrap<Role[]>),
  });
}

/** Same shape as one element of the list — kept for deep links into a role. */
export function useRole(roleId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["authz", "role", roleId],
    enabled: !!roleId,
    queryFn: () => api.get<unknown>(`admin/authz/roles/${roleId}`).then(unwrap<Role>),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      displayName: string;
      entityGroup: string;
      domain: string;
      /**
       * Permission KEY strings (e.g. "order:read:own"), not ids. The
       * catalog has no separate permission id — this resolves a conflict
       * between the two backend docs; see types.ts's header comment.
       */
      permissions: string[];
    }) => api.post<unknown>("admin/authz/roles", payload).then(unwrap<Role>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["authz", "roles"] }),
  });
}

/**
 * PATCH takes displayName, entityGroup, isActive and permissions — and
 * deliberately NOT `domain`: a role's domain is immutable, because flipping
 * BUSINESS -> TECHNICAL would silently re-authorise everyone holding it
 * (admin-write-apis.md §6). `permissions` REPLACES the set.
 */
export interface RoleUpdateInput {
  displayName?: string;
  entityGroup?: string;
  isActive?: boolean;
  /** Catalog key strings, not RolePermissionRef objects. */
  permissions?: string[];
}

export function useUpdateRole(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoleUpdateInput) =>
      api.patch<unknown>(`admin/authz/roles/${roleId}`, payload).then(unwrap<Role>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authz", "roles"] });
      qc.invalidateQueries({ queryKey: ["authz", "role", roleId] });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => api.delete<unknown>(`admin/authz/roles/${roleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["authz", "roles"] }),
  });
}

/**
 * GET /admin/authz/team — anyone holding at least one live role. `search`
 * matches full name, email or handle, server-side, case-insensitively.
 *
 * `internalOnly` defaults to TRUE on the server: only HitBox staff (roles
 * whose entityGroup is hitbox_seller_org). Pass false to include brand and
 * artist role-holders (admin-write-apis.md §7).
 */
export function useTeam(
  search?: string,
  page = 1,
  limit = 20,
  internalOnly = true
) {
  return useQuery({
    ...baseOptions,
    queryKey: ["authz", "team", search ?? "", page, limit, internalOnly],
    queryFn: () =>
      api.get<Paginated<TeamMember>>("admin/authz/team", {
        search,
        page,
        limit,
        internalOnly,
      }),
    placeholderData: (prev) => prev,
  });
}

export function useUserRoles(userId: string | undefined, includeRevoked = false) {
  return useQuery({
    ...baseOptions,
    queryKey: ["authz", "user-roles", userId, includeRevoked],
    enabled: !!userId,
    queryFn: () =>
      api
        .get<unknown>(`admin/authz/users/${userId}/roles`, { includeRevoked })
        .then(unwrap<RoleAssignment[]>),
  });
}

export function useAssignRole(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      roleId: string;
      scopeType?: ScopeType;
      organizationId?: string | null;
    }) => api.post<unknown>(`admin/authz/users/${userId}/roles`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authz", "user-roles", userId] });
      qc.invalidateQueries({ queryKey: ["authz", "team"] });
    },
  });
}

export function useRevokeRole(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    // organizationId disambiguates when the same role is held at several
    // organizations — pass it whenever the assignment being revoked has one.
    mutationFn: ({ roleId, organizationId }: { roleId: string; organizationId?: string | null }) =>
      api.delete<unknown>(
        `admin/authz/users/${userId}/roles/${roleId}${
          organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ""
        }`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authz", "user-roles", userId] });
      qc.invalidateQueries({ queryKey: ["authz", "team"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Staff invitations                                                   */
/*                                                                     */
/* docs/authorization/admin-provisioning.md. The three routes sit under */
/* the same base path as the rest of access control and take the same   */
/* capabilities as granting a role directly: assign to create, read to  */
/* list, delete to revoke — an invitation IS a role assignment that     */
/* happens later, and a weaker deferred door would undo the control.    */
/* ------------------------------------------------------------------ */

export interface InvitationFilters {
  page?: number;
  limit?: number;
  status?: string;
  email?: string;
  roleId?: string;
}

/**
 * An organization-scoped administrator sees invitations into their own
 * organizations only; global ones are excluded from their view entirely
 * (§6) — so an empty list here does NOT mean nobody is being onboarded.
 */
export function useInvitations(params: InvitationFilters) {
  return useQuery({
    ...baseOptions,
    queryKey: ["authz", "invitations", params],
    queryFn: async () => {
      const raw = await api.get<unknown>("admin/authz/invitations", {
        ...params,
      });
      // The doc names this route's query parameters but not its envelope.
      // Every other paginated admin list is `{page,limit,total,items}` and
      // that is what is assumed; a bare array is tolerated rather than
      // painting an empty table against a shape that is merely different.
      const body = unwrap<Paginated<StaffInvitation> | StaffInvitation[]>(raw);
      if (Array.isArray(body)) {
        return {
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          total: body.length,
          items: body,
        } satisfies Paginated<StaffInvitation>;
      }
      return body;
    },
    placeholderData: (prev) => prev,
  });
}

/**
 * Two outcomes, one endpoint. `ROLE_ASSIGNED` means the address already had
 * an account and the grant landed immediately — which is common, because
 * staff buy things too and Clerk refuses to invite an address it knows — so
 * the team list is stale as well and both caches are invalidated.
 */
export function useCreateInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateInvitationInput) =>
      api
        .post<unknown>("admin/authz/invitations", payload)
        .then(unwrap<CreateInvitationResult>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authz", "invitations"] });
      qc.invalidateQueries({ queryKey: ["authz", "team"] });
    },
  });
}

/**
 * Withdrawing an invitation takes `employee-role-mgmt:delete`, not assign:
 * it is revoking a grant that has not landed yet.
 *
 * An already-ACCEPTED invitation answers 409 — the role exists by then and
 * the thing to revoke is the assignment, not this row.
 */
export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      invitationId,
      reason,
    }: {
      invitationId: string;
      reason?: string;
    }) =>
      api.post<unknown>(
        `admin/authz/invitations/${invitationId}/revoke`,
        reason ? { reason } : {}
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["authz", "invitations"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/*                                                                      */
/* No virus scanner exists in this deployment (admin-console-api.md     */
/* §11) — every asset is created SKIPPED and is immediately servable.   */
/* There is nothing to poll for, so this hook does not refetch on an    */
/* interval the way an earlier draft of this console did.               */
/* ------------------------------------------------------------------ */

/**
 * `archived` defaults to `live` server-side and the console keeps that: the
 * media browser shows what is in use, and an archived asset reappearing in it
 * reads as "the delete did not work" (admin-write-apis.md §5).
 */
export function useMedia(params: ListParams & { archived?: ArchivedFilter }) {
  return useQuery({
    ...baseOptions,
    queryKey: ["media", params],
    queryFn: () => api.get<MediaListResponse>("admin/media", params),
    placeholderData: (prev) => prev,
  });
}

export function useArchiveAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => api.delete<unknown>(`admin/media/${assetId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

/**
 * GET /admin/media/:assetId/url. Fetch fresh when `expiresIn` is a number
 * (private assets, 60s); when it is null the URL is permanent and safe to
 * cache. 404 covers not-found/archived/out-of-scope/not-yet-servable
 * identically, so ids from other organizations cannot be probed.
 *
 * Prefer `asset.publicUrl` directly for DROP_IMAGE/PROFILE_IMAGE — it is
 * already permanent and needs no call at all. Use this hook for the rest.
 */
export function useAssetUrl(assetId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["media", "url", assetId],
    enabled: !!assetId && enabled,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: () => api.get<MediaAssetUrl>(`admin/media/${assetId}/url`),
  });
}

/* ------------------------------------------------------------------ */
/* Owner directories — /admin/artists, /admin/organizations            */
/*                                                                      */
/* Both are gated on `drop:read`, which is what makes them usable from  */
/* the drop form: a Drop Manager fills in brand and artist without ever  */
/* holding a brand-artist-record grant.                                 */
/*                                                                      */
/* Fetched whole rather than paginated. The server caps at 200 and the   */
/* rows are tiny, so a picker holds the entire directory and filters in  */
/* the browser — a select that pages is a select nobody can use.        */
/* ------------------------------------------------------------------ */

/** `{ data, meta }` — unwrap takes the rows and drops the paging, which is
 *  what a picker wants. Raise `limit` before assuming the list is complete. */
export function useAdminOrganizations(enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-organizations"],
    enabled,
    // The directory changes on the order of never; re-reading it on every
    // drawer open would be pure noise.
    staleTime: 5 * 60_000,
    queryFn: () =>
      api
        .get<unknown>("admin/organizations", { limit: 200 })
        .then(unwrap<AdminOrganization[]>),
  });
}

/**
 * `organizationId` narrows to one brand's roster — the drop form passes it
 * once a brand is picked, so the artist list stops offering people who do not
 * belong to it.
 */
export function useAdminArtists(organizationId?: string, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-artists", organizationId ?? "all"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () =>
      api
        .get<unknown>("admin/artists", { limit: 200, organizationId })
        .then(unwrap<AdminArtist[]>),
  });
}

/* ------------------------------------------------------------------ */
/* Markets — the managed record, not the reporting re-slice            */
/*                                                                      */
/* Reads need only reports-dashboards:read; every write needs           */
/* drop:manage at GLOBAL scope, so an org-scoped caller gets a 403      */
/* rather than a partial screen (admin-write-apis.md §0).               */
/* ------------------------------------------------------------------ */

export function useAdminMarkets(params: {
  includeArchived?: boolean;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-markets", params],
    queryFn: () => api.get<Paginated<AdminMarket>>("admin/markets", { ...params }),
    placeholderData: (prev) => prev,
  });
}

export function useAdminMarket(marketId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-market", marketId],
    enabled: !!marketId,
    queryFn: () =>
      api.get<unknown>(`admin/markets/${marketId}`).then(unwrap<AdminMarket>),
  });
}

/** Anything that writes a market also moves the dashboard's market slice. */
function invalidateMarkets(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admin-markets"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

export function useCreateMarket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MarketInput) =>
      api.post<unknown>("admin/markets", payload).then(unwrap<AdminMarket>),
    onSuccess: () => invalidateMarkets(qc),
  });
}

export function useUpdateMarket(marketId: string) {
  const qc = useQueryClient();
  return useMutation({
    // `code` is immutable — it is the stable key saved reports reference.
    // countryCodes REPLACES, so callers must send the whole list.
    mutationFn: (payload: Omit<MarketInput, "code">) =>
      api.patch<unknown>(`admin/markets/${marketId}`, payload).then(unwrap<AdminMarket>),
    onSuccess: () => {
      invalidateMarkets(qc);
      qc.invalidateQueries({ queryKey: ["admin-market", marketId] });
    },
  });
}

/** Soft archive. Refused with MARKETS_IN_USE if live ProductPrice rows exist. */
export function useArchiveMarket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (marketId: string) =>
      api.delete<unknown>(`admin/markets/${marketId}`).then(unwrap<AdminMarket>),
    onSuccess: () => invalidateMarkets(qc),
  });
}

/* ------------------------------------------------------------------ */
/* Orders — the admin surface, richer than the dashboard's             */
/* ------------------------------------------------------------------ */

export interface AdminOrderFilters {
  status?: string;
  buyerEmail?: string;
  productCode?: string;
  marketId?: string;
  organizationId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/**
 * Filtering by buyerEmail without buyer-profile:read is a 403, not a
 * silently-ignored filter — otherwise the result count would confirm an
 * address exists to someone who may not see buyers. The Orders screen hides
 * that input rather than letting it fail.
 */
export function useAdminOrders(params: AdminOrderFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["admin-orders", params],
    queryFn: () => api.get<Paginated<AdminOrderRow>>("admin/orders", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<AdminOrderRow>>("admin-orders", "admin/orders", params, query.data);
  return query;
}

/**
 * One definition of "how to fetch order N", shared by the hook and the
 * prefetch below. If these were written twice the query keys would eventually
 * drift, and a prefetch that writes to a key nobody reads is invisible waste.
 */
export const orderDetailOptions = (orderId: string) => ({
  ...baseOptions,
  queryKey: ["admin-order", orderId] as const,
  queryFn: () =>
    api.get<unknown>(`admin/orders/${orderId}`).then(unwrap<AdminOrderDetail>),
});

export function useAdminOrder(orderId: string | undefined) {
  return useQuery({
    ...orderDetailOptions(orderId ?? ""),
    enabled: !!orderId,
  });
}

/**
 * Warm an order on hover or keyboard focus, so the drawer is usually painted
 * from cache by the time the click lands. `prefetchQuery` is a no-op when the
 * entry is already fresh, so repeatedly crossing a row costs one request.
 */
export function usePrefetchOrder() {
  const qc = useQueryClient();
  return React.useCallback(
    (orderId: string) => void qc.prefetchQuery(orderDetailOptions(orderId)),
    [qc]
  );
}

/**
 * The response is the full refreshed detail, so the drawer does not need a
 * second fetch — it is written straight into the cache.
 *
 * A repeat of the current status is a 200 no-op, not an error: a
 * double-clicked button should not read as a failure. A 409 means another
 * operator moved it first — the UI says "reload", it does not retry.
 */
export function useUpdateOrderStatus(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OrderStatusInput) =>
      api
        .patch<unknown>(`admin/orders/${orderId}/status`, payload)
        .then(unwrap<AdminOrderDetail>),
    onSuccess: (detail) => {
      qc.setQueryData(["admin-order", orderId], detail);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      // A cancel leaves the packing queue; the packing state follows the status.
      qc.invalidateQueries({ queryKey: ["order-unit", orderId] });
      qc.invalidateQueries({ queryKey: ["fulfilment-queue"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Products — admin detail and catalog CRUD                            */
/* ------------------------------------------------------------------ */

export interface ProductDetailParams {
  skuPage?: number;
  skuLimit?: number;
  claimedStatus?: string;
}

export const productDetailOptions = (
  productId: string,
  params: ProductDetailParams = {}
) => ({
  ...baseOptions,
  queryKey: ["admin-product", productId, params] as const,
  queryFn: () =>
    api
      .get<unknown>(`admin/products/${productId}`, { ...params })
      .then(unwrap<AdminProductDetail>),
});

export function useAdminProduct(
  productId: string | undefined,
  params: ProductDetailParams = {}
) {
  return useQuery({
    ...productDetailOptions(productId ?? "", params),
    enabled: !!productId,
    // Paging SKU units keeps the previous page on screen instead of
    // collapsing the drawer back to a skeleton.
    placeholderData: (prev) => prev,
  });
}

/** Prefetches the FIRST page of units — the one the drawer opens on. */
export function usePrefetchProduct() {
  const qc = useQueryClient();
  return React.useCallback(
    (productId: string, params: ProductDetailParams = {}) =>
      void qc.prefetchQuery(productDetailOptions(productId, params)),
    [qc]
  );
}

function invalidateProducts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["admin-product"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

/**
 * `prices` is required with at least one entry (product-upload-api.md §3) —
 * hence `ProductCreateInput` rather than `ProductInput`. Everything in
 * `prices`, `skus` and `images` is written in the same transaction as the
 * product, so the request produces a complete drop or produces nothing.
 */
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProductCreateInput) =>
      api.post<unknown>("admin/products", payload).then(unwrap<AdminProductDetail>),
    onSuccess: () => invalidateProducts(qc),
  });
}

export function useUpdateProduct(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProductInput) =>
      api
        .patch<unknown>(`admin/products/${productId}`, payload)
        .then(unwrap<AdminProductDetail>),
    onSuccess: () => invalidateProducts(qc),
  });
}

/**
 * APPROVED -> ACTIVE | PUBLISHED. The only way a drop goes live: PATCH no
 * longer takes `status`. The server re-reads the LATEST review before
 * allowing it, re-checks the age gate, and needs an active price and (when
 * supply is declared) a minted unit.
 */
export function usePublishProduct(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PublishProductInput) =>
      api
        .post<unknown>(`admin/products/${productId}/publish`, payload)
        .then(unwrap<PublishProductResult>),
    onSuccess: () => {
      invalidateProducts(qc);
      qc.invalidateQueries({ queryKey: ["releases"] });
    },
  });
}

/** Soft archive — sets archivedAt, isActive false and status ARCHIVED. */
export function useArchiveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) =>
      api.delete<unknown>(`admin/products/${productId}`),
    onSuccess: () => invalidateProducts(qc),
  });
}

/* ------------------------------------------------------------------ */
/* Drop types — /admin/drop-types (drop-types-and-variants.md §5)      */
/*                                                                      */
/* Reading takes drop:read; every write takes drop-type:manage:global   */
/* (System Admin only) and returns the WHOLE updated type, so the cache */
/* is set from the response rather than refetched.                      */
/* ------------------------------------------------------------------ */

export function useDropTypes(includeInactive = false, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["drop-types", { includeInactive }],
    enabled,
    queryFn: () =>
      api
        .get<unknown>("admin/drop-types", includeInactive ? { includeInactive } : {})
        .then(unwrap<DropType[]>),
  });
}

/** One type, archived dimensions and values included, plus `dropCount`. */
export function useDropType(code: string | null | undefined, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["drop-type", code],
    enabled: !!code && enabled,
    queryFn: () =>
      api.get<unknown>(`admin/drop-types/${code}`).then(unwrap<DropType>),
  });
}

function useDropTypeWrite<V>(
  request: (vars: V) => Promise<unknown>
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(vars).then(unwrap<DropType>),
    onSuccess: (type) => {
      qc.setQueryData(["drop-type", type.code], (prev: DropType | undefined) =>
        // The list form carries no dropCount; keep the one already read.
        ({ ...type, dropCount: type.dropCount ?? prev?.dropCount })
      );
      qc.invalidateQueries({ queryKey: ["drop-types"] });
    },
  });
}

export function useCreateDropType() {
  return useDropTypeWrite((body: CreateDropTypeInput) => api.post<unknown>("admin/drop-types", body));
}

export function useUpdateDropType(code: string) {
  return useDropTypeWrite((body: UpdateDropTypeInput) =>
    api.patch<unknown>(`admin/drop-types/${code}`, body)
  );
}

export function useAddDimension(code: string) {
  return useDropTypeWrite((body: DropTypeDimensionInput) =>
    api.post<unknown>(`admin/drop-types/${code}/dimensions`, body)
  );
}

export function useUpdateDimension(code: string) {
  return useDropTypeWrite(({ dimension, body }: { dimension: string; body: UpdateDimensionInput }) =>
    api.patch<unknown>(`admin/drop-types/${code}/dimensions/${dimension}`, body)
  );
}

/** Archive (`archived: true`) or restore a dimension. */
export function useSetDimensionArchived(code: string) {
  return useDropTypeWrite(({ dimension, archived }: { dimension: string; archived: boolean }) =>
    archived
      ? api.delete<unknown>(`admin/drop-types/${code}/dimensions/${dimension}`)
      : api.post<unknown>(`admin/drop-types/${code}/dimensions/${dimension}/restore`, {})
  );
}

export function useAddDimensionValue(code: string) {
  return useDropTypeWrite(({ dimension, body }: { dimension: string; body: DropTypeValueInput }) =>
    api.post<unknown>(`admin/drop-types/${code}/dimensions/${dimension}/values`, body)
  );
}

export function useUpdateDimensionValue(code: string) {
  return useDropTypeWrite(
    ({ dimension, value, body }: { dimension: string; value: string; body: UpdateDimensionValueInput }) =>
      api.patch<unknown>(`admin/drop-types/${code}/dimensions/${dimension}/values/${value}`, body)
  );
}

export function useSetDimensionValueArchived(code: string) {
  return useDropTypeWrite(
    ({ dimension, value, archived }: { dimension: string; value: string; archived: boolean }) =>
      archived
        ? api.delete<unknown>(`admin/drop-types/${code}/dimensions/${dimension}/values/${value}`)
        : api.post<unknown>(
            `admin/drop-types/${code}/dimensions/${dimension}/values/${value}/restore`,
            {}
          )
  );
}

/* ------------------------------------------------------------------ */
/* Variants — /admin/products/:id/variants (§7)                        */
/*                                                                      */
/* Reading is org-scoped like the drop page; writing is a globalOnly    */
/* catalog write. Add/remove only while the drop is DRAFT or REJECTED;  */
/* label, supply and the active flag may change in any status.          */
/* ------------------------------------------------------------------ */

export function useProductVariants(
  productId: string | undefined,
  includeArchived = false,
  enabled = true
) {
  return useQuery({
    ...baseOptions,
    queryKey: ["product-variants", productId, { includeArchived }],
    enabled: !!productId && enabled,
    queryFn: () =>
      api
        .get<unknown>(
          `admin/products/${productId}/variants`,
          includeArchived ? { includeArchived } : {}
        )
        .then(unwrap<DropVariant[]>),
  });
}

function invalidateVariants(qc: ReturnType<typeof useQueryClient>, productId: string) {
  qc.invalidateQueries({ queryKey: ["product-variants", productId] });
  // Product reads embed variants[] and the type.
  qc.invalidateQueries({ queryKey: ["admin-product", productId] });
}

/** An explicit list — all or nothing; problems come back with their index. */
export function useCreateVariants(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variants: VariantInput[]) =>
      api
        .post<unknown>(`admin/products/${productId}/variants`, { variants })
        .then(unwrap<DropVariant[]>),
    onSuccess: () => invalidateVariants(qc, productId),
  });
}

/**
 * Every combination of the chosen values. `dryRun: true` writes nothing and
 * answers 200 with the same shape — preview first, then confirm.
 */
export function useGenerateVariants(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GenerateVariantsInput) =>
      api
        .post<unknown>(`admin/products/${productId}/variants/generate`, body)
        .then(unwrap<GenerateVariantsResult>),
    onSuccess: (result) => {
      if (!result.dryRun) invalidateVariants(qc, productId);
    },
  });
}

export function useUpdateVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, body }: { variantId: string; body: UpdateVariantInput }) =>
      api
        .patch<unknown>(`admin/products/${productId}/variants/${variantId}`, body)
        .then(unwrap<DropVariant>),
    onSuccess: () => invalidateVariants(qc, productId),
  });
}

/** Deleted outright when nothing points at it; archived otherwise. */
export function useRemoveVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) =>
      api
        .delete<unknown>(`admin/products/${productId}/variants/${variantId}`)
        .then(unwrap<RemoveVariantResult>),
    onSuccess: () => invalidateVariants(qc, productId),
  });
}

/* ------------------------------------------------------------------ */
/* Release approvals — the review workflow                             */
/* ------------------------------------------------------------------ */

export interface ReleaseFilters {
  status?: string;
  complianceStatus?: string;
  productId?: string;
  approverId?: string;
  /** true collapses to the newest version per product — the review queue. */
  latestOnly?: boolean;
  page?: number;
  limit?: number;
}

export function useReleases(params: ReleaseFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["releases", params],
    queryFn: () => api.get<Paginated<ReleaseApproval>>("admin/releases", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<ReleaseApproval>>("releases", "admin/releases", params, query.data);
  return query;
}

/**
 * The newest review of one drop — what publishing is gated on. Separate from
 * useReleases so it can be switched off for a caller without
 * release-approval:read, and so a drawer never shows another drop's review
 * as placeholder data.
 */
export function useLatestRelease(productId: string, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["releases", { productId, latestOnly: true, limit: 1 }],
    enabled,
    queryFn: () =>
      api
        .get<Paginated<ReleaseApproval>>("admin/releases", {
          productId,
          latestOnly: true,
          limit: 1,
        })
        .then((page) => page.items[0] ?? null),
  });
}

/** Detail adds the per-version history plus canDecide / blockedReason. */
export const releaseDetailOptions = (approvalId: string) => ({
  ...baseOptions,
  queryKey: ["release", approvalId] as const,
  queryFn: () =>
    api
      .get<unknown>(`admin/releases/${approvalId}`)
      .then(unwrap<ReleaseApprovalDetail>),
});

export function useRelease(approvalId: string | undefined) {
  return useQuery({
    ...releaseDetailOptions(approvalId ?? ""),
    enabled: !!approvalId,
  });
}

export function usePrefetchRelease() {
  const qc = useQueryClient();
  return React.useCallback(
    (approvalId: string) => void qc.prefetchQuery(releaseDetailOptions(approvalId)),
    [qc]
  );
}

function invalidateReleases(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["releases"] });
  qc.invalidateQueries({ queryKey: ["release"] });
  qc.invalidateQueries({ queryKey: ["release-approvals"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  // Submit and decide move Drop.status too, which the drop's own detail shows.
  qc.invalidateQueries({ queryKey: ["admin-product"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["activity"] });
}

/** Opens version N+1 and moves the drop to SUBMITTED, in one transaction. */
export function useSubmitRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { productId: string; comment?: string }) =>
      api.post<unknown>("admin/releases", payload).then(unwrap<ReleaseApproval>),
    onSuccess: () => invalidateReleases(qc),
  });
}

/** The reviewer's working notes. Refused once decidedAt is set. */
export function useAmendRelease(approvalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      comment?: string;
      complianceStatus?: ComplianceStatus;
      oddsDisclosureRef?: string | null;
    }) =>
      api
        .patch<unknown>(`admin/releases/${approvalId}`, payload)
        .then(unwrap<ReleaseApproval>),
    onSuccess: () => invalidateReleases(qc),
  });
}

/**
 * Approve or reject. One transaction, three writes — the approval row, the
 * product's complianceStatus and its status — because the three are one fact.
 *
 * Deciding twice needs release-approval:override:global; without it the
 * server answers 409 RELEASES_ALREADY_DECIDED, which the UI surfaces rather
 * than pre-empting, since only the server knows the caller's grants.
 */
export function useReleaseDecision(approvalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReleaseDecisionInput) =>
      api
        .post<unknown>(`admin/releases/${approvalId}/decision`, payload)
        .then(unwrap<ReleaseApprovalDetail>),
    onSuccess: (detail) => {
      qc.setQueryData(["release", approvalId], detail);
      invalidateReleases(qc);
    },
  });
}

/**
 * Send a decided review back to its owner as version N+1, PENDING.
 *
 * The administrator's answer to a rejection they disagree with, and to an
 * owner who rejected by mistake. It approves nothing: the same party is asked
 * again — the authority is carried forward, not re-derived — and they still
 * have to approve with the tickmark.
 *
 * A new version rather than clearing decidedAt, because the rejection is
 * evidence: "why was this bounced twice" has to stay answerable.
 */
export function useReopenRelease(approvalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReleaseReopenInput) =>
      api
        .post<unknown>(`admin/releases/${approvalId}/reopen`, payload)
        .then(unwrap<ReleaseApprovalDetail>),
    onSuccess: (detail) => {
      // The reopen returns the NEW row, so the old id's cache entry is stale
      // in a way setQueryData on it would hide. Seed the new one and refetch.
      qc.setQueryData(["release", detail.id], detail);
      invalidateReleases(qc);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Serialized units (sku-api.md)                                        */
/*                                                                      */
/* Reads need collectible-instance:read, resolved against the DROP's    */
/* organization — so a Brand Admin reaches their own edition through    */
/* /admin/products/:id/skus while the global /admin/skus refuses them.  */
/* ------------------------------------------------------------------ */

/**
 * The list envelope here is `{ data, meta }`, not the dashboard's
 * `{ page, limit, total, items }` and not the aggregates' bare `{ data }`.
 * Three envelopes in one API; this is the third. Do not run it through
 * `unwrap`, which would drop `meta` and take the paging with it.
 */
export const productSkusOptions = (productId: string, params: SkuListParams = {}) => ({
  ...baseOptions,
  queryKey: ["product-skus", productId, params] as const,
  queryFn: () => api.get<SkuListResponse>(`admin/products/${productId}/skus`, { ...params }),
});

export function useProductSkus(
  productId: string | undefined,
  params: SkuListParams = {},
  enabled = true
) {
  return useQuery({
    ...productSkusOptions(productId ?? "", params),
    enabled: !!productId && enabled,
    placeholderData: (prev) => prev,
  });
}

/**
 * The header counts. Read separately from the rows because it is one grouped
 * query — counting a paged list client-side would be both slower and wrong
 * past page one.
 */
export function useProductSkuSummary(productId: string | undefined, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["product-sku-summary", productId],
    enabled: !!productId && enabled,
    queryFn: () =>
      api
        .get<unknown>(`admin/products/${productId}/skus/summary`)
        .then(unwrap<SkuSummary>),
  });
}

/**
 * Mint units onto an existing edition. Serials continue from the highest
 * already minted.
 *
 * `tagIds` must be exactly `count` long or absent — a shorter list would
 * silently leave the tail of the batch untagged, and "silently" is not a
 * property you want in the table that proves authenticity. Sending it at all
 * additionally requires nfc-tag-claim:manage.
 */
export function useMintSkus(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MintSkusInput) =>
      api
        .post<unknown>(`admin/products/${productId}/skus`, payload)
        .then(unwrap<MintResult>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-skus", productId] });
      qc.invalidateQueries({ queryKey: ["product-sku-summary", productId] });
      // Per-variant mintedUnits move with the edition.
      qc.invalidateQueries({ queryKey: ["product-variants", productId] });
      // The drop's own performance counts move with the edition.
      qc.invalidateQueries({ queryKey: ["admin-product", productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/**
 * One unit. Prefer the `code` form from an operator's hands — the code is
 * printed on the item, the uuid is not written anywhere physical.
 */
export function useSkuUnit(skuId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["sku", skuId],
    enabled: !!skuId,
    queryFn: () => api.get<unknown>(`admin/skus/${skuId}`).then(unwrap<SkuUnitDetail>),
  });
}

export function useSkuUnitByCode(skuCode: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["sku-by-code", skuCode],
    enabled: !!skuCode,
    queryFn: () =>
      api
        .get<unknown>(`admin/skus/code/${encodeURIComponent(skuCode ?? "")}`)
        .then(unwrap<SkuUnitDetail>),
    retry: false,
  });
}

/**
 * Every unit across every drop. Carries no product in its path, so there is
 * no organization to check against and only a globally-scoped grant matches —
 * an org-scoped caller gets 403 here and reaches their units through
 * useProductSkus instead. Gate the call site on that rather than letting the
 * refusal be the discovery.
 */
export function useAllSkus(params: SkuListParams = {}, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["skus", params],
    enabled,
    queryFn: () => api.get<SkuListResponse>("admin/skus", { ...params }),
    placeholderData: (prev) => prev,
  });
}

/* ------------------------------------------------------------------ */
/* Market pricing — /admin/products/:id/prices                         */
/*                                                                      */
/* Read needs drop:read; every write needs drop:manage at GLOBAL.       */
/*                                                                      */
/* Unlike the gallery below, these responses are NOT documented as       */
/* returning the whole list, so nothing is written straight into the     */
/* cache — each mutation invalidates and the list is re-read. Guessing   */
/* the shape and calling setQueryData with it would put a wrong price     */
/* on screen, which is the one thing this table must never do.           */
/* ------------------------------------------------------------------ */

/** Base prices first, then variant prices, each by market code. */
export function useProductPrices(productId: string | undefined, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["product-prices", productId],
    enabled: !!productId && enabled,
    queryFn: () =>
      api.get<unknown>(`admin/products/${productId}/prices`).then(unwrap<ProductPrice[]>),
  });
}

/**
 * Replace the price list wholesale — **this is what the pricing table saves
 * to**. Markets present before and absent now are removed, and "these are the
 * prices now" is the only statement that can express dropping a market. The
 * minimum of one still applies, so this can never de-price a drop.
 */
export function useReplaceProductPrices(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prices: ProductPriceInput[]) =>
      api
        .put<unknown>(`admin/products/${productId}/prices`, { prices })
        .then(unwrap<ProductPrice[]>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-prices", productId] });
      // A market's usage counts include the prices pointing at it, and a
      // non-zero count is what refuses its archive.
      qc.invalidateQueries({ queryKey: ["admin-markets"] });
    },
  });
}

/*
 * PATCH /prices/:priceId and DELETE /prices/:priceId are deliberately not
 * wired. A pricing table is edited as a whole and the PUT above says "these
 * are the prices now" — which already expresses dropping a market, and is
 * what the API's own guidance asks a table to send instead of N patches.
 * Adding them would be a second way to write the same rows, racing the draft
 * the operator is holding on screen.
 */

/* ------------------------------------------------------------------ */
/* Product gallery — /admin/products/:id/images                        */
/*                                                                      */
/* Read needs drop:read; every write needs drop:manage at GLOBAL.       */
/* Each mutation returns the WHOLE gallery because positions and the    */
/* primary flag are normalised server-side on every write, so the       */
/* response is written straight into the cache rather than merged.      */
/* ------------------------------------------------------------------ */

export function useProductImages(productId: string | undefined, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["product-images", productId],
    enabled: !!productId && enabled,
    queryFn: () =>
      api
        .get<unknown>(`admin/products/${productId}/images`)
        .then(unwrap<ProductGallery>),
  });
}

/** Shared by every gallery mutation: the response IS the new gallery. */
function useGalleryMutation<TVars>(
  productId: string,
  run: (vars: TVars) => Promise<ProductGallery>
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (gallery) => {
      qc.setQueryData(["product-images", productId], gallery);
      // The product body carries `images` as a URL array, so it moves too.
      qc.invalidateQueries({ queryKey: ["admin-product", productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/** Append. A duplicate assetId is 409 PRODUCTS_IMAGE_DUPLICATE, not a move. */
export function useAttachProductImages(productId: string) {
  return useGalleryMutation(productId, (images: ProductImageInput[]) =>
    api
      .post<unknown>(`admin/products/${productId}/images`, { images })
      .then(unwrap<ProductGallery>)
  );
}

/**
 * Replace the gallery wholesale — **this is what a drag-and-drop reorder
 * calls**. After a reorder the client knows the final state, not the sequence
 * of moves that produced it, and an empty array (clear the gallery) cannot be
 * expressed by a merge at all.
 */
export function useReplaceProductImages(productId: string) {
  return useGalleryMutation(productId, (images: ProductImageInput[]) =>
    api
      .put<unknown>(`admin/products/${productId}/images`, { images })
      .then(unwrap<ProductGallery>)
  );
}

export function useUpdateProductImage(productId: string) {
  return useGalleryMutation(
    productId,
    ({
      imageId,
      ...patch
    }: { imageId: string } & Pick<
      ProductImageInput,
      "position" | "isPrimary" | "altText"
    >) =>
      api
        .patch<unknown>(`admin/products/${productId}/images/${imageId}`, patch)
        .then(unwrap<ProductGallery>)
  );
}

/**
 * Soft-removes the placement; the MediaAsset is never touched. If the removed
 * image was primary the next one is promoted automatically — which is another
 * reason to re-render from the response rather than splicing locally.
 */
export function useRemoveProductImage(productId: string) {
  return useGalleryMutation(productId, (imageId: string) =>
    api
      .delete<unknown>(`admin/products/${productId}/images/${imageId}`)
      .then(unwrap<ProductGallery>)
  );
}

/* ------------------------------------------------------------------ */
/* Media upload — presign, then PUT the bytes straight to S3           */
/* ------------------------------------------------------------------ */

export interface UploadUrlInput {
  assetType: AssetType;
  fileName: string;
  mimeType: string;
  ownerType: string;
  ownerId: string;
  /** REQUIRED. Bound into the signature as Content-Length; absent is a 422. */
  sizeBytes: number;
}

export function useRequestUploadUrl() {
  return useMutation({
    mutationFn: (payload: UploadUrlInput) =>
      api
        .post<unknown>("admin/media/upload-url", payload)
        .then(unwrap<UploadUrlResponse>),
  });
}

/**
 * The whole two-step upload, as one call site.
 *
 * Step 2 is a direct browser -> S3 `PUT`; the bytes never pass through the
 * API, so it goes out with `fetch` rather than the console's client, which
 * would proxy it and attach a Clerk token S3 has no use for.
 *
 * The `Content-Type` MUST match what was declared at presign time and the body
 * must be exactly `sizeBytes` long — both are bound into the signature, and
 * either mismatch is a `403 SignatureDoesNotMatch` from S3 rather than a
 * readable API error.
 */
export function useUploadAsset() {
  const qc = useQueryClient();
  const presign = useRequestUploadUrl();

  return useMutation({
    mutationFn: async ({
      file,
      assetType,
      ownerType,
      ownerId,
    }: {
      file: File;
      assetType: AssetType;
      ownerType: string;
      ownerId: string;
    }): Promise<UploadUrlResponse> => {
      const presigned = await presign.mutateAsync({
        assetType,
        fileName: file.name,
        mimeType: file.type,
        ownerType,
        ownerId,
        sizeBytes: file.size,
      });

      const res = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        throw new ApiError(
          res.status,
          "STORAGE_UPLOAD_FAILED",
          res.status === 403
            ? "S3 rejected the upload signature. The file changed size or type between presigning and sending."
            : `The storage service rejected the upload (${res.status}).`,
          null
        );
      }
      // Servable the moment the PUT returns — there is no scanner to wait for.
      return presigned;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

/* ------------------------------------------------------------------ */
/* NFC tag manifests — sku-api.md §3a                                   */
/* ------------------------------------------------------------------ */

/**
 * Bind tags to already-minted units from a vendor manifest.
 *
 * This is the NORMAL path for any real edition: units are minted when the drop
 * is planned, and the physical tags arrive weeks later in boxes with a CSV.
 * Passing 500 UIDs to the mint call would mean knowing all 500 before a single
 * unit exists.
 *
 * Capability is `nfc-tag-claim:manage`, deliberately NOT the minting one — a
 * Drop Manager mints the edition; whoever holds tag custody binds the tags.
 */
export function useBindTags(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BindTagsInput) =>
      api
        .post<unknown>(`admin/products/${productId}/skus/tags`, payload)
        .then(unwrap<BindTagsResult>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-skus", productId] });
      qc.invalidateQueries({ queryKey: ["product-sku-summary", productId] });
      qc.invalidateQueries({ queryKey: ["admin-product", productId] });
    },
  });
}

/** One unit, same rules — a chip failed, or an item was re-tagged after repair. */
export function useRetagUnit(skuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RetagUnitInput) =>
      api
        .patch<unknown>(`admin/skus/${skuId}/tag`, payload)
        .then(unwrap<SkuUnitDetail>),
    onSuccess: (unit) => {
      qc.setQueryData(["sku", skuId], unit);
      qc.invalidateQueries({ queryKey: ["product-skus"] });
      qc.invalidateQueries({ queryKey: ["product-sku-summary"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Finance — royalties, payouts, adjustments, the platform ledger      */
/*                                                                      */
/* Mounted at /api/v1/admin/finance. Reads take `payment-royalty:read`  */
/* and the SCOPE of that grant narrows the rows server-side — there is  */
/* no query parameter that widens it, and passing an `artistId` that    */
/* belongs to someone else returns an empty page rather than a 403,     */
/* because the filter is applied on top of the scope clause and never   */
/* in place of it.                                                      */
/*                                                                      */
/* Every write is `payment-royalty:manage:global`, mounted with the     */
/* guard's `globalOnly: true`, so an organization-scoped manage grant   */
/* is refused. Gate the call sites on Permissions.canManageFinance()    */
/* rather than letting the 403 be the discovery.                        */
/* ------------------------------------------------------------------ */

/**
 * Money moved, so everything that counts money is stale.
 *
 * Deliberately broad. A payout execution touches balances, entries, payouts
 * and the platform ledger; a processed refund additionally moves the order,
 * the transaction and the royalty that was reversed. Enumerating the exact
 * subset per mutation would be a second, driftable copy of the backend's
 * posting rules — and the cost of being wrong is an operator reading a stale
 * balance and paying twice.
 */
function invalidateMoney(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [
    "finance-balances",
    "royalty-entries",
    "royalty-entry",
    "payouts",
    "payout",
    "finance-ledger",
    "revenue-summary",
    "adjustments",
    "payment-transactions",
    "payment-transaction",
    "refunds",
    "refund",
    "disputes",
    "dispute",
    "dashboard",
    "activity",
  ]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

/* ---- Royalty rules ------------------------------------------------- */

export interface RoyaltyRuleFilters {
  organizationId?: string;
  artistId?: string;
  collectionId?: string;
  productId?: string;
  /** ISO instant — only rules in force at that moment. Defaults to all. */
  activeAt?: string;
  page?: number;
  limit?: number;
}

/**
 * Rule listing filters by the caller's ORGANIZATION ids, not by artist.
 *
 * Worth knowing rather than discovering: an artist sees rules carrying their
 * organization's id, and a rule scoped to the artist alone
 * (`organizationId: null`) is not listed — even though it is the rule pricing
 * their royalties. `useRoyaltyEntry` carries `basis` and `percentage` on the
 * row itself and is the reliable way for them to see the terms applied.
 */
export function useRoyaltyRules(params: RoyaltyRuleFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["royalty-rules", params],
    queryFn: () =>
      api.get<Paginated<RoyaltyRule>>("admin/finance/royalty-rules", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<RoyaltyRule>>(
    "royalty-rules",
    "admin/finance/royalty-rules",
    params,
    query.data
  );
  return query;
}

export function useRoyaltyRule(ruleId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["royalty-rule", ruleId],
    enabled: !!ruleId,
    queryFn: () =>
      api
        .get<unknown>(`admin/finance/royalty-rules/${ruleId}`)
        .then(unwrap<RoyaltyRule>),
  });
}

function invalidateRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["royalty-rules"] });
  qc.invalidateQueries({ queryKey: ["royalty-rule"] });
}

/**
 * Splits totalling more than 100% are refused with FINANCE_INVALID_RULE — the
 * cost of that typo is money paid out that the platform never took in, so the
 * form checks it too rather than waiting for the round trip.
 */
export function useCreateRoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RoyaltyRuleInput) =>
      api.post<unknown>("admin/finance/royalty-rules", payload).then(unwrap<RoyaltyRule>),
    onSuccess: () => invalidateRules(qc),
  });
}

/**
 * Closing is the ONLY edit a rule accepts — there is no PUT, PATCH or DELETE,
 * and that is the design. A rule that has priced an accrual cannot change its
 * terms retroactively without making every entry posted under it
 * unexplainable. A renegotiation is: close the old rule, create the successor.
 */
export function useCloseRoyaltyRule(ruleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CloseRuleInput) =>
      api
        .post<unknown>(`admin/finance/royalty-rules/${ruleId}/close`, payload)
        .then(unwrap<RoyaltyRule>),
    onSuccess: (rule) => {
      qc.setQueryData(["royalty-rule", ruleId], rule);
      invalidateRules(qc);
    },
  });
}

/* ---- Royalty ledger ------------------------------------------------ */

export interface RoyaltyEntryFilters {
  status?: string;
  entryType?: string;
  currency?: string;
  artistId?: string;
  organizationId?: string;
  orderId?: string;
  payoutId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useRoyaltyEntries(params: RoyaltyEntryFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["royalty-entries", params],
    queryFn: () =>
      api.get<Paginated<RoyaltyEntry>>("admin/finance/royalty-entries", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<RoyaltyEntry>>(
    "royalty-entries",
    "admin/finance/royalty-entries",
    params,
    query.data
  );
  return query;
}

/** One entry plus every adjustment posted against it — the traceability view. */
export const royaltyEntryOptions = (entryId: string) => ({
  ...baseOptions,
  queryKey: ["royalty-entry", entryId] as const,
  queryFn: () =>
    api
      .get<unknown>(`admin/finance/royalty-entries/${entryId}`)
      .then(unwrap<RoyaltyEntryDetail>),
});

export function useRoyaltyEntry(entryId: string | undefined) {
  return useQuery({
    ...royaltyEntryOptions(entryId ?? ""),
    enabled: !!entryId,
  });
}

export function usePrefetchRoyaltyEntry() {
  const qc = useQueryClient();
  return React.useCallback(
    (entryId: string) => void qc.prefetchQuery(royaltyEntryOptions(entryId)),
    [qc]
  );
}

/**
 * Reverses ONE entry, not the order's.
 *
 * So a mis-calculated split on a three-way deal can be fixed without
 * cancelling the other two payees' earnings. The route takes
 * `payment-royalty:manage:global` and the controller then requires
 * `payment-royalty:override:global` on top — see Permissions.canOverrideRoyalties.
 */
export function useReverseRoyaltyEntry(entryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReverseEntryInput) =>
      api
        .post<unknown>(`admin/finance/royalty-entries/${entryId}/reverse`, payload)
        .then(unwrap<RoyaltyEntry>),
    onSuccess: () => invalidateMoney(qc),
  });
}

/* ---- Balances ------------------------------------------------------ */

/**
 * What each payee has earned, is owed and has been paid, per currency — and
 * whether they have reached their payout threshold. No pagination: this is a
 * grouped aggregate, not a list.
 */
export function useRoyaltyBalances(currency?: string, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["finance-balances", currency ?? "all"],
    enabled,
    queryFn: () =>
      api
        .get<unknown>("admin/finance/balances", { currency })
        .then(unwrap<RoyaltyBalance[]>),
  });
}

/* ---- Payouts ------------------------------------------------------- */

export interface PayoutFilters {
  status?: string;
  artistId?: string;
  organizationId?: string;
  currency?: string;
  page?: number;
  limit?: number;
}

export function usePayouts(params: PayoutFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["payouts", params],
    queryFn: () => api.get<Paginated<Payout>>("admin/finance/payouts", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<Payout>>("payouts", "admin/finance/payouts", params, query.data);
  return query;
}

export const payoutOptions = (payoutId: string) => ({
  ...baseOptions,
  queryKey: ["payout", payoutId] as const,
  queryFn: () =>
    api.get<unknown>(`admin/finance/payouts/${payoutId}`).then(unwrap<Payout>),
});

export function usePayout(payoutId: string | undefined) {
  return useQuery({ ...payoutOptions(payoutId ?? ""), enabled: !!payoutId });
}

export function usePrefetchPayout() {
  const qc = useQueryClient();
  return React.useCallback(
    (payoutId: string) => void qc.prefetchQuery(payoutOptions(payoutId)),
    [qc]
  );
}

/**
 * The threshold sweep. With no body it runs every payee at their own rule's
 * threshold.
 *
 * `dryRun` writes nothing and returns the same shape, which is the only safe
 * way to answer "what would this pay out" — so the dialog previews first and
 * the operator commits the batch they actually saw. A dry run is NOT
 * invalidated into the cache, because nothing changed.
 */
export function useSchedulePayouts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SchedulePayoutsInput) =>
      api
        .post<unknown>("admin/finance/payouts/schedule", payload)
        .then(unwrap<SchedulePayoutsResult>),
    onSuccess: (_result, vars) => {
      if (!vars.dryRun) invalidateMoney(qc);
    },
  });
}

/**
 * Approve, execute and fail are three separate calls because they are three
 * separate acts with different actors and different failure modes.
 *
 * `fail` releases the entries back to ACCRUED so the next sweep picks them up
 * — a failed payout must not strand an artist's earnings in a state no job
 * looks at.
 */
function usePayoutAction<TVars>(
  payoutId: string,
  action: "approve" | "execute" | "fail"
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TVars) =>
      api
        .post<unknown>(`admin/finance/payouts/${payoutId}/${action}`, payload)
        .then(unwrap<Payout>),
    onSuccess: (payout) => {
      qc.setQueryData(["payout", payoutId], payout);
      invalidateMoney(qc);
    },
  });
}

export function useApprovePayout(payoutId: string) {
  return usePayoutAction<{ note?: string }>(payoutId, "approve");
}

export function useExecutePayout(payoutId: string) {
  return usePayoutAction<ExecutePayoutInput>(payoutId, "execute");
}

export function useFailPayout(payoutId: string) {
  return usePayoutAction<{ failureReason: string }>(payoutId, "fail");
}

/* ---- Adjustments --------------------------------------------------- */

export interface AdjustmentFilters {
  targetType?: string;
  targetId?: string;
  orderId?: string;
  reasonCode?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useAdjustments(params: AdjustmentFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["adjustments", params],
    queryFn: () =>
      api.get<Paginated<Adjustment>>("admin/finance/adjustments", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<Adjustment>>(
    "adjustments",
    "admin/finance/adjustments",
    params,
    query.data
  );
  return query;
}

/**
 * Writes the adjustment and a matching platform-ledger line, and does NOT
 * touch whatever it corrects. That is the immutability principle in one
 * endpoint: the original posting stays exactly as it was, and the correction
 * sits beside it with a name and a reason on it.
 */
export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdjustmentInput) =>
      api.post<unknown>("admin/finance/adjustments", payload).then(unwrap<Adjustment>),
    onSuccess: () => invalidateMoney(qc),
  });
}

/* ---- Platform ledger and revenue --------------------------------- */

export interface FinanceLedgerFilters {
  orderId?: string;
  category?: string;
  direction?: string;
  currency?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useFinanceLedger(params: FinanceLedgerFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["finance-ledger", params],
    queryFn: () => api.get<Paginated<FinanceEntry>>("admin/finance/ledger", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<FinanceEntry>>(
    "finance-ledger",
    "admin/finance/ledger",
    params,
    query.data
  );
  return query;
}

export interface RevenueSummaryFilters {
  organizationId?: string;
  currency?: string;
  from?: string;
  to?: string;
}

/**
 * ONE ROW PER CURRENCY, never summed across them — there is no FX rate in
 * this system, and a "total revenue" that adds dollars to rupees is worse
 * than no total. The screen renders one card per row and offers no grand
 * total, on purpose.
 */
export function useRevenueSummary(params: RevenueSummaryFilters = {}) {
  return useQuery({
    ...baseOptions,
    queryKey: ["revenue-summary", params],
    queryFn: () =>
      api
        .get<unknown>("admin/finance/revenue-summary", { ...params })
        .then(unwrap<RevenueSummaryRow[]>),
  });
}

/* ------------------------------------------------------------------ */
/* Payments — charges, refunds, disputes, gateways, webhook replay     */
/*                                                                      */
/* Mounted at /api/v1/admin/payments. Same read capability as finance;  */
/* the scope filter for OWN is `order.buyerId = caller`, so an artist    */
/* reaching these routes sees THEIR OWN PURCHASES as a customer, not    */
/* the sales of their drops. Disputes return nothing at all for them.   */
/* ------------------------------------------------------------------ */

export interface PaymentTransactionFilters {
  orderId?: string;
  status?: string;
  gateway?: string;
  needsReview?: string;
  currency?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function usePaymentTransactions(params: PaymentTransactionFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["payment-transactions", params],
    queryFn: () =>
      api.get<Paginated<PaymentTransaction>>("admin/payments/transactions", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<PaymentTransaction>>(
    "payment-transactions",
    "admin/payments/transactions",
    params,
    query.data
  );
  return query;
}

export const paymentTransactionOptions = (paymentId: string) => ({
  ...baseOptions,
  queryKey: ["payment-transaction", paymentId] as const,
  queryFn: () =>
    api
      .get<unknown>(`admin/payments/transactions/${paymentId}`)
      .then(unwrap<PaymentTransaction>),
});

export function usePaymentTransaction(paymentId: string | undefined) {
  return useQuery({
    ...paymentTransactionOptions(paymentId ?? ""),
    enabled: !!paymentId,
  });
}

export function usePrefetchPaymentTransaction() {
  const qc = useQueryClient();
  return React.useCallback(
    (paymentId: string) => void qc.prefetchQuery(paymentTransactionOptions(paymentId)),
    [qc]
  );
}

/**
 * Clears (or refuses) a NEEDS_REVIEW charge.
 *
 * The note is required by the DTO — a transaction stops rather than failing so
 * that clearing it is a decision with a name on it, and a decision with no
 * stated reason is not one anybody can audit later.
 */
export function useReviewPayment(paymentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReviewPaymentInput) =>
      api
        .post<unknown>(`admin/payments/transactions/${paymentId}/review`, payload)
        .then(unwrap<PaymentTransaction>),
    onSuccess: (payment) => {
      qc.setQueryData(["payment-transaction", paymentId], payment);
      invalidateMoney(qc);
    },
  });
}

/* ---- Refund workflow ----------------------------------------------- */

export interface RefundFilters {
  orderId?: string;
  status?: string;
  /** FAILED is the "buyer not paid back" queue. */
  gatewayStatus?: string;
  reasonCode?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useRefunds(params: RefundFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["refunds", params],
    queryFn: () => api.get<Paginated<Refund>>("admin/payments/refunds", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<Refund>>(
    "refunds",
    "admin/payments/refunds",
    params,
    query.data
  );
  return query;
}

/**
 * Every OPEN refund — requested, awaiting return, approved — in one list,
 * for the Returns board and for highlighting orders that have one. The API
 * filters by one status at a time, so the three are read together. Lives
 * under the "refunds" key, so every refund write refreshes it.
 */
export function useOpenRefunds(enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["refunds", "open"],
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const pages = await Promise.all(
        (["REQUESTED", "AWAITING_RETURN", "APPROVED"] as const).map((status) =>
          api.get<Paginated<Refund>>("admin/payments/refunds", { status, page: 1, limit: 100 })
        )
      );
      return {
        items: pages.flatMap((p) => p.items),
        /** True when a status has more than the 100 read here. */
        truncated: pages.some((p) => p.total > p.items.length),
      };
    },
  });
}

/** Several orders' details at once (cached per order), e.g. for refund cards. */
export function useOrdersByIds(orderIds: string[], enabled = true) {
  return useQueries({
    queries: orderIds.map((id) => ({ ...orderDetailOptions(id), enabled })),
  });
}

export const refundOptions = (refundId: string) => ({
  ...baseOptions,
  queryKey: ["refund", refundId] as const,
  queryFn: () =>
    api.get<unknown>(`admin/payments/refunds/${refundId}`).then(unwrap<Refund>),
});

export function useRefund(refundId: string | undefined) {
  return useQuery({ ...refundOptions(refundId ?? ""), enabled: !!refundId });
}

export function usePrefetchRefund() {
  const qc = useQueryClient();
  return React.useCallback(
    (refundId: string) => void qc.prefetchQuery(refundOptions(refundId)),
    [qc]
  );
}

/**
 * The four workflow steps, which are D4-35 steps 2, 3 and 4–6.
 *
 * All four are guarded by `order:refund:global`, and every handler
 * additionally calls `buildPaymentAccess`, which refuses a caller holding no
 * `payment-royalty` grant. Permissions.canWorkRefunds() checks both — see the
 * comment there for why checking only the first offers buttons that 403.
 *
 * The response is the refreshed refund with a new `allowedTransitions`, so it
 * is written straight into the cache and the drawer's buttons update without
 * a second fetch.
 */
function useRefundAction<TVars>(
  refundId: string,
  action: "confirm-return" | "approve" | "reject" | "process"
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TVars) =>
      api
        .post<unknown>(`admin/payments/refunds/${refundId}/${action}`, payload)
        .then(unwrap<Refund>),
    onSuccess: (refund) => {
      qc.setQueryData(["refund", refundId], refund);
      invalidateMoney(qc);
      // A processed refund moves the order itself, not just the money.
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-order"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/**
 * POST /refunds — start one. Anyone raising it FOR a buyer needs
 * order:refund:global; the order's `money.canRequestRefund` applies the same
 * rules, so a button shown as enabled is not refused for them.
 */
export function useRequestRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RequestRefundInput) =>
      api.post<unknown>("refunds", payload).then(unwrap<Refund>),
    onSuccess: (refund) => {
      qc.setQueryData(["refund", refund.id], refund);
      invalidateMoney(qc);
      qc.invalidateQueries({ queryKey: ["admin-order", refund.orderId] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
  });
}

export function useConfirmReturn(refundId: string) {
  return useRefundAction<ConfirmReturnInput>(refundId, "confirm-return");
}

export function useApproveRefund(refundId: string) {
  return useRefundAction<ApproveRefundInput>(refundId, "approve");
}

export function useRejectRefund(refundId: string) {
  return useRefundAction<{ rejectionReason: string }>(refundId, "reject");
}

/**
 * Steps 4–6 in one call: ownership revoked, tag quarantined, money sent, the
 * royalty reversed. Returns the refund with `claimRevokedAt` and
 * `resaleBlockedUntil` filled in.
 */
export function useProcessRefund(refundId: string) {
  return useRefundAction<ProcessRefundInput>(refundId, "process");
}

/* ---- Disputes ------------------------------------------------------ */

export interface DisputeFilters {
  orderId?: string;
  status?: string;
  /** ISO instant — cases whose evidence deadline falls before it. */
  dueBefore?: string;
  page?: number;
  limit?: number;
}

/** Ordered by soonest evidence deadline server-side: the queue is a countdown. */
export function useDisputes(params: DisputeFilters) {
  const query = useQuery({
    ...baseOptions,
    queryKey: ["disputes", params],
    queryFn: () => api.get<Paginated<Dispute>>("admin/payments/disputes", { ...params }),
    placeholderData: (prev) => prev,
  });
  useNextPageWarm<Paginated<Dispute>>(
    "disputes",
    "admin/payments/disputes",
    params,
    query.data
  );
  return query;
}

export const disputeOptions = (disputeId: string) => ({
  ...baseOptions,
  queryKey: ["dispute", disputeId] as const,
  queryFn: () =>
    api.get<unknown>(`admin/payments/disputes/${disputeId}`).then(unwrap<Dispute>),
});

export function useDispute(disputeId: string | undefined) {
  return useQuery({ ...disputeOptions(disputeId ?? ""), enabled: !!disputeId });
}

export function usePrefetchDispute() {
  const qc = useQueryClient();
  return React.useCallback(
    (disputeId: string) => void qc.prefetchQuery(disputeOptions(disputeId)),
    [qc]
  );
}

export function useOpenDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OpenDisputeInput) =>
      api.post<unknown>("admin/payments/disputes", payload).then(unwrap<Dispute>),
    onSuccess: () => invalidateMoney(qc),
  });
}

export function useSubmitEvidence(disputeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitEvidenceInput) =>
      api
        .post<unknown>(`admin/payments/disputes/${disputeId}/evidence`, payload)
        .then(unwrap<Dispute>),
    onSuccess: (dispute) => {
      qc.setQueryData(["dispute", disputeId], dispute);
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
  });
}

/**
 * LOST and ACCEPTED book the chargeback and its fee, mark the order refunded
 * and reverse the royalty — so resolving a dispute moves considerably more
 * than the case's own row. WON changes nothing but the status.
 */
export function useResolveDispute(disputeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ResolveDisputeInput) =>
      api
        .post<unknown>(`admin/payments/disputes/${disputeId}/resolve`, payload)
        .then(unwrap<Dispute>),
    onSuccess: (dispute) => {
      qc.setQueryData(["dispute", disputeId], dispute);
      invalidateMoney(qc);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/* ---- Gateway configuration ----------------------------------------- */

export interface GatewayConfigFilters {
  scope?: string;
  organizationId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * `payment-royalty:configure:global` — System Admin only, and the narrowest
 * capability in the catalog, because changing `credentialsRef` is
 * functionally changing the bank account the platform's money lands in.
 *
 * Note this is the only read in either module gated on `configure` rather
 * than `read`: holding `payment-royalty:read:global` is not enough to LIST
 * gateway configurations, so the tab is hidden without it.
 */
export function useGatewayConfigs(params: GatewayConfigFilters, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["gateway-configs", params],
    enabled,
    queryFn: () =>
      api.get<Paginated<GatewayConfig>>("admin/payments/gateway-configs", { ...params }),
    placeholderData: (prev) => prev,
  });
}

export function useCreateGatewayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GatewayConfigInput) =>
      api
        .post<unknown>("admin/payments/gateway-configs", payload)
        .then(unwrap<GatewayConfig>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateway-configs"] }),
  });
}

export function useUpdateGatewayConfig(configId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: GatewayConfigUpdate) =>
      api
        .patch<unknown>(`admin/payments/gateway-configs/${configId}`, payload)
        .then(unwrap<GatewayConfig>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gateway-configs"] }),
  });
}

/**
 * A `credentialsRef` that looks like an actual key is refused by the DTO with
 * a message saying where it belongs. Checked here too so the operator finds
 * out before the secret has been sent anywhere — including into this app's
 * own request log.
 */
export function looksLikeCredential(value: string): boolean {
  return /^(sk_|rk_|pk_live|whsec_)/.test(value.trim());
}

/* ---- Webhook replay queue ------------------------------------------ */

export interface WebhookEventFilters {
  provider?: string;
  eventType?: string;
  /** "true" narrows to deliveries that failed processing. */
  unprocessedOnly?: string;
  page?: number;
  limit?: number;
}

/**
 * `payment-royalty:manage:global` — this is the replay queue, not a read
 * screen, which is why it takes the write capability.
 *
 * The stored raw `payload` is not returned and there is no endpoint that
 * returns it: it is the provider's JSON, it can contain cardholder detail,
 * and this screen only needs to know what arrived and whether it processed.
 */
export function useWebhookEvents(params: WebhookEventFilters, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["webhook-events", params],
    enabled,
    queryFn: () =>
      api.get<Paginated<WebhookEvent>>("admin/payments/webhook-events", { ...params }),
    placeholderData: (prev) => prev,
  });
}

/* ------------------------------------------------------------------ */
/* Supply & inventory — @hitbox/supply                                  */
/*                                                                      */
/* Reads are organization-scoped; every WRITE is globalOnly. Supply      */
/* intake is a platform custody function: a brand does not take          */
/* delivery of the platform's chip stock, and an org-scoped grant here   */
/* would let one brand register chips against another's consignment.    */
/* ------------------------------------------------------------------ */

function invalidateSupply(qc: ReturnType<typeof useQueryClient>) {
  // Accepting/rejecting moves `booked` and `approved` on vendor allotments.
  qc.invalidateQueries({ queryKey: ["supply-vendor-drops"] });
  qc.invalidateQueries({ queryKey: ["supply-vendors"] });
  qc.invalidateQueries({ queryKey: ["supply-vendor"] });
  qc.invalidateQueries({ queryKey: ["supply-batches"] });
  qc.invalidateQueries({ queryKey: ["supply-batch"] });
  qc.invalidateQueries({ queryKey: ["supply-tags"] });
  qc.invalidateQueries({ queryKey: ["supply-tag"] });
  qc.invalidateQueries({ queryKey: ["supply-metrics"] });
  // The dashboard's own supply section reads the same tables.
  qc.invalidateQueries({ queryKey: ["supply"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["activity"] });
}

/* ---- Vendors: the directory is platform-level ---- */

export function useVendors(params: VendorFilters = {}) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-vendors", params],
    queryFn: () =>
      api.get<MetaPaginated<Vendor>>("admin/supply/vendors", { ...params }),
    placeholderData: (prev) => prev,
  });
}

export function useVendor(vendorId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-vendor", vendorId],
    enabled: !!vendorId,
    queryFn: () =>
      api.get<unknown>(`admin/supply/vendors/${vendorId}`).then(unwrap<Vendor>),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: VendorInput) =>
      api.post<unknown>("admin/supply/vendors", payload).then(unwrap<Vendor>),
    onSuccess: () => invalidateSupply(qc),
  });
}

/**
 * Every field optional, at least one required: a PATCH that changes nothing
 * is a mistake on the caller's side, not a no-op worth a 200.
 */
export function useUpdateVendor(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: VendorInput) =>
      api
        .patch<unknown>(`admin/supply/vendors/${vendorId}`, payload)
        .then(unwrap<Vendor>),
    onSuccess: () => invalidateSupply(qc),
  });
}

/* ---- Consignments ---- */

export function useSupplyBatches(params: SupplyBatchFilters = {}) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-batches", params],
    queryFn: () =>
      api.get<MetaPaginated<SupplyBatch>>("admin/supply/batches", { ...params }),
    placeholderData: (prev) => prev,
  });
}

/** One consignment, live — carries `lines` and the `allotment` coverage block. */
export function useSupplyBatch(batchId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-batch", batchId],
    enabled: !!batchId,
    queryFn: () =>
      api.get<unknown>(`admin/supply/batches/${batchId}`).then(unwrap<SupplyBatch>),
  });
}

export function useCreateSupplyBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SupplyBatchInput) =>
      api.post<unknown>("admin/supply/batches", payload).then(unwrap<SupplyBatch>),
    onSuccess: () => invalidateSupply(qc),
  });
}

/**
 * ACCEPTED and REJECTED are terminal. A consignment accepted in error is not
 * walked backwards — the stock is physically in the building by then, and
 * pretending otherwise loses the record that it ever arrived. The correction
 * is a second consignment with a note, which keeps both facts.
 */
export function useSupplyBatchDecision(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SupplyBatchDecisionInput) =>
      api
        .post<unknown>(`admin/supply/batches/${batchId}/decision`, payload)
        .then(unwrap<SupplyBatchDecisionResult>),
    onSuccess: (result) => {
      invalidateSupply(qc);
      // An ACCEPT mints units into the drop in the same transaction: its SKU
      // list, availability and per-variant minted counts all move.
      if (result.stock && result.stock.minted > 0) {
        invalidateSkus(qc);
        qc.invalidateQueries({ queryKey: ["admin-product"] });
        qc.invalidateQueries({ queryKey: ["product-variants"] });
        qc.invalidateQueries({ queryKey: ["products"] });
      }
    },
  });
}

/**
 * Register chips against a consignment.
 *
 * Rows go in BEFORE the acceptance decision, not after: the reviewer watches
 * them register and then decides with the registered rows in front of them.
 * Appending to an already-accepted consignment would silently change counts
 * somebody has signed off.
 *
 * A dry run returns the identical shape, so the screen previews a carton and
 * commits the same payload.
 */
export function useRegisterTagManifest(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TagManifestInput) =>
      api
        .post<unknown>(`admin/supply/batches/${batchId}/tags`, payload)
        .then(unwrap<TagManifestResult>),
    onSuccess: (result) => {
      // A dry run wrote nothing; invalidating would refetch for no reason and
      // make the preview look like it had taken effect.
      if (!result.dryRun) invalidateSupply(qc);
    },
  });
}

/* ---- Chip inventory ---- */

export function useSupplyTags(params: SupplyTagFilters = {}, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-tags", params],
    enabled,
    queryFn: () =>
      api.get<MetaPaginated<NfcTagRow>>("admin/supply/tags", { ...params }),
    placeholderData: (prev) => prev,
  });
}

export function useSupplyTag(tagId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-tag", tagId],
    enabled: !!tagId,
    queryFn: () =>
      api.get<unknown>(`admin/supply/tags/${tagId}`).then(unwrap<NfcTagRow>),
  });
}

/**
 * Record a QC verdict. This deliberately does NOT move the consignment's
 * counters: rowsAccepted/rowsRejected record what the manifest said on
 * intake, and rewriting them would change a figure an acceptance decision was
 * already taken against.
 */
export function useTagQc(tagId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TagQcInput) =>
      api
        .patch<unknown>(`admin/supply/tags/${tagId}/qc`, payload)
        .then(unwrap<NfcTagRow>),
    onSuccess: () => invalidateSupply(qc),
  });
}

/* ---- Vendor administration (vendor-admin-api.md) ---- */
/*                                                                      */
/* Every route here is nfc-tag-claim:manage at GLOBAL scope — even the   */
/* member LIST, because it exposes invitees' email addresses.            */

export function useVendorMembers(
  vendorId: string | undefined,
  status?: VendorMemberStatus
) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-vendor-members", vendorId, status ?? null],
    enabled: !!vendorId,
    queryFn: () =>
      api
        .get<unknown>(`admin/supply/vendors/${vendorId}/members`, { status })
        .then(unwrap<VendorMember[]>),
  });
}

/**
 * Invite someone to sign in for this vendor. An empty body invites the
 * vendor's contact person. Both 409s (here / another vendor) are checked
 * before anything is emailed.
 */
export function useInviteVendorMember(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: VendorMemberInviteInput) =>
      api
        .post<unknown>(`admin/supply/vendors/${vendorId}/members`, payload)
        .then(unwrap<VendorMemberInviteResult>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supply-vendor-members", vendorId] });
      // The pending invitation also lists on Team → Invitations.
      qc.invalidateQueries({ queryKey: ["authz", "invitations"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/**
 * Revoke a member, or withdraw a pending invite. Revoke vendor invites HERE
 * rather than from Team → Invitations, so the membership closes too.
 */
export function useRevokeVendorMember(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason: string }) =>
      api
        .post<unknown>(
          `admin/supply/vendors/${vendorId}/members/${memberId}/revoke`,
          { reason }
        )
        .then(unwrap<VendorMember>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supply-vendor-members", vendorId] });
      qc.invalidateQueries({ queryKey: ["authz", "invitations"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useVendorDropAssignments(vendorId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-vendor-drops", vendorId],
    enabled: !!vendorId,
    queryFn: () =>
      api
        .get<unknown>(`admin/supply/vendors/${vendorId}/drops`)
        .then(unwrap<VendorDropAssignment[]>),
  });
}

/**
 * Assign a drop WITH its allotment: `variants` for a drop with live variants
 * (required), an optional `quantity` cap for one without. Sending the wrong
 * shape is 400 SUPPLY_ALLOTMENT_SHAPE_INVALID.
 */
export function useAssignVendorDrop(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dropId, ...allotment }: VendorAllotmentInput & { dropId: string }) =>
      api
        .post<unknown>(`admin/supply/vendors/${vendorId}/drops`, { dropId, ...allotment })
        .then(unwrap<VendorDropAssignment>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supply-vendor-drops", vendorId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

function invalidateAllotments(qc: ReturnType<typeof useQueryClient>, vendorId: string) {
  qc.invalidateQueries({ queryKey: ["supply-vendor-drops", vendorId] });
  // Coverage on every consignment of this vendor moves with the allotment.
  qc.invalidateQueries({ queryKey: ["supply-batch"] });
  qc.invalidateQueries({ queryKey: ["activity"] });
}

/**
 * REPLACES the allotment — variants left out are removed. Refused with 409
 * SUPPLY_ALLOTMENT_BELOW_ACCEPTED if any variant would fall below what HitBox
 * has already accepted (a removed variant counts as 0).
 */
export function useUpdateVendorAllotment(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dropId, ...allotment }: VendorAllotmentInput & { dropId: string }) =>
      api
        .put<unknown>(`admin/supply/vendors/${vendorId}/drops/${dropId}/allotment`, allotment)
        .then(unwrap<VendorDropAssignment>),
    onSuccess: () => invalidateAllotments(qc, vendorId),
  });
}

/**
 * "Increase total supply": sets ONLY the variants sent (adding new ones) and
 * leaves every other variant's allotment alone. The body a consignment's
 * `allotment.suggestedPatch` carries goes here as-is.
 */
export function usePatchVendorAllotment(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dropId, ...allotment }: VendorAllotmentInput & { dropId: string }) =>
      api
        .patch<unknown>(`admin/supply/vendors/${vendorId}/drops/${dropId}/allotment`, allotment)
        .then(unwrap<VendorDropAssignment>),
    onSuccess: () => invalidateAllotments(qc, vendorId),
  });
}

/**
 * Consignments already booked against the drop are untouched — they describe
 * goods that shipped — but the vendor can no longer add manifests to them.
 */
export function useUnassignVendorDrop(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dropId: string) =>
      api.delete<unknown>(`admin/supply/vendors/${vendorId}/drops/${dropId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supply-vendor-drops", vendorId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/* ---- The vendor portal (vendor-portal-api.md) ---- */
/*                                                                      */
/* No vendor id in any URL or body: the vendor is always the signed-in   */
/* user's own, resolved from their ACTIVE membership on every request.   */

function invalidateVendorPortal(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["vendor-batches"] });
  qc.invalidateQueries({ queryKey: ["vendor-batch"] });
  // Booked / registered / remaining on each allotment move with every write.
  qc.invalidateQueries({ queryKey: ["vendor-drops"] });
}

export function useVendorMe(enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["vendor-me"],
    enabled,
    // Revoking closes the portal on the next request — re-check on return
    // to the tab rather than serving a stale membership.
    refetchOnWindowFocus: true,
    queryFn: () => api.get<unknown>("vendor/me").then(unwrap<VendorMe>),
  });
}

export function useMyVendorDrops(enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["vendor-drops"],
    enabled,
    queryFn: () =>
      api.get<unknown>("vendor/drops").then(unwrap<VendorDropAssignment[]>),
  });
}

export function useMyVendorBatches(params: VendorBatchFilters = {}, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["vendor-batches", params],
    enabled,
    queryFn: () =>
      api.get<MetaPaginated<SupplyBatch>>("vendor/batches", { ...params }),
    placeholderData: (prev) => prev,
  });
}

export function useMyVendorBatch(batchId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["vendor-batch", batchId],
    enabled: !!batchId,
    queryFn: () =>
      api.get<unknown>(`vendor/batches/${batchId}`).then(unwrap<SupplyBatch>),
  });
}

export function useCreateMyVendorBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: VendorBatchInput) =>
      api.post<unknown>("vendor/batches", payload).then(unwrap<SupplyBatch>),
    onSuccess: () => invalidateVendorPortal(qc),
  });
}

/** Same rules as the staff manifest route; the drop must still be assigned. */
export function useRegisterMyVendorManifest(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TagManifestInput) =>
      api
        .post<unknown>(`vendor/batches/${batchId}/tags`, payload)
        .then(unwrap<TagManifestResult>),
    onSuccess: (result) => {
      if (!result.dryRun) invalidateVendorPortal(qc);
    },
  });
}

/* ---- The rollup ---- */

export function useSupplyMetrics(params: SupplyMetricsParams = {}) {
  return useQuery({
    ...baseOptions,
    queryKey: ["supply-metrics", params],
    queryFn: () =>
      api
        .get<unknown>("admin/supply/metrics", { ...params })
        .then(unwrap<SupplyMetrics>),
    placeholderData: (prev) => prev,
  });
}

/* ------------------------------------------------------------------ */
/* Drop inventory — editing SKU records                                 */
/* ------------------------------------------------------------------ */

function invalidateSkus(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["skus"] });
  qc.invalidateQueries({ queryKey: ["product-skus"] });
  qc.invalidateQueries({ queryKey: ["product-sku-summary"] });
  qc.invalidateQueries({ queryKey: ["sku"] });
  qc.invalidateQueries({ queryKey: ["sku-by-code"] });
  qc.invalidateQueries({ queryKey: ["supply-tags"] });
  qc.invalidateQueries({ queryKey: ["supply-metrics"] });
  qc.invalidateQueries({ queryKey: ["activity"] });
}

/** The cross-drop unit list. Global grants only — see useAllSkus above. */
export function useInventory(params: SkuFilters = {}, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["skus", params],
    enabled,
    queryFn: () => api.get<SkuListResponse>("admin/skus", { ...params }),
    placeholderData: (prev) => prev,
  });
}

/**
 * Edit one unit. A body that changes nothing is a 200 with the unit
 * unchanged, not an error — the endpoint is safe to retry, which matters
 * because the batch form is a transaction a client may well have to resend.
 */
export function useUpdateSku(skuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SkuUpdateInput) =>
      api.patch<unknown>(`admin/skus/${skuId}`, payload).then(unwrap<SkuUnitDetail>),
    onSuccess: () => invalidateSkus(qc),
  });
}

/**
 * One set of changes, applied to every selected unit, in ONE transaction.
 *
 * All or nothing: if one selected unit refuses the change, nothing is written
 * and the response names every refusal at once. Partial application is the
 * state to avoid, not the error — an operator told "312 of your 400 units
 * took the change" has a reconciliation problem only the warehouse can
 * answer.
 *
 * `productId` picks the route rather than only filling the body: a router
 * with no product in its path has no organization to check a grant against,
 * so the flat /admin/skus/batch admits GLOBAL grants only. An
 * organization-scoped caller reaches batch editing through the nested form
 * and is confined to that drop by the same context check.
 */
export function useBatchUpdateSkus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...payload }: SkuBatchInput) =>
      api
        .patch<unknown>(
          productId
            ? `admin/products/${productId}/skus/batch`
            : "admin/skus/batch",
          payload
        )
        .then(unwrap<SkuBatchResult>),
    onSuccess: (result) => {
      if (!result.dryRun) invalidateSkus(qc);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Artist self-service profile — /artist/me (artist-profile-api.md)    */
/*                                                                      */
/* brand-artist-record:read / :update at OWN scope, matched against the */
/* caller's own user id. Every write returns the whole profile, which   */
/* is written straight into the cache.                                  */
/* ------------------------------------------------------------------ */

const ARTIST_ME_KEY = ["artist-me"] as const;

export function useMyArtistProfile(enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ARTIST_ME_KEY,
    enabled,
    queryFn: () => api.get<unknown>("artist/me").then(unwrap<ArtistProfile>),
  });
}

/** The list lives in code server-side and never changes mid-session. */
export function useArtistGenres(enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["artist-genres"],
    enabled,
    staleTime: Infinity,
    queryFn: () => api.get<unknown>("artist/genres").then(unwrap<ArtistGenre[]>),
  });
}

function useArtistProfileWrite<V>(request: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(vars).then(unwrap<ArtistProfile>),
    onSuccess: (profile) => qc.setQueryData(ARTIST_ME_KEY, profile),
  });
}

export function useUpdateMyArtistProfile() {
  return useArtistProfileWrite((body: ArtistProfileUpdate) => api.patch<unknown>("artist/me", body));
}

/**
 * Avatar or cover, all three steps as one call:
 *   1. POST /artist/me/{kind}/upload-url  — presign, bound to type and size
 *   2. PUT  <uploadUrl>                   — the bytes, straight to S3
 *   3. PUT  /artist/me/{kind} { assetId } — only after S3 answered 200,
 *      because the API cannot see inside S3 and would point the profile at a
 *      missing image otherwise.
 * A 403 from S3 is usually a lapsed URL (5 minutes), so step 1 is retried
 * once with a fresh one before giving up.
 */
export function useUploadArtistImage(kind: ArtistImageKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const presign = () =>
        api
          .post<unknown>(`artist/me/${kind}/upload-url`, {
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          })
          .then(unwrap<ArtistImageUploadUrl>);
      const put = (url: string) =>
        fetch(url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

      let presigned = await presign();
      let res = await put(presigned.uploadUrl);
      if (res.status === 403) {
        presigned = await presign();
        res = await put(presigned.uploadUrl);
      }
      if (!res.ok) {
        throw new ApiError(
          res.status,
          "STORAGE_UPLOAD_FAILED",
          res.status === 403
            ? "S3 rejected the upload signature — the file changed size or type, or the link expired."
            : `The storage service rejected the upload (${res.status}).`,
          null
        );
      }
      return api
        .put<unknown>(`artist/me/${kind}`, { assetId: presigned.assetId })
        .then(unwrap<ArtistProfile>);
    },
    onSuccess: (profile) => qc.setQueryData(ARTIST_ME_KEY, profile),
  });
}

/** Clears the image on the profile; the stored file is kept for history. */
export function useRemoveArtistImage(kind: ArtistImageKind) {
  return useArtistProfileWrite(() => api.delete<unknown>(`artist/me/${kind}`));
}

/* ------------------------------------------------------------------ */
/* Packing — scan-to-assign (order-unit-assignment-api.md)             */
/*                                                                      */
/* Reads take order:read, scans take order:manage. Every scan answers   */
/* with the order's packing state; the order itself (status, allowed    */
/* transitions) and the unit lists move with it, so those are re-read.  */
/* ------------------------------------------------------------------ */

/**
 * Units a scan would accept for this order (order:read) — the picker's
 * source. Only units the server would take, so no client-side filtering.
 */
export function useOrderUnitCandidates(
  orderId: string | undefined,
  params: { search?: string; page?: number; limit?: number },
  enabled = true
) {
  return useQuery({
    ...baseOptions,
    queryKey: ["order-unit-candidates", orderId, params],
    enabled: enabled && Boolean(orderId),
    placeholderData: (prev) => prev,
    queryFn: () =>
      api.get<Paginated<UnitCandidate>>(`admin/orders/${orderId}/unit/candidates`, { ...params }),
  });
}

/** Live by design: re-read every 30 s and whenever the station regains focus. */
export function useFulfilmentQueue(params: FulfilmentQueueParams, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["fulfilment-queue", params],
    enabled,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () =>
      api.get<Paginated<OrderPackingState>>("admin/orders/fulfilment-queue", { ...params }),
    placeholderData: (prev) => prev,
  });
}

export function useOrderUnit(orderId: string | undefined, enabled = true) {
  return useQuery({
    ...baseOptions,
    // Another packer may scan this order from another station.
    refetchOnWindowFocus: true,
    queryKey: ["order-unit", orderId],
    enabled: !!orderId && enabled,
    queryFn: () =>
      api.get<unknown>(`admin/orders/${orderId}/unit`).then(unwrap<OrderPackingState>),
  });
}

function afterScan(qc: ReturnType<typeof useQueryClient>, state: OrderPackingState) {
  qc.setQueryData(["order-unit", state.orderId], state);
  qc.invalidateQueries({ queryKey: ["admin-order", state.orderId] });
  qc.invalidateQueries({ queryKey: ["admin-orders"] });
  qc.invalidateQueries({ queryKey: ["orders"] });
  qc.invalidateQueries({ queryKey: ["fulfilment-queue"] });
  // The placeholder went back into stock and the scanned unit left it.
  qc.invalidateQueries({ queryKey: ["product-skus", state.productId] });
  qc.invalidateQueries({ queryKey: ["skus"] });
  qc.invalidateQueries({ queryKey: ["order-unit-candidates"] });
}

/** Scan a unit FOR this order. A double scan of the same unit is a 200 no-op. */
export function useAssignOrderUnit(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignOrderUnitInput) =>
      api
        .post<unknown>(`admin/orders/${orderId}/unit`, body)
        .then(unwrap<OrderPackingState>),
    onSuccess: (state) => afterScan(qc, state),
  });
}

/** Scan first: the server assigns it to the oldest order waiting for that variant. */
export function useAssignByScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignByScanInput) =>
      api.post<unknown>("admin/orders/assign-by-scan", body).then(unwrap<OrderPackingState>),
    onSuccess: (state) => afterScan(qc, state),
  });
}

/* ------------------------------------------------------------------ */
/* Shipments — order-history-and-shipments.md                          */
/*                                                                      */
/* Recording a shipment is the ONLY way an order becomes SHIPPED        */
/* (PATCH status SHIPPED is ORDERS_SHIPMENT_REQUIRED). Both writes      */
/* answer with the refreshed order detail, written into the cache.      */
/* ------------------------------------------------------------------ */

function afterShipment(qc: ReturnType<typeof useQueryClient>, orderId: string, detail: AdminOrderDetail) {
  qc.setQueryData(["admin-order", orderId], detail);
  qc.invalidateQueries({ queryKey: ["admin-orders"] });
  qc.invalidateQueries({ queryKey: ["orders"] });
  qc.invalidateQueries({ queryKey: ["order-unit", orderId] });
  qc.invalidateQueries({ queryKey: ["fulfilment-queue"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

export function useRecordShipment(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordShipmentInput) =>
      api.post<unknown>(`admin/orders/${orderId}/shipment`, body).then(unwrap<AdminOrderDetail>),
    onSuccess: (detail) => afterShipment(qc, orderId, detail),
  });
}

/** Voids the current shipment and records a new one; needs a reason. */
export function useCorrectShipment(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CorrectShipmentInput) =>
      api.put<unknown>(`admin/orders/${orderId}/shipment`, body).then(unwrap<AdminOrderDetail>),
    onSuccess: (detail) => afterShipment(qc, orderId, detail),
  });
}

/* ------------------------------------------------------------------ */
/* Artist collections — the artist's own (artist-collection-api.md)    */
/*                                                                      */
/* /artist/collections is always the signed-in artist — no artist id   */
/* in any path. Every write returns the collection; the detail cache    */
/* keeps its drops (only route 3 lists them) and the lists are re-read. */
/* ------------------------------------------------------------------ */

export type CollectionListStatus = "live" | "archived" | "all";

export function useMyCollections(status: CollectionListStatus = "live", enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["artist-collections", status],
    enabled,
    queryFn: () =>
      api.get<unknown>("artist/collections", { status }).then(unwrap<ArtistCollection[]>),
  });
}

export function useMyCollection(collectionId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["artist-collection", collectionId],
    enabled: Boolean(collectionId),
    queryFn: () =>
      api
        .get<unknown>(`artist/collections/${collectionId}`)
        .then(unwrap<ArtistCollectionDetail>),
  });
}

function useCollectionWrite<V>(request: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(vars).then(unwrap<ArtistCollection>),
    onSuccess: (c) => {
      qc.setQueryData<ArtistCollectionDetail>(["artist-collection", c.id], (prev) =>
        prev ? { ...prev, ...c } : prev
      );
      qc.invalidateQueries({ queryKey: ["artist-collections"] });
    },
  });
}

export function useCreateCollection() {
  return useCollectionWrite((body: CreateArtistCollectionInput) =>
    api.post<unknown>("artist/collections", body)
  );
}

export function useUpdateCollection(collectionId: string) {
  return useCollectionWrite((body: UpdateArtistCollectionInput) =>
    api.patch<unknown>(`artist/collections/${collectionId}`, body)
  );
}

export function useArchiveCollection() {
  return useCollectionWrite((collectionId: string) =>
    api.delete<unknown>(`artist/collections/${collectionId}`)
  );
}

/** `name` only when the old one was taken since (ARTIST_COLLECTION_NAME_TAKEN). */
export function useRestoreCollection() {
  return useCollectionWrite(({ collectionId, name }: { collectionId: string; name?: string }) =>
    api.post<unknown>(`artist/collections/${collectionId}/restore`, name ? { name } : {})
  );
}

/** The whole live list in its new order; the response replaces the list. */
export function useReorderCollections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (collectionIds: string[]) =>
      api
        .put<unknown>("artist/collections/order", { collectionIds })
        .then(unwrap<ArtistCollection[]>),
    onSuccess: (list) => qc.setQueryData(["artist-collections", "live"], list),
  });
}

/** Presign → S3 PUT (retried once on a lapsed URL) → attach. Same as the profile images. */
export function useUploadCollectionHero(collectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const presign = () =>
        api
          .post<unknown>(`artist/collections/${collectionId}/hero/upload-url`, {
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          })
          .then(unwrap<ArtistCollectionHeroUploadUrl>);
      const put = (url: string) =>
        fetch(url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

      let presigned = await presign();
      let res = await put(presigned.uploadUrl);
      if (res.status === 403) {
        presigned = await presign();
        res = await put(presigned.uploadUrl);
      }
      if (!res.ok) {
        throw new ApiError(
          res.status,
          "STORAGE_UPLOAD_FAILED",
          res.status === 403
            ? "S3 rejected the upload signature — the file changed size or type, or the link expired."
            : `The storage service rejected the upload (${res.status}).`,
          null
        );
      }
      return api
        .put<unknown>(`artist/collections/${collectionId}/hero`, { assetId: presigned.assetId })
        .then(unwrap<ArtistCollection>);
    },
    onSuccess: (c) => {
      qc.setQueryData<ArtistCollectionDetail>(["artist-collection", c.id], (prev) =>
        prev ? { ...prev, ...c } : prev
      );
      qc.invalidateQueries({ queryKey: ["artist-collections"] });
    },
  });
}

export function useRemoveCollectionHero(collectionId: string) {
  return useCollectionWrite(() => api.delete<unknown>(`artist/collections/${collectionId}/hero`));
}

/**
 * Route 10: my on-sale drops not already in this collection. With
 * `includeFiled`, also drops in my other collections (`currentCollection`).
 */
export function useAvailableCollectionDrops(
  collectionId: string,
  params: AvailableDropsParams,
  enabled = true
) {
  return useQuery({
    ...baseOptions,
    queryKey: ["artist-collection-available", collectionId, params],
    enabled,
    placeholderData: (prev) => prev,
    queryFn: () =>
      api.get<Paginated<AvailableCollectionDrop>>(
        `artist/collections/${collectionId}/available-drops`,
        { ...params, includeFiled: params.includeFiled ? "true" : undefined }
      ),
  });
}

/**
 * Routes 11 and 12 answer with the whole collection detail; it replaces the
 * cache. Any collection a drop moved out of is re-read, and so are the lists
 * (their counts moved) and the picker.
 */
function useCollectionDropsWrite<V>(collectionId: string, request: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(vars).then(unwrap<CollectionDropsResult>),
    onSuccess: (r) => {
      qc.setQueryData(["artist-collection", collectionId], r.collection);
      new Set(Object.values(r.movedFrom ?? {})).forEach((id) =>
        qc.invalidateQueries({ queryKey: ["artist-collection", id] })
      );
      qc.invalidateQueries({ queryKey: ["artist-collections"] });
      qc.invalidateQueries({ queryKey: ["artist-collection-available"] });
    },
  });
}

export function useAddCollectionDrops(collectionId: string) {
  return useCollectionDropsWrite(collectionId, (body: AddCollectionDropsInput) =>
    api.post<unknown>(`artist/collections/${collectionId}/drops`, body)
  );
}

/** The drop stays on sale; it just leaves this collection. */
export function useRemoveCollectionDrop(collectionId: string) {
  return useCollectionDropsWrite(collectionId, (dropId: string) =>
    api.delete<unknown>(`artist/collections/${collectionId}/drops/${dropId}`)
  );
}

/* ------------------------------------------------------------------ */
/* Artist collections — monitoring (admin-monitoring-api.md)           */
/*                                                                      */
/* brand-artist-record:read at GLOBAL scope only. Read-only.            */
/* ------------------------------------------------------------------ */

export function useAdminCollections(params: AdminArtistCollectionFilters, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-artist-collections", params],
    enabled,
    queryFn: () =>
      api.get<Paginated<AdminArtistCollection>>("admin/artist-collections", { ...params }),
    placeholderData: (prev) => prev,
  });
}

export function useAdminCollectionSummary() {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-artist-collections-summary"],
    queryFn: () =>
      api
        .get<unknown>("admin/artist-collections/summary")
        .then(unwrap<AdminArtistCollectionSummary>),
  });
}

export function useAdminCollection(collectionId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-artist-collection", collectionId],
    enabled: Boolean(collectionId),
    queryFn: () =>
      api
        .get<unknown>(`admin/artist-collections/${collectionId}`)
        .then(unwrap<AdminArtistCollectionDetail>),
  });
}

/**
 * GET /admin/audit/events — the raw trail, cursor-paged (no total by design).
 * Needs audit-log:read; callers gate `enabled` on it.
 */
export function useAuditTrail(query: AuditTrailQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["audit-trail", query],
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<AuditTrailPage>("admin/audit/events", { limit: 50, ...query, cursor: pageParam }),
    getNextPageParam: (last) => (last.meta?.hasMore ? last.meta.nextCursor ?? undefined : undefined),
  });
}

/** One request's events, in the order they happened. */
export function useAuditCorrelation(correlationId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["audit-correlation", correlationId],
    enabled: Boolean(correlationId),
    queryFn: () =>
      api
        .get<unknown>(`admin/audit/events/correlation/${correlationId}`)
        .then(unwrap<AuditTrailEvent[]>),
  });
}

/** The event catalog as the table holds it. Changes only on a seed run. */
export function useAuditEventTypes(includeInactive = false, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["audit-event-types", includeInactive],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () =>
      api
        .get<unknown>("admin/audit/event-types", { includeInactive: includeInactive ? "true" : undefined })
        .then(unwrap<AuditEventTypeRow[]>),
  });
}

/**
 * Retention per severity. `withCounts` adds what the next sweep would remove
 * — a COUNT over the largest table, so only on request.
 */
export function useAuditRetention(withCounts = false, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["audit-retention", withCounts],
    enabled,
    queryFn: () =>
      api
        .get<unknown>("admin/audit/retention", { withCounts: withCounts ? "true" : undefined })
        .then(unwrap<AuditRetentionPolicy[]>),
  });
}

/** audit-log:manage. Recorded CRITICAL server-side, with both snapshots. */
export function useUpdateRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ severity, ...body }: UpdateRetentionInput & { severity: AuditSeverity }) =>
      api
        .patch<unknown>(`admin/audit/retention/${severity}`, body)
        .then(unwrap<AuditRetentionPolicy>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-retention"] });
      qc.invalidateQueries({ queryKey: ["audit-trail"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Artists directory — /admin/artists (drop:read)                      */
/*                                                                      */
/* `{ data, meta }` on the wire; reshaped to Paginated for the table.   */
/* ------------------------------------------------------------------ */

type DataMeta<T> = { data: T[]; meta: { page: number; limit: number; total: number } };

export function useArtistDirectory(params: AdminArtistFilters, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["artist-directory", params],
    enabled,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<Paginated<AdminArtist>> => {
      const r = await api.get<DataMeta<AdminArtist>>("admin/artists", { ...params });
      return { page: r.meta.page, limit: r.meta.limit, total: r.meta.total, items: r.data };
    },
  });
}

/** Just the total for a filter — one row fetched, `meta.total` read. */
export function useArtistCount(params: AdminArtistFilters, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: ["artist-directory-count", params],
    enabled,
    queryFn: () =>
      api
        .get<DataMeta<AdminArtist>>("admin/artists", { ...params, limit: 1 })
        .then((r) => r.meta.total),
  });
}

export function useAdminArtist(artistId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-artist", artistId],
    enabled: Boolean(artistId),
    queryFn: () => api.get<unknown>(`admin/artists/${artistId}`).then(unwrap<AdminArtist>),
  });
}

/**
 * One artist's drops, every status (drafts and drops in review included) —
 * the admin drop list filtered by artist (artist-admin-api.md §9).
 */
export function useArtistDrops(
  artistId: string | undefined,
  opts: { page?: number; limit?: number; status?: string; q?: string } = {},
  enabled = true
) {
  const { page = 1, limit = 20, status, q } = opts;
  return useQuery({
    ...baseOptions,
    queryKey: ["artist-drops", artistId, page, limit, status, q],
    enabled: enabled && Boolean(artistId),
    placeholderData: (prev) => prev,
    queryFn: () =>
      api.get<Paginated<ProductRow>>("admin/dashboard/products", { artistId, page, limit, status, q }),
  });
}

/* Staff side — brand-artist-record at GLOBAL scope (artist-admin-api.md). */

const artistProfileKey = (id: string | undefined) => ["admin-artist-profile", id] as const;

export function useArtistDirectorySummary(enabled = true, top = 5) {
  return useQuery({
    ...baseOptions,
    queryKey: ["artist-directory-summary", top],
    enabled,
    queryFn: () =>
      api.get<unknown>("admin/artists/summary", { top }).then(unwrap<ArtistDirectorySummary>),
  });
}

export function useArtistStaffProfile(artistId: string | undefined, enabled = true) {
  return useQuery({
    ...baseOptions,
    queryKey: artistProfileKey(artistId),
    enabled: enabled && Boolean(artistId),
    queryFn: () =>
      api.get<unknown>(`admin/artists/${artistId}/profile`).then(unwrap<ArtistStaffProfile>),
  });
}

export function useArtistStats(
  artistId: string | undefined,
  params: { period: ArtistStatsPeriod; from?: string; to?: string; topDrops?: number },
  enabled = true
) {
  return useQuery({
    ...baseOptions,
    queryKey: ["admin-artist-stats", artistId, params],
    enabled: enabled && Boolean(artistId) && (params.period !== "custom" || Boolean(params.from && params.to)),
    placeholderData: (prev) => prev,
    queryFn: () =>
      api.get<unknown>(`admin/artists/${artistId}/stats`, { ...params }).then(unwrap<ArtistStats>),
  });
}

/** Every staff write answers with the full profile — it replaces the cache. */
function useArtistStaffWrite<V>(artistId: string, request: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(vars).then(unwrap<ArtistStaffProfile>),
    onSuccess: (profile) => {
      qc.setQueryData(artistProfileKey(artistId), profile);
      qc.invalidateQueries({ queryKey: ["admin-artist", artistId] });
      qc.invalidateQueries({ queryKey: ["artist-directory"] });
      qc.invalidateQueries({ queryKey: ["artist-directory-summary"] });
      qc.invalidateQueries({ queryKey: ["admin-artists"] });
      qc.invalidateQueries({ queryKey: ["audit-trail"] });
    },
    onError: (err) => {
      // Someone else changed it — show the current record.
      if (err instanceof ApiError && err.code === "ARTIST_CHANGED") {
        qc.invalidateQueries({ queryKey: artistProfileKey(artistId) });
      }
    },
  });
}

export function useUpdateArtistStaff(artistId: string) {
  return useArtistStaffWrite(artistId, (body: ArtistStaffUpdate) =>
    api.patch<unknown>(`admin/artists/${artistId}`, body)
  );
}

export function useArtistStateAction(artistId: string) {
  return useArtistStaffWrite(artistId, ({ action, reason }: { action: ArtistStateAction; reason?: string }) =>
    api.post<unknown>(`admin/artists/${artistId}/${action}`, reason ? { reason } : {})
  );
}
