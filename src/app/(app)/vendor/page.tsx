"use client";

import * as React from "react";
import { useClerk } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Factory, Package, PackageCheck, Plus, ShieldOff } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useMyVendorBatches, useMyVendorDrops, useVendorMe } from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Mono,
  Panel,
  PanelHeader,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import {
  FilterPicker,
  FilterRow,
  FilterSelect,
  SearchInput,
  useListState,
} from "@/components/ui/filters";
import { CardSkeleton, EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { AllotmentSummary } from "@/components/supply/allotment-summary";
import {
  awaitingIncrease,
  NewVendorConsignmentDrawer,
  VendorConsignmentDrawer,
} from "@/components/vendor/vendor-consignment-drawers";
import type { SupplyBatch, VendorDropAssignment, VendorMe } from "@/lib/types";

/**
 * The vendor portal (vendor-portal-api.md) — the whole console for a
 * vendor's own staff. Reachable with `vendor-supply:read:own`, which only the
 * VENDOR role holds; whether the account still acts for a vendor is decided
 * by /vendor/me, which answers 403 SUPPLY_VENDOR_MEMBERSHIP_REQUIRED when the
 * membership was revoked or never linked.
 *
 * There is no vendor id anywhere in this screen: every call is the signed-in
 * user's own vendor.
 */
export default function VendorPortalPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/vendor")}
      what="The vendor portal"
      requires="vendor-supply:read:own"
    >
      <VendorPortal />
    </PageGuard>
  );
}

function VendorPortal() {
  const me = useVendorMe();

  usePageChrome({
    title: me.data?.vendor.name ?? "Vendor portal",
    description: "Your assigned drops, consignments and chip manifests.",
  });

  if (me.isLoading) {
    return (
      <div className="space-y-4">
        <CardSkeleton className="h-24" />
        <CardSkeleton className="h-64" />
      </div>
    );
  }

  if (isMembershipGone(me.error)) {
    return <AccessRemoved />;
  }

  if (me.isError || !me.data) {
    return (
      <Panel>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </Panel>
    );
  }

  return <PortalBody me={me.data} />;
}

