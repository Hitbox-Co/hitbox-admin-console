"use client";

import * as React from "react";
import {
  useAdminArtists,
  useAdminOrders,
  useAdminOrganizations,
  useFinanceLedger,
  usePaymentTransactions,
  usePayouts,
  useProducts,
  useRoyaltyEntries,
} from "@/lib/api/hooks";
import { formatCurrency, formatDate, humanize } from "@/lib/format";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { usePermissions } from "@/components/layout/authz-provider";

/**
 * Named pickers for every id a finance form or filter asks for.
 *
 * Directories (artists, organizations) are fetched whole — the server caps
 * them at 200 and a picker filters in the browser. Transactional records
 * (orders, royalty entries, payouts, ledger lines, payments) are the newest
 * 100 — every list endpoint caps there — so those pickers also accept a
 * pasted id for anything older.
 *
 * A directory the caller may not read (the artist and organization lists take
 * drop:read, which HITBOX_FINANCE_ADMIN does not hold) degrades to "paste an
 * id" rather than a dead control.
 */

interface PickerProps {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  size?: "sm" | "md";
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Resolves a payee id — artist or organization — to a name, from the same
 * cached directories the pickers use. Returns undefined when the id is in
 * neither (or the caller cannot read them), so the caller falls back to the id.
 */
export function usePayeeNames(): (id: string) => string | undefined {
  // The directories need platform-wide drop reach — Finance Admin and an
  // artist do not hold it, so for them this resolves nothing rather than
  // firing two requests that answer 403.
  const canRead = usePermissions().reaches("drop");
  const artists = useAdminArtists(undefined, canRead);
  const orgs = useAdminOrganizations(canRead);
  return React.useCallback(
    (id: string) =>
      artists.data?.find((a) => a.id === id)?.name ??
      orgs.data?.find((o) => o.id === id)?.name,
    [artists.data, orgs.data]
  );
}

/**
 * What a royalty rule applies to, by NAME. A rule carries only ids — "An
 * artist" with a uuid under it tells an operator nothing — so the scope is
 * resolved against the same directories the pickers use, and the drop
 * catalog for a drop-scoped rule.
 *
 * Collections have no directory endpoint, so a collection-scoped rule keeps
 * its id. A name that cannot be resolved (another page of drops, or a role
 * without directory access) falls back to the kind, never to a blank.
 */
export interface RuleScopeName {
  /** "Artist", "Organization", "Drop", "Collection". */
  kind: string;
  /** The resolved name, or null when it could not be found. */
  name: string | null;
  id: string | null;
}

export function useRuleScopeNames() {
  const payeeName = usePayeeNames();
  const drops = useProducts({ page: 1, limit: 100 });
  const dropName = React.useCallback(
    (id: string) => drops.data?.items.find((p) => p.id === id)?.name,
    [drops.data]
  );
  return React.useCallback(
    (scope: {
      productId: string | null;
      collectionId: string | null;
      artistId: string | null;
      organizationId: string | null;
    }): RuleScopeName => {
      // Most specific first — the order the accrual service resolves rules in.
      if (scope.productId)
        return { kind: "Drop", name: dropName(scope.productId) ?? null, id: scope.productId };
      if (scope.collectionId)
        return { kind: "Collection", name: null, id: scope.collectionId };
      if (scope.artistId)
        return { kind: "Artist", name: payeeName(scope.artistId) ?? null, id: scope.artistId };
      if (scope.organizationId)
        return {
          kind: "Organization",
          name: payeeName(scope.organizationId) ?? null,
          id: scope.organizationId,
        };
      return { kind: "Unscoped", name: null, id: null };
    },
    [payeeName, dropName]
  );
}

function unavailable(isError: boolean, what: string) {
  return isError ? `${what} list unavailable — paste an id` : undefined;
}

export function ArtistPicker({
  organizationId,
  ...props
}: PickerProps & { organizationId?: string }) {
  const q = useAdminArtists(organizationId);
  const options: ComboOption[] = React.useMemo(
    () =>
      (q.data ?? []).map((a) => ({
        value: a.id,
        label: a.name,
        hint: [a.organizationName, a.isActive ? null : "inactive"].filter(Boolean).join(" · ") || undefined,
      })),
    [q.data]
  );
  return (
    <Combobox
      {...props}
      options={options}
      loading={q.isLoading}
      allowUuid
      placeholder={unavailable(q.isError, "Artist") ?? props.placeholder ?? "Select an artist"}
      searchPlaceholder="Search artists"
      emptyText="No artist matches."
    />
  );
}

export function OrganizationPicker(props: PickerProps) {
  const q = useAdminOrganizations();
  const options: ComboOption[] = React.useMemo(
    () =>
      (q.data ?? []).map((o) => ({
        value: o.id,
        label: o.name,
        hint: [humanize(o.type), o.isActive ? null : "inactive"].filter(Boolean).join(" · "),
      })),
    [q.data]
  );
  return (
    <Combobox
      {...props}
      options={options}
      loading={q.isLoading}
      allowUuid
      placeholder={unavailable(q.isError, "Organization") ?? props.placeholder ?? "Select an organization"}
      searchPlaceholder="Search organizations"
      emptyText="No organization matches."
    />
  );
}

export function DropPicker(props: PickerProps) {
  const q = useProducts({ page: 1, limit: 100 });
  const options: ComboOption[] = React.useMemo(
    () =>
      (q.data?.items ?? []).map((p) => ({
        value: p.id,
        label: p.name,
        hint: `${p.groupCode} · ${humanize(p.status)}`,
      })),
    [q.data]
  );
  return (
    <Combobox
      {...props}
      options={options}
      loading={q.isLoading}
      allowUuid
      placeholder={unavailable(q.isError, "Drop") ?? props.placeholder ?? "Select a drop"}
      searchPlaceholder="Search drops by name or code"
      emptyText="No drop matches. Older drops can be pasted by id."
    />
  );
}

export function OrderPicker(props: PickerProps) {
  const q = useAdminOrders({ page: 1, limit: 100 });
  const options: ComboOption[] = React.useMemo(
    () =>
      (q.data?.items ?? []).map((o) => ({
        value: o.id,
        label: `${o.productName} · ${formatDate(o.placedAt)}`,
        hint: [
          o.productCode,
          humanize(o.status),
          o.amount && o.currency ? formatCurrency(o.amount, o.currency) : null,
          o.buyerEmail ?? null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    [q.data]
  );
  return (
    <Combobox
      {...props}
      options={options}
      loading={q.isLoading}
      allowUuid
      placeholder={unavailable(q.isError, "Order") ?? props.placeholder ?? "Select an order"}
      searchPlaceholder="Search the latest 100 orders"
      emptyText="Not among the latest 100 orders — paste its id."
    />
  );
}

export function RoyaltyEntryPicker({ orderId, ...props }: PickerProps & { orderId?: string }) {
  const q = useRoyaltyEntries({ page: 1, limit: 100, orderId });
  const options: ComboOption[] = React.useMemo(
    () =>
      (q.data?.items ?? []).map((e) => ({
        value: e.id,
        label: `${e.payee.name ?? humanize(e.payee.type)} · ${formatCurrency(e.amount, e.currency)}`,
        hint: `${humanize(String(e.entryType))} · ${humanize(String(e.status))}`,
      })),
    [q.data]
  );
  return (
    <Combobox
      {...props}
      options={options}
      loading={q.isLoading}
      allowUuid
      placeholder={unavailable(q.isError, "Royalty") ?? props.placeholder ?? "Select a royalty entry"}
      searchPlaceholder="Search by payee, type or status"
      emptyText={orderId ? "No royalty entry on that order." : "Not among the latest 100 — paste its id."}
    />
  );
}

export function PayoutPicker(props: PickerProps) {
  const q = usePayouts({ page: 1, limit: 100 });
  const options: ComboOption[] = React.useMemo(
    () =>
      (q.data?.items ?? []).map((p) => ({
        value: p.id,
        label: `${p.payee.name ?? humanize(p.payee.type)} · ${formatCurrency(p.amount, p.currency)}`,
        hint: `${humanize(String(p.status))} · scheduled ${formatDate(p.scheduledAt)}`,
      })),
    [q.data]
  );
  return (
    <Combobox
      {...props}
      options={options}
      loading={q.isLoading}
      allowUuid
      placeholder={unavailable(q.isError, "Payout") ?? props.placeholder ?? "Select a payout"}
      searchPlaceholder="Search by payee or status"
      emptyText="Not among the latest 100 payouts — paste its id."
    />
  );
}

export function LedgerEntryPicker({ orderId, ...props }: PickerProps & { orderId?: string }) {
  const q = useFinanceLedger({ page: 1, limit: 100, orderId });
  const options: ComboOption[] = React.useMemo(
    () =>
      (q.data?.items ?? []).map((l) => ({
        value: l.id,
        label: `${humanize(String(l.category))} · ${humanize(String(l.direction))} ${formatCurrency(l.amount, l.currency)}`,
        hint: [l.description, formatDate(l.createdAt)].filter(Boolean).join(" · "),
      })),
    [q.data]
  );
  return (
    <Combobox
      {...props}
      options={options}
      loading={q.isLoading}
      allowUuid
      placeholder={unavailable(q.isError, "Ledger") ?? props.placeholder ?? "Select a ledger line"}
      searchPlaceholder="Search by category or description"
      emptyText={orderId ? "No ledger line on that order." : "Not among the latest 100 — paste its id."}
    />
  );
}

export function PaymentPicker({ orderId, ...props }: PickerProps & { orderId?: string }) {
  const q = usePaymentTransactions({ page: 1, limit: 100, orderId });
  const options: ComboOption[] = React.useMemo(
    () =>
      (q.data?.items ?? []).map((t) => ({
        value: t.id,
        label: `${humanize(t.gateway)} · ${formatCurrency(t.amount, t.currency)}`,
        hint: [humanize(String(t.status)), t.gatewayRef].filter(Boolean).join(" · "),
      })),
    [q.data]
  );
  return (
    <Combobox
      {...props}
      options={options}
      loading={q.isLoading}
      allowUuid
      placeholder={unavailable(q.isError, "Payment") ?? props.placeholder ?? "Select a payment"}
      searchPlaceholder="Search by gateway, status or reference"
      emptyText={orderId ? "No payment on that order." : "Not among the latest 100 — paste its id."}
    />
  );
}
