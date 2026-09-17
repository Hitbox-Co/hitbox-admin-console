import type { APIResponse } from "@playwright/test";

/**
 * Reading API payloads without reaching for `any`.
 *
 * These responses are genuinely unknown at compile time — the point of the
 * contract tests is that the shape might NOT be what the console expects — so
 * the honest type is `unknown` plus narrowing helpers, not `any`. `any` would
 * silence exactly the mistakes this suite exists to catch.
 */

export type JsonRow = Record<string, unknown>;

/** Parse a response as JSON, with an error that says what arrived instead. */
export async function body(res: APIResponse): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `expected JSON, got ${res.status()} ${res.headers()["content-type"] ?? "?"}: ${text.slice(0, 200)}`
    );
  }
}

function isRecord(v: unknown): v is JsonRow {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Many endpoints wrap their payload in `{ data: ... }`; some do not. */
export function unwrap(payload: unknown): unknown {
  return isRecord(payload) && "data" in payload ? payload.data : payload;
}

/**
 * The rows out of a list response, whichever envelope it used.
 *
 * Seen in this API: `{ data: { items: [] } }`, `{ data: [] }` and a bare array.
 */
export function rows(payload: unknown): JsonRow[] {
  const data = unwrap(payload);
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) {
    for (const key of ["items", "data", "results"]) {
      const candidate = data[key];
      if (Array.isArray(candidate)) return candidate.filter(isRecord);
    }
  }
  return [];
}

/** `error.code` when the payload carries one, else null. */
export function errorCode(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const err = payload.error;
  if (!isRecord(err)) return null;
  return typeof err.code === "string" ? err.code : null;
}

/** A string field off a row, or null — for ids and statuses. */
export function str(row: JsonRow | undefined, key: string): string | null {
  if (!row) return null;
  const v = row[key];
  return typeof v === "string" ? v : null;
}

/** A string array off a row (allowedTransitions, permissions, …). */
export function strList(row: JsonRow | undefined, key: string): string[] {
  if (!row) return [];
  const v = row[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** The caller's permission keys from an /authz/me payload. */
export function permissionsOf(payload: unknown): string[] {
  const me = unwrap(payload);
  return isRecord(me) ? strList(me, "permissions") : [];
}