function PortalBody({ me }: { me: VendorMe }) {
  const perms = usePermissions();
  const drops = useMyVendorDrops();
  const qc = useQueryClient();

  // Revoked while the portal was open: every portal read now answers 403
  // SUPPLY_VENDOR_MEMBERSHIP_REQUIRED. Re-read /vendor/me so the whole page
  // switches to the "access removed" screen instead of one failed panel.
  React.useEffect(() => {
    if (isMembershipGone(drops.error)) {
      void qc.invalidateQueries({ queryKey: ["vendor-me"] });
    }
  }, [drops.error, qc]);
  const [creating, setCreating] = React.useState(false);
  const [open, setOpen] = React.useState<SupplyBatch | null>(null);

  // Writes need the create grant AND an active vendor; reads survive both.
  const canWrite = perms.canSupplyAsVendor() && me.vendor.isActive;
  const assigned = drops.data ?? [];

  return (
    <>
      {perms.canSupplyAsVendor() ? (
        <PageActions>
          <Tooltip
            content={
              !me.vendor.isActive
                ? "Your vendor is inactive — new consignments are refused."
                : assigned.length === 0
                  ? "HitBox hasn't assigned you any drops yet."
                  : "Book a shipment for one of your drops."
            }
          >
            <span>
              <Button
                variant="primary"
                size="sm"
                disabled={!canWrite || assigned.length === 0}
                onClick={() => setCreating(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                New consignment
              </Button>
            </span>
          </Tooltip>
        </PageActions>
      ) : null}

      <div className="space-y-4">
        {!me.vendor.isActive ? (
          <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--warning)]">
            <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden />
            HitBox has deactivated your vendor. You can still see everything
            here, but new consignments and manifest uploads are refused.
            Contact HitBox to reactivate.
          </p>
        ) : null}

        <VendorCard me={me} />

        <AssignedDrops query={drops} />

        <Consignments
          drops={assigned}
          onOpen={setOpen}
        />
      </div>

      {creating ? (
        <NewVendorConsignmentDrawer
          me={me}
          drops={assigned}
          onClose={() => setCreating(false)}
          onCreated={(b) => {
            setCreating(false);
            setOpen(b);
          }}
        />
      ) : null}
      {open ? (
        <VendorConsignmentDrawer
          batch={open}
          me={me}
          drops={assigned}
          canWrite={perms.canSupplyAsVendor()}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function VendorCard({ me }: { me: VendorMe }) {
  const v = me.vendor;
  return (
    <Panel className="flex flex-wrap items-start gap-x-8 gap-y-3 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)]">
          <Factory className="h-4 w-4 text-[var(--text-2)]" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-[var(--text-1)]">{v.name}</p>
          <p className="truncate text-[11.5px] text-[var(--text-3)]">
            {v.legalName ?? humanize(v.vendorType)}
            {v.country ? ` · ${v.country}` : ""}
          </p>
        </div>
      </div>
      <Meta label="Makes">
        <Badge tone="neutral">{humanize(v.vendorType)}</Badge>
      </Meta>
      <Meta label="Status">
        <Badge tone={v.isActive ? "positive" : "neutral"} dot>
          {v.isActive ? "Active" : "Inactive"}
        </Badge>
      </Meta>
      <Meta label="Contact">
        <span className="text-[12px] text-[var(--text-2)]">
          {[v.contactName, v.contactEmail].filter(Boolean).join(" · ") || "—"}
        </span>
      </Meta>
      <Meta label="Signed in as">
        <span className="text-[12px] text-[var(--text-2)]">{me.member.email}</span>
      </Meta>
      <p className="basis-full text-[11px] text-[var(--text-3)]">
        Your vendor details are kept by HitBox — contact them to change anything here.
      </p>
    </Panel>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-[var(--text-3)]">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function AssignedDrops({ query }: { query: ReturnType<typeof useMyVendorDrops> }) {
  const rows = query.data ?? [];
  return (
    <Panel>
      <PanelHeader
        title="Your drops"
        description="What HitBox has asked you to supply, per variant. Booked counts every consignment that isn't rejected — a rejected carton frees its allotment again."
      />
      {query.isLoading ? (
        <TableSkeleton rows={2} cols={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No drops assigned yet"
          description="HitBox will assign the drops you're making. They'll show up here."
        />
      ) : (
        <ul className="grid gap-2 px-3 pb-3 lg:grid-cols-2">
          {rows.map((a) => (
            <li
              key={a.id}
              className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5"
            >
              <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
                {a.drop.name}
              </p>
              <p className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-3)]">
                <Mono className="text-[10px]">{a.drop.groupCode}</Mono>
                <Badge tone={toneForStatus(a.drop.status)}>{humanize(a.drop.status)}</Badge>
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-3)]">
                Assigned {formatDate(a.assignedAt)}
              </p>
              <AllotmentSummary assignment={a} audience="vendor" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Consignments({
  drops,
  onOpen,
}: {
  drops: VendorDropAssignment[];
  onOpen: (b: SupplyBatch) => void;
}) {
  const list = useListState<{ status?: string; dropId?: string }>({
    status: undefined,
    dropId: undefined,
  });
  const [q, setQ] = React.useState("");
  const query = useMyVendorBatches({ ...list.params, search: q || undefined });

  const columns: Column<SupplyBatch>[] = [
    {
      key: "batch",
      header: "Consignment",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text-1)]">
            {r.batchRef ?? "—"}
          </p>
          {r.vendorInvoiceRef ? (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">
              {r.vendorInvoiceRef}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "drop",
      header: "Drop",
      cell: (r) =>
        r.drop ? (
          <div className="min-w-0">
            <p className="truncate text-[12px] text-[var(--text-2)]">{r.drop.name}</p>
            <Mono className="text-[10px]">{r.drop.groupCode}</Mono>
          </div>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
    {
      key: "type",
      header: "Contains",
      cell: (r) => <Badge tone="neutral">{humanize(r.itemType)}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={toneForStatus(r.status)} dot>
            {humanize(r.status)}
          </Badge>
          {/* Only single reads are documented to carry `allotment`; shown when present. */}
          {awaitingIncrease(r) ? <Badge tone="warning">Awaiting allotment increase</Badge> : null}
        </div>
      ),
    },
    {
      key: "lines",
      header: "Variants",
      cell: (r) =>
        r.lines && r.lines.length > 0 ? (
          <Tooltip
            content={r.lines
              .map((l) => `${l.label ?? l.variantCode ?? "Variant"}: ${l.rowsReceived}/${l.quantity}`)
              .join(" · ")}
          >
            <span className="cursor-help text-[12px] text-[var(--text-2)]">
              {r.lines.length} variant{r.lines.length === 1 ? "" : "s"}
            </span>
          </Tooltip>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
    {
      key: "counts",
      header: "Chips / declared",
      numeric: true,
      cell: (r) => (
        <span className="tnum text-[12px] text-[var(--text-2)]">
          {formatNumber(r.reconciliation.registered)} /{" "}
          {formatNumber(r.reconciliation.declared)}
        </span>
      ),
    },
    {
      key: "received",
      header: "Received",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.receivedAt)}</span>,
    },
  ];

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <Panel>
      <PanelHeader
        title="Consignments"
        description="Everything shipped under your vendor — including ones HitBox booked for you."
      />
      <FilterRow
        active={list.active || !!q}
        onReset={() => {
          list.reset();
          setQ("");
        }}
      >
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            list.setPage(1);
          }}
          placeholder="Batch or invoice reference"
          className="w-60"
        />
        <FilterSelect
          label="Status"
          value={list.filters.status}
          onChange={(v) => list.setFilter("status", v)}
          options={["UPLOADED", "VALIDATED", "ACCEPTED", "REJECTED"]}
        />
        <FilterPicker
          label="Drop"
          value={list.filters.dropId}
          onChange={(v) => list.setFilter("dropId", v)}
          options={drops.map((d) => ({ value: d.dropId, label: d.drop.name }))}
        />
      </FilterRow>

      {query.isLoading ? (
        <TableSkeleton cols={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No consignments"
          description={
            list.active || q
              ? "Nothing matches these filters."
              : "Book a consignment for one of your drops, then upload its chip manifest."
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            onRowClick={onOpen}
            dimmed={query.isFetching}
          />
          {meta ? (
            <Pagination
              page={meta.page}
              limit={meta.limit}
              total={meta.total}
              onPageChange={list.setPage}
              onLimitChange={list.setLimit}
            />
          ) : null}
        </>
      )}
    </Panel>
  );
}

function isMembershipGone(err: unknown): boolean {
  return err instanceof ApiError && err.code === "SUPPLY_VENDOR_MEMBERSHIP_REQUIRED";
}

function AccessRemoved() {
  const { signOut } = useClerk();
  return (
    <Panel className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)]">
        <ShieldOff className="h-5 w-5 text-[var(--danger)]" />
      </span>
      <div>
        <p className="text-[14px] font-medium text-[var(--text-1)]">
          Your vendor access has been removed
        </p>
        <p className="mt-1.5 max-w-[380px] text-[12.5px] leading-relaxed text-[var(--text-3)]">
          This account is no longer linked to a vendor — the access may have
          been revoked, or the invitation was never completed. Contact HitBox
          if you think this is a mistake.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => signOut()}>
        Sign out
      </Button>
    </Panel>
  );
}
