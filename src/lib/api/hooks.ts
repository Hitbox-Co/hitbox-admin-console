"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { ApiError, api, unwrap } from "./client";
import type {
  ActivityEvent,
  AdminUserRow,
  AuthzMe,
  DashboardResponse,
  DemandSignalRow,
  FinanceSection,
  MarketRow,
  MediaListResponse,
  OrderRow,
  Paginated,
  PermissionGroup,
  Period,
  ProductRow,
  ProvenanceListResponse,
  ReleaseApprovalRow,
  ResaleListResponse,
  Role,
  RoleAssignment,
  SupplyListResponse,
  UsersSection,
} from "../types";

/** Never retry a deliberate authorization refusal — the answer will not change. */
const TERMINAL = new Set([401, 403, 404, 409, 422, 503]);

function retry(count: number, err: unknown): boolean {
  if (err instanceof ApiError && TERMINAL.has(err.status)) return false;
  return count < 2;
}

const baseOptions = {
  retry,
  staleTime: 30_000,
  refetchOnWindowFocus: false,
} satisfies Partial<UseQueryOptions>;

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
  return useQuery({
    ...baseOptions,
    queryKey: ["orders", params],
    queryFn: () => api.get<Paginated<OrderRow>>("admin/dashboard/orders", params),
    placeholderData: (prev) => prev,
  });
}

export function useProducts(params: ListParams) {
  return useQuery({
    ...baseOptions,
    queryKey: ["products", params],
    queryFn: () => api.get<Paginated<ProductRow>>("admin/dashboard/products", params),
    placeholderData: (prev) => prev,
  });
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

export function usePublishDrop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      dropId?: string;
      name?: string;
      organizationId?: string;
      totalSupply?: number;
      price?: number;
      currency?: string;
      category?: string;
      dropType?: string;
      scheduledAt?: string;
      isAgeSpecific?: boolean;
      minimumAge?: number | null;
      oddsDisclosureRef?: string | null;
      description?: string;
      nfcEnabled?: boolean;
      unlockableContent?: boolean;
      status?: string;
    }) => api.post<unknown>("admin/dashboard/drops/publish", payload).then(unwrap<ProductRow>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["release-approvals"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
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

export function useActivity(params: ListParams) {
  return useQuery({
    ...baseOptions,
    queryKey: ["activity", params],
    queryFn: () => api.get<Paginated<ActivityEvent>>("admin/dashboard/activity", params),
    placeholderData: (prev) => prev,
  });
}

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

export function useRoles() {
  return useQuery({
    ...baseOptions,
    queryKey: ["authz", "roles"],
    queryFn: () => api.get<unknown>("admin/authz/roles").then(unwrap<Role[]>),
  });
}

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
      permissions: string[];
    }) => api.post<unknown>("admin/authz/roles", payload).then(unwrap<Role>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["authz", "roles"] }),
  });
}

export function useUpdateRole(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<Role>) =>
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

export function useTeam(q?: string) {
  return useQuery({
    ...baseOptions,
    queryKey: ["authz", "team", q ?? ""],
    queryFn: () => api.get<Paginated<AdminUserRow>>("admin/authz/users", { q }),
    placeholderData: (prev) => prev,
  });
}

export function useUserRoles(userId: string | undefined) {
  return useQuery({
    ...baseOptions,
    queryKey: ["authz", "user-roles", userId],
    enabled: !!userId,
    queryFn: () =>
      api
        .get<unknown>(`admin/authz/users/${userId}/roles`)
        .then(unwrap<RoleAssignment[]>),
  });
}

export function useAssignRole(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      roleId: string;
      scopeType?: string;
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
    mutationFn: (roleId: string) =>
      api.delete<unknown>(`admin/authz/users/${userId}/roles/${roleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authz", "user-roles", userId] });
      qc.invalidateQueries({ queryKey: ["authz", "team"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export function useMedia(params: ListParams) {
  const hasPending = false;
  return useQuery({
    ...baseOptions,
    queryKey: ["media", params],
    queryFn: () => api.get<MediaListResponse>("admin/media", params),
    placeholderData: (prev) => prev,
    // Assets sit in PENDING until the scanner finishes; poll while any do.
    refetchInterval: (query) => {
      const data = query.state.data as MediaListResponse | undefined;
      const pending = data?.items.some((a) => a.virusScanStatus === "PENDING");
      return pending || hasPending ? 8_000 : false;
    },
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
 * Signed URLs expire in 60 seconds, so they are fetched at render time and
 * never cached. A 404 here covers four cases identically (missing, not
 * CLEAN, archived, out of scope) so that ids cannot be probed.
 */
export function useAssetUrl(assetId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["media", "url", assetId],
    enabled: !!assetId && enabled,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: () =>
      api.get<{ url: string; expiresIn: number }>(`admin/media/${assetId}/url`),
  });
}
