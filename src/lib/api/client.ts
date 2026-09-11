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

/** Storage key backing the demo role switcher; sent as the x-demo-role header. */
export const PREVIEW_ROLE_KEY = "hitbox.demoRole";

function getPreviewRole(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREVIEW_ROLE_KEY);
  } catch {
    return null;
  }
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, QueryValue>; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const preview = getPreviewRole();
  if (preview) headers["x-demo-role"] = preview;

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
