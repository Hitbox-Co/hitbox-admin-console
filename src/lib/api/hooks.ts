"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { ApiError, api, unwrap, type QueryValue } from "./client";
import type {
  ActivityEvent,
  ActivityEventRaw,
  AdminMarket,
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
  MarketRow,
  MediaAssetUrl,
  MediaListResponse,
  OrderRow,
  OrderStatusInput,
  Paginated,
  PermissionGroup,
  Period,
  ProductInput,
  ProductRow,
  ProvenanceListResponse,
  ReleaseApproval,
  ReleaseApprovalDetail,
  ReleaseApprovalRow,
  ReleaseDecisionInput,
  ResaleListResponse,
  Role,
  RoleAssignment,
  ScopeType,
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

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProductInput) =>
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
