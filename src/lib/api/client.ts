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

  /**
   * Field-level errors from a 422, keyed by field path.
   *
   * `details` arrives in two shapes and this used to understand only one of
   * them. The product endpoints send an ARRAY of issues:
   *
   *   [{ path: "totalSupply", message: "Expected number, received nan",
   *      code: "invalid_type", receivedType: "string", received: "lots" }]
   *
   * The old implementation bailed on `Array.isArray(details)` and returned
   * `{}`, so a 422 from Add product highlighted no field at all and the
   * operator saw only the bare "Request validation failed".
   *
   * `received` is appended when present — product-upload-api.md's checklist
   * says to read it before changing the payload by guesswork, which is only
   * possible if the UI actually shows it.
   */
  get fieldErrors(): Record<string, string> {
    if (!this.details || typeof this.details !== "object") return {};
    const out: Record<string, string> = {};

    if (Array.isArray(this.details)) {
      for (const raw of this.details) {
        if (!raw || typeof raw !== "object") continue;
        const issue = raw as {
          path?: unknown;
          message?: unknown;
          received?: unknown;
        };
        // A nested path arrives as an array: ["skus", "count"].
        const path = Array.isArray(issue.path)
          ? issue.path.join(".")
          : typeof issue.path === "string"
            ? issue.path
            : "";
        if (typeof issue.message !== "string") continue;
        const shown =
          issue.received === undefined || issue.received === null
            ? issue.message
            : `${issue.message} (received ${JSON.stringify(issue.received)})`;
        // The first issue on a field wins; later ones are usually cascades.
        if (!(path in out)) out[path] = shown;
      }
      return out;
    }

    for (const [k, v] of Object.entries(this.details as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }

  /** A one-line summary of a 422, for a toast that would otherwise say nothing. */
  get validationSummary(): string | null {
    const fields = Object.entries(this.fieldErrors);
    if (!fields.length) return null;
    const [first, msg] = fields[0];
    const rest = fields.length - 1;
    return `${first ? `${first}: ` : ""}${msg}${rest ? ` (+${rest} more)` : ""}`;
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

      /* Product upload and the image gallery. */
      case "BODY_REQUIRED":
        // Express 5 leaves req.body undefined when no parser matched. This
        // used to surface as a 422 pointing at no field at all.
        return "The request reached the server without a JSON body. This is a client bug, not a permissions problem.";
      case "PRODUCTS_IMAGE_ASSET_INVALID":
        // The server names EVERY bad asset at once, so a twelve-image gallery
        // does not need twelve submissions to surface twelve problems.
        return this.message;
      case "PRODUCTS_IMAGE_DUPLICATE":
        return "That image is already in this gallery.";
      case "PRODUCTS_IMAGE_NOT_FOUND":
        return "That image is not on this drop — it may already have been removed.";
      case "PRODUCTS_MEDIA_UNAVAILABLE":
        return "No storage bucket is configured on this deployment, so images cannot be attached.";
      case "PRODUCTS_MARKETS_UNAVAILABLE":
        return "Market lookup is not wired up on this deployment, so a drop cannot be priced.";
      case "PRODUCTS_PRICE_MARKET_INVALID":
        // The server names EVERY bad market at once — a pricing table is
        // filled in for several markets in one sitting, and one error per
        // submission is a poor way to find three typos.
        return this.message;
      case "PRODUCTS_PRICE_NOT_FOUND":
        return "That price is not on this drop — it may already have been removed.";
      case "PRODUCTS_PRICE_REQUIRED":
        return "A drop must keep at least one market price. Set this one to Disabled instead of deleting it.";
      case "PRODUCTS_CODE_TAKEN":
        return "Could not allocate a unique product code. Try again.";
      case "PRODUCTS_NOT_FOUND":
        return "Drop not found — or outside your scope.";

      /* Tag manifests. The server names the offending rows; show them. */
      case "SKUS_UNIT_NOT_IN_PRODUCT":
      case "SKUS_TAG_ALREADY_BOUND":
      case "SKUS_TAG_REPLACE_REFUSED":
        return this.message;

      /* Serialized units. */
      case "SKUS_FORBIDDEN":
        return "Reading serialized units needs an operator-grade collectible-instance grant.";
      case "SKUS_SUPPLY_EXCEEDED":
        return "That would mint past the edition's declared supply.";
      case "PRODUCTS_SUPPLY_EXCEEDED":
        return "The requested unit count is larger than the drop's own total supply.";
      case "SKUS_TAG_TAKEN":
        // The server names the conflicting tag and the unit holding it, which
        // is the only way an operator can go and find it.
        return this.message;
      case "SKUS_SERIAL_TAKEN":
        return "Serial numbers collided repeatedly — another operator is minting this edition. Try again.";
      case "SKUS_VARIANT_MISMATCH":
        return "That variant belongs to a different product.";
      case "PRODUCTS_MINTING_UNAVAILABLE":
        return "Minting is not wired up on this deployment.";
      case "SKUS_NOT_FOUND":
        return "Unit not found — or outside your scope.";
      case "SKUS_PRODUCT_NOT_FOUND":
        return "Drop not found — or outside your scope.";

      /* Finance — the refusals that protect money already posted. */
      case "FINANCE_FORBIDDEN":
        return "Your role does not reach payment and royalty records.";
      case "FINANCE_NOT_FOUND":
        return "Not found — or outside the scope your grant covers.";
      case "FINANCE_NO_RULE":
        return "No royalty rule covers this drop at the time of the accrual.";
      case "FINANCE_NOT_ACCRUABLE":
        return "The order behind this claim is missing, unpaid, or already reversed.";
      case "FINANCE_INVALID_RULE":
        // The server names the offending total, which is the whole point of
        // the refusal — a 105% split is a typo worth seeing in full.
        return this.message;
      case "FINANCE_IMMUTABLE":
        return "Ledger rows are never edited. Post an adjustment against this instead.";
      case "FINANCE_INVALID_TRANSITION":
        return "That step is not available from where this record is now.";
      case "FINANCE_NOTHING_TO_PAY":
        return "Nothing was eligible — every balance is below its threshold or already batched.";
      case "FINANCE_ALREADY_REVERSED":
        return "This entry has already been reversed. Reversing twice would double-credit it.";

      /* Payments. */
      case "PAYMENTS_FORBIDDEN":
        return "Your role does not reach payment records.";
      case "PAYMENTS_NOT_FOUND":
        return "Not found — or outside the scope your grant covers.";
      case "PAYMENTS_INVALID_TRANSITION":
        return "That step is not available from this refund's current status.";
      case "PAYMENTS_RETURN_NOT_CONFIRMED":
        return "Money does not move before the item is back. Confirm the physical return first, or approve with an explicit override and a reason.";
      case "PAYMENTS_NOT_REFUNDABLE":
        return "This order cannot be refunded in its current state.";
      case "PAYMENTS_AMOUNT_EXCEEDS_CAPTURE":
        return "The refund is larger than what was actually captured on this order.";
      case "PAYMENTS_GATEWAY_UNAVAILABLE":
        return "No payment provider adapter is wired on this deployment. Supply the provider's own refund id to record it manually.";
      case "PAYMENTS_NO_GATEWAY":
        return "No active gateway configuration covers this scope.";
      case "PAYMENTS_NO_PRICE":
        return "No price is configured for that market.";
      case "PAYMENTS_OUT_OF_STOCK":
        return "No unreserved unit is left to hold.";
      case "PAYMENTS_NOT_PURCHASABLE":
        return "This drop is not buyable — it is inactive, sold out, or age-gated.";
      case "PAYMENTS_RESERVATION_EXPIRED":
        return "The stock hold expired before payment settled.";
      case "PAYMENTS_INVALID_SIGNATURE":
        return "The provider's webhook signature could not be verified.";

      /* Role assignment. */
      case "ACCESS_CONTROL_ASSIGNMENT_EXISTS":
        return "This person already holds that role at that scope.";
      case "ACCESS_CONTROL_MISSING_ORG_SCOPE":
        return "This role is organization-scoped — choose an organization.";
      case "ACCESS_CONTROL_ROLE_NOT_FOUND":
        return "That role no longer exists, or has been deactivated.";

      /* Staff invitations (admin-provisioning.md §6).
       *
       * AUTHZ_FORBIDDEN is deliberately absent from this block. The invitation
       * route emits it for two different refusals and the server's own message
       * is the only thing that separates them: a 403 names the permissions the
       * granter does not hold (the escalation check), and a 400 carries the
       * identity provider's refusal with `details.invitationId` pointing at the
       * FAILED row. Replacing either with "your role does not include this
       * capability" would throw away the only actionable part, so the invite
       * form shows `message` verbatim instead.
       */
      case "AUTHZ_ROLE_NOT_FOUND":
        return "That role no longer exists, or has been deactivated.";
      case "AUTHZ_MISSING_ORG_SCOPE":
        return "This role is organization-scoped — choose an organization.";
      case "AUTHZ_ASSIGNMENT_EXISTS":
        return "An open invitation for that person and role already exists. Revoke it before sending another.";
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
  /** Wholesale replace — the product gallery's reorder path. */
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Many endpoints wrap their payload in `{ data: ... }`; some do not. */
export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}
