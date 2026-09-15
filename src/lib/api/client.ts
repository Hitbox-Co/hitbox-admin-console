import type { ApiErrorBody, ErrorCode } from "../types";

/**
 * Browser-side API client. Every call goes through /api/hitbox/*, which
 * attaches the Clerk JWT server-side.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level errors from a 422, when the backend supplied them. */
  get fieldErrors(): Record<string, string> {
    if (this.details && typeof this.details === "object" && !Array.isArray(this.details)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(this.details as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
    return {};
  }

  /** A sentence to show the operator, chosen per documented error code. */
  get friendly(): string {
    switch (this.code) {
      case "AUTH_UNAUTHENTICATED":
        return "Your session has expired. Sign in again to continue.";
      case "AUTH_INVALID_TOKEN":
        return "Your session token could not be verified. Reconnecting…";
      case "AUTH_ACCOUNT_NOT_FOUND":
        return "Your account is still being provisioned. This usually takes a few seconds.";
      case "AUTH_ACCOUNT_SUSPENDED":
        return "This account has been suspended. Contact an administrator.";
      case "AUTH_EMAIL_UNVERIFIED":
        return "Verify your email address before using the console.";
      case "AUTHZ_FORBIDDEN":
        return "Your role does not include this capability.";
      case "SCOPE_MISMATCH":
        return "That organization is outside the scope your role covers.";
      case "NOT_FOUND":
        return "Not found — or outside your scope.";
      case "AUTHZ_ROLE_IN_USE":
        return "This role is still assigned. Revoke every assignment before deleting it.";
      case "AUTHZ_ROLE_IMMUTABLE":
        return "Seeded platform roles are read-only. You can deactivate one instead.";
      case "AUTHZ_DOMAIN_VIOLATION":
        return "Every permission on a role must belong to the role's own domain.";
      case "INVALID_RANGE":
        return "The start of the range must come before the end.";
      case "STORAGE_UNAVAILABLE":
        return "Media storage is not configured on this deployment.";

      /* Markets — the three invariants, in the operator's words. */
      case "MARKETS_CODE_TAKEN":
        return "A market with that code already exists.";
      case "MARKETS_COUNTRY_TAKEN":
        return "One or more of those countries is already mapped to another market.";
      case "MARKETS_IN_USE":
        return "This market still has product prices against it. Repoint them before archiving.";
      case "MARKETS_DEFAULT_REQUIRED":
        return "Exactly one market must be the default. Promote another one instead of clearing this.";
      case "MARKETS_NOT_FOUND":
        return "Market not found — or outside your scope.";

      /* Orders — the lifecycle graph is the server's, not ours. */
      case "ORDERS_STATUS_NOT_SETTABLE":
        return "Paid and refunded are written by the payment pipelines, not by hand.";
      case "ORDERS_INVALID_TRANSITION":
        return "That status change is not allowed from where this order is now.";
      case "ORDERS_NOT_FOUND":
        return "Order not found — or outside your scope.";

      /* Releases — the compliance refusals. */
      case "RELEASES_ALREADY_PENDING":
        return "This drop already has an open review. Decide that one first.";
      case "RELEASES_ALREADY_DECIDED":
        return "This review is already decided. Reversing it needs the override permission.";
      case "RELEASES_COMMENT_REQUIRED":
        return "A rejection needs a comment saying why.";
      case "RELEASES_COMPLIANCE_INCOMPLETE":
        return "An age-restricted drop cannot be approved until it carries a minimum age.";
      case "RELEASES_NOT_FOUND":
        return "Review not found — or outside your scope.";

      /* Role assignment. */
      case "ACCESS_CONTROL_ASSIGNMENT_EXISTS":
        return "This person already holds that role at that scope.";
      case "ACCESS_CONTROL_MISSING_ORG_SCOPE":
        return "This role is organization-scoped — choose an organization.";
      case "ACCESS_CONTROL_ROLE_NOT_FOUND":
        return "That role no longer exists, or has been deactivated.";
      case "NETWORK_ERROR":
        return this.message;
      default:
        return this.message || "Something went wrong.";
    }
  }
}

export type QueryValue = string | number | boolean | null | undefined;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const clean = path.replace(/^\/+/, "");
  const url = new URL(`/api/hitbox/${clean}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, QueryValue>; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not reach the console API. Check your connection.",
      null
    );
  }

  const text = await res.text();
  const payload = text ? tryParse(text) : null;

  if (!res.ok) {
    const body = payload as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? "NETWORK_ERROR",
      body?.error?.message ?? `Request failed with status ${res.status}.`,
      body?.error?.details ?? null
    );
  }

  return payload as T;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Record<string, QueryValue>) =>
    request<T>("POST", path, { body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Many endpoints wrap their payload in `{ data: ... }`; some do not. */
export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}
