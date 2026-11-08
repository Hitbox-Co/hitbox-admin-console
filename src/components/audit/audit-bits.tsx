"use client";

import * as React from "react";
import { humanize } from "@/lib/format";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import type { Permissions } from "@/lib/authz";

/**
 * Small pieces of the audit trail shared by the Audit log screen and the
 * per-record History tabs (audit-logging.md §5).
 */

export const SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export const RESULTS = ["SUCCESS", "FAILURE", "DENIED"] as const;
export const ACTOR_TYPES = ["HITBOX_ADMIN", "HITBOX_EMPLOYEE", "BRAND_EMPLOYEE", "ARTIST", "BUYER", "SYSTEM"] as const;

export function SeverityBadge({ severity }: { severity: string }) {
  const tone: BadgeTone = severity === "CRITICAL" ? "danger" : severity === "WARNING" ? "warning" : "neutral";
  return (
    <Badge tone={tone} dot>
      {humanize(severity)}
    </Badge>
  );
}

/** DENIED (refused before anything happened) and FAILURE (tried and broke) read differently. */
export function ResultBadge({ result }: { result: string }) {
  if (result === "SUCCESS") return <Badge tone="positive">Success</Badge>;
  if (result === "DENIED") return <Badge tone="warning">Denied</Badge>;
  return <Badge tone="danger">{humanize(result)}</Badge>;
}

/** `order.shipment.record` → "Order · shipment record". */
export function eventLabel(eventType: string): { area: string; action: string } {
  const [area, ...rest] = eventType.split(".");
  return { area: humanize(area ?? eventType), action: rest.map((r) => r.replace(/-/g, " ")).join(" ") || eventType };
}

/** Bookkeeping fields every snapshot carries — noise in a diff. */
const IGNORED = new Set(["updatedAt", "createdAt"]);

export interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}

export function diffStates(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  ignore: Set<string> = IGNORED
): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: FieldChange[] = [];
  keys.forEach((k) => {
    if (ignore.has(k)) return;
    const b = before?.[k];
    const a = after?.[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) out.push({ key: k, before: b, after: a });
  });
  return out;
}

export function showValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

/**
 * Before → after, only the fields that moved. A create has only `after`, a
 * delete often only `before` — both still read as a table of fields.
 */
export function StateDiff({ changes }: { changes: FieldChange[] }) {
  return (
    <table className="w-full table-fixed text-[11.5px]">
      <thead>
        <tr className="text-left text-[var(--text-3)]">
          <th className="w-[32%] py-1 font-normal">Field</th>
          <th className="py-1 font-normal">Before</th>
          <th className="py-1 font-normal">After</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.key} className="border-t border-[var(--hairline)] align-top">
            <td className="break-words py-1 pr-2 text-[var(--text-2)]">{humanize(c.key)}</td>
            <td className="break-all py-1 pr-2 text-[var(--danger)]">{showValue(c.before)}</td>
            <td className="break-all py-1 text-[var(--positive)]">{showValue(c.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Where a resource lives in the console, when it has a page there and the
 * caller can open it. Types are as the modules write them.
 */
export function resourceHref(type: string | null, id: string | null, perms: Permissions): string | null {
  if (!type || !id) return null;
  const routes: Record<string, [string, string]> = {
    Order: [`/orders/${id}`, "/orders"],
    RefundRequest: [`/payments/refunds/${id}`, "/payments/refunds"],
    ArtistCollection: [`/artist-collections/${id}`, "/artist-collections"],
    Product: [`/products/${id}`, "/products/detail"],
    ReleaseApproval: [`/release-approvals/${id}`, "/release-approvals"],
  };
  const hit = routes[type];
  if (!hit) return null;
  return perms.canOpen(hit[1]) ? hit[0] : null;
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-all rounded-[8px] bg-[var(--surface-2)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text-2)]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
