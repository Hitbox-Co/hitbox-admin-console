"use client";

import * as React from "react";
import { Info, Package, Plus, ShieldAlert } from "lucide-react";
import {
  useAdminArtists,
  useAdminOrganizations,
  usePrefetchProduct,
  useProducts,
} from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize, shortId } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import {
  Badge,
  Button,
  Mono,
  Panel,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import {
  FilterPicker,
  FilterRow,
  FilterSelect,
  useListState,
} from "@/components/ui/filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { ProductDrawer } from "@/components/products/product-drawer";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import type { ProductRow } from "@/lib/types";

const DROP_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "ACTIVE",
  "ENDED",
  "ARCHIVED",
];

export default function ProductsPage() {
  return (
    <PageGuard can={(p) => p.canRead("drop")} what="The drop catalog" requires="drop:read">
      <ProductsView />
    </PageGuard>
  );
}

function ProductsView() {
  // `status` is the ONE filter this endpoint takes. Brand and artist are
  // applied to the rows after they arrive — see FILTERING below.
  const list = useListState<{ status?: string }>({ status: undefined });
  const query = useProducts(list.params);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const prefetchProduct = usePrefetchProduct();
  const perms = usePermissions();

  // Creating a drop needs drop:manage at GLOBAL scope (admin-write-apis.md
  // §0), so an org-scoped Brand Admin browses the catalog without being
  // offered a button that would 403.
  const canCreate = perms.widestScope("drop") === "global" && perms.can("drop", "manage");

  /*
   * FILTERING — why brand and artist behave differently from status.
   *
   * `GET /admin/dashboard/products` accepts `page`, `limit` and `status`, and
   * nothing else. Its rows carry `organizationId` and `artistId` but no
   * category, rarity or price, so:
   *
   *   • status        → sent to the server, narrows the whole catalog.
   *   • brand, artist → applied here, to the page that came back.
   *   • category, rarity, price → not offered at all. The fields are not in
   *     the response, so a control for them could only ever filter on data
   *     the screen does not have. They belong here the moment the endpoint
   *     returns them.
   *
   * The distinction is not cosmetic and the screen says so out loud below:
   * a page-scoped filter that silently hides matches on page two is worse
   * than no filter, so the notice fires whenever more rows exist than the
   * page holds.
   */
  const [brandId, setBrandId] = React.useState<string | undefined>();
  const [artistId, setArtistId] = React.useState<string | undefined>();

  // Owner directories, for names on the rows and options in the pickers.
  // Both take `drop:read`, the same grant this page already required.
  const orgs = useAdminOrganizations();
  const artists = useAdminArtists(brandId);

  const orgName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orgs.data ?? []) map.set(o.id, o.name);
    return map;
  }, [orgs.data]);

  const artistName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of artists.data ?? []) map.set(a.id, a.name);
    return map;
  }, [artists.data]);

  const rows = React.useMemo(() => {
    const items = query.data?.items ?? [];
    return items.filter(
      (r) =>
        (!brandId || r.organizationId === brandId) &&
        (!artistId || r.artistId === artistId)
    );
  }, [query.data, brandId, artistId]);

  const ownerFiltered = !!brandId || !!artistId;
  const total = query.data?.total ?? 0;
  const loaded = query.data?.items.length ?? 0;
  // The honest part: there are rows this filter never saw.
  const beyondPage = ownerFiltered && total > loaded;

  const resetAll = () => {
    setBrandId(undefined);
    setArtistId(undefined);
    list.reset();
  };
  const anyActive = list.active || ownerFiltered;

  usePageChrome({
    title: "Drops",
    description:
      "Every drop in your scope, across all nine lifecycle states. Open one for its units and sales.",
  });

  /*
   * No Sold / Available / Sell-through columns here: this endpoint returns
   * the catalog record only. Those counts come from
   * GET /admin/products/:id -> performance, which is per-product, so they
   * live in the drawer. Rendering them here would mean showing zeroes for
   * fields the API never sent.
   */
  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Drop",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{r.name}</p>
          <Mono className="mt-0.5 text-[10px]">{r.groupCode}</Mono>
        </div>
      ),
    },
    {
      /*
       * The row carries ids only. Resolving them against the directories is
       * the difference between a uuid and a brand — and when the directory
       * has not loaded (or the caller's deployment predates those routes) the
       * short id is shown rather than an em dash, because "unknown name" and
       * "no owner" are different facts.
       */
      key: "owner",
      header: "Owner",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] text-[var(--text-1)]">
            {r.organizationId
              ? (orgName.get(r.organizationId) ?? shortId(r.organizationId))
              : "Unassigned"}
          </p>
          {r.artistId ? (
            <p className="truncate text-[10.5px] text-[var(--text-3)]">
              {artistName.get(r.artistId) ?? shortId(r.artistId)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge tone={toneForStatus(r.status)} dot>
          {humanize(r.status)}
        </Badge>
      ),
    },
    {
      key: "compliance",
      header: "Compliance",
      cell: (r) =>
        r.complianceStatus ? (
          <Badge tone={toneForStatus(r.complianceStatus)}>
            {humanize(r.complianceStatus)}
          </Badge>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">—</span>
        ),
    },
    {
      key: "supply",
      header: "Supply",
      numeric: true,
      cell: (r) => formatNumber(r.totalSupply),
    },
    {
      key: "age",
      header: "Age restriction",
      cell: (r) =>
        r.isAgeSpecific ? (
          <Tooltip content="Age-restricted. A release cannot be approved without a minimum age.">
            <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--warning-dim)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warning)]">
              <ShieldAlert className="h-3 w-3" aria-hidden />
              {r.minimumAge ? `${r.minimumAge}+` : "No minimum"}
            </span>
          </Tooltip>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">None</span>
        ),
    },
    {
      key: "published",
      header: "Published",
      cell: (r) => (
        <span className="tnum text-[12px] text-[var(--text-3)]">
          {formatDate(r.publishedAt)}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (r) => <span className="tnum text-[12px]">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "Action",
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setOpenId(r.id);
          }}
        >
          Action
        </Button>
      ),
    },
  ];

  return (
    <>
      {canCreate ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add drop
          </Button>
        </PageActions>
      ) : null}

      <Panel className="overflow-hidden">
        <FilterRow onReset={resetAll} active={anyActive}>
          <FilterSelect
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={DROP_STATUSES}
            allLabel="All states"
          />
          <FilterPicker
            label="Brand"
            value={brandId}
            onChange={(v) => {
              setBrandId(v);
              // The artist roster is scoped to the brand, so a selected artist
              // from another brand would filter every row away silently.
              setArtistId(undefined);
              // Owner filters narrow the CURRENT page, not the query — so
              // without this, picking a brand while on page 3 leaves the
              // operator stuck there with zero visible rows and no filter on
              // screen to explain why. Status already does this via
              // setFilter; these two are state outside that hook and need it
              // spelled out.
              list.setPage(1);
            }}
            options={(orgs.data ?? []).map((o) => ({
              value: o.id,
              label: `${o.name} · ${humanize(o.type)}`,
            }))}
            disabled={!orgs.data?.length}
            allLabel="All brands"
          />
          <FilterPicker
            label="Artist"
            value={artistId}
            onChange={(v) => {
              setArtistId(v);
              list.setPage(1);
            }}
            options={(artists.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
            disabled={!artists.data?.length}
            allLabel="All artists"
          />
        </FilterRow>

        {beyondPage ? (
          <p className="flex items-start gap-2 border-b border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
            <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Brand and artist narrow the {formatNumber(loaded)} drops on this page —
              the catalog endpoint takes neither as a query, so{" "}
              {formatNumber(total - loaded)} further{" "}
              {total - loaded === 1 ? "drop is" : "drops are"} outside this filter.
              Raise the page size, or narrow by status first.
            </span>
          </p>
        ) : null}

        {query.isLoading ? (
          <TableSkeleton rows={10} cols={9} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setOpenId(r.id)}
              // Mirrors the drawer's own first-page params — a prefetch under
              // any other key is a request the drawer will never read.
              onRowIntent={(r) => prefetchProduct(r.id, { skuPage: 1, skuLimit: 50 })}
              dimmed={query.isFetching}
              emptyState={
                <EmptyState
                  icon={Package}
                  title="No drops match these filters"
                  description={
                    ownerFiltered && loaded > 0
                      ? "No drop on this page carries that brand or artist. Others may exist further in the catalog."
                      : anyActive
                        ? "Try a different lifecycle state."
                        : "No drops exist in your scope yet."
                  }
                  action={
                    canCreate && !anyActive ? (
                      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                        Add the first drop
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
            <Pagination
              page={query.data?.page ?? 1}
              limit={query.data?.limit ?? 20}
              total={total}
              onPageChange={list.setPage}
              onLimitChange={list.setLimit}
            />
          </>
        )}
      </Panel>

      {creating ? (
        <ProductFormDrawer
          onClose={() => setCreating(false)}
          // Straight into the new drop, where Add SKUs lives — the workflow
          // continues rather than dumping the operator back on the list.
          onCreated={(id) => setOpenId(id)}
        />
      ) : null}

      {openId ? (
        <ProductDrawer productId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </>
  );
}
