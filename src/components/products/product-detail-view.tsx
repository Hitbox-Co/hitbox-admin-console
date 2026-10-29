"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArrowLeft, Pencil, ShieldAlert } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAdminArtists,
  useAdminOrganizations,
  useAdminProduct,
  useArchiveProduct,
  useLatestRelease,
} from "@/lib/api/hooks";
import { mintGate } from "@/lib/mint-gate";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Mono,
  Panel,
  PanelHeader,
  Skeleton,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { MoneyValue } from "@/components/ui/money";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { ErrorState } from "@/components/ui/states";
import { FilterSelect } from "@/components/ui/filters";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProductAllotmentPanel } from "./product-allotment-panel";
import { ProductGalleryPanel } from "./product-gallery-panel";
import { ProductLifecyclePanel } from "./product-lifecycle-panel";
import { ProductPricingPanel } from "./product-pricing-panel";
import { ProductVariantsPanel } from "./product-variants-panel";
import { DropTypeBadge } from "./variant-bits";
import { SkuUnitsPanel } from "./sku-units-panel";
import { RewardPointsBadge, RewardPointsPanel } from "./reward-points";
import type { AdminProductDetail, ProductSkuUnit } from "@/lib/types";

/**
 * The drop, as a page: catalog record, lifecycle, SKU allotment, pricing,
 * gallery and serialized units.
 *
 * The performance counts come back together in one call because they must
 * agree with each other — a screen that fetched inventory and sales
 * separately can render "500 minted, 620 sold" with both halves individually
 * correct. Units are paginated, never inlined: a 10,000-unit edition is a
 * legitimate drop.
 *
 * Layout: the questions an operator arrives with, in order — what is it and
 * where is it in its lifecycle (header, right rail), how is the edition
 * distributed (allotment), then the records they edit (units, prices, art).
 */

const CLAIMED_STATUSES = ["UNCLAIMED", "CLAIMED", "IN_TRANSFER", "FLAGGED"];

export function ProductDetailView({ productId }: { productId: string }) {
  const perms = usePermissions();
  const router = useRouter();
  const [skuPage, setSkuPage] = React.useState(1);
  const [skuLimit, setSkuLimit] = React.useState(50);
  const [claimedStatus, setClaimedStatus] = React.useState<string | undefined>();

  // Same first-page params the list prefetches on hover.
  const query = useAdminProduct(productId, { skuPage, skuLimit, claimedStatus });
  const product = query.data;
  // The latest review gates minting and publishing alike. Same query key as
  // the lifecycle panel's, so this is one request, not two.
  const canReadReviews = perms.canRead("release-approval");
  const latestReview = useLatestRelease(productId, canReadReviews);

  usePageChrome({
    title: product?.name ?? "Drop",
    description: product ? `Drop ${product.groupCode}` : undefined,
  });

  if (query.isLoading) return <DetailSkeleton />;

  if (query.isError || !product) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      </div>
    );
  }

  // Catalog writes (edit, archive, publish) are globalOnly routes.
  const canWrite = perms.canManageCatalog();
  // Mirrors buildSkuAccess: refuses PUBLIC visibility and OWN scope.
  const canReadUnits = perms.canReadUnits();
  const archived = !!product.archivedAt || product.status === "ARCHIVED";
  // Minting waits for the owner's approval (drop-approval-lifecycle.md §10).
  const gate = mintGate(product, latestReview.data, canReadReviews);

  return (
    <div className="space-y-4">
      {canWrite ? (
        <PageActions>
          {!archived ? (
            <ArchiveButton productId={productId} onDone={() => router.push("/products")} />
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(`/products/${productId}/edit`)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit details
          </Button>
        </PageActions>
      ) : null}

      <BackLink />

      <Header product={product} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Minted"
          value={formatNumber(product.performance.skuTotal)}
          hint={
            product.totalSupply > 0
              ? `of ${formatNumber(product.totalSupply)} declared`
              : "No declared cap"
          }
        />
        <StatCard
          label="Claimed"
          value={formatNumber(product.performance.claimed)}
          hint={
            product.performance.skuTotal > 0
              ? `${((product.performance.claimed / product.performance.skuTotal) * 100).toFixed(1)}% of minted`
              : "Nothing minted yet"
          }
        />
        <StatCard
          label="Orders"
          value={formatNumber(product.performance.orders)}
          hint={`${formatNumber(product.performance.wishlists)} on wishlists`}
        />
        <StatCard
          label="Revenue"
          // One row per currency. There is no FX rate in the system.
          value={<MoneyValue money={product.performance.revenue} />}
          hint="Excludes cancelled orders"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <ProductAllotmentPanel product={product} mintGate={gate} />
          <ProductVariantsPanel product={product} />

          <ProductPricingPanel productId={productId} variants={product.variants ?? []} />
          <ProductGalleryPanel productId={productId} />


          {canReadUnits ? (
            <SkuUnitsPanel
              productId={productId}
              totalSupply={product.totalSupply}
              variants={product.variants ?? []}
              variantMode={product.dropType?.variantMode ?? null}
              mintGate={gate}
            />
          ) : (
            <FlatUnits
              product={product}
              fetching={query.isFetching}
              claimedStatus={claimedStatus}
              onClaimedStatus={(v) => {
                setClaimedStatus(v);
                setSkuPage(1);
              }}
              onPage={setSkuPage}
              onLimit={(n) => {
                setSkuLimit(n);
                setSkuPage(1);
              }}
            />
          )}
         
        </div>

        <aside className="min-w-0 space-y-4">
          <ProductLifecyclePanel product={product} />
          <RewardPointsPanel product={product} />
          <DetailsPanel product={product} />
          <ActivityPanel product={product} />
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/products"
      className="inline-flex items-center gap-1.5 text-[12px] text-text-3 transition-colors hover:text-text-1"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All drops
    </Link>
  );
}

function Header({ product }: { product: AdminProductDetail }) {
  // Names, not uuids. Both directories take drop:read, which this page needs.
  const orgs = useAdminOrganizations();
  const artists = useAdminArtists(undefined);
  const org = (orgs.data ?? []).find((o) => o.id === product.organizationId);
  const artist = (artists.data ?? []).find((a) => a.id === product.artistId);
  const archived = !!product.archivedAt || product.status === "ARCHIVED";

  return (
    <Panel className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="text-[11px]">{product.groupCode}</Mono>
            <DropTypeBadge type={product.dropType} />
            <Badge tone={toneForStatus(product.status)} dot>
              {humanize(product.status)}
            </Badge>
            {product.complianceStatus ? (
              <Badge tone={toneForStatus(product.complianceStatus)}>
                Compliance {humanize(product.complianceStatus).toLowerCase()}
              </Badge>
            ) : null}
            {archived ? <Badge tone="danger">Archived</Badge> : null}
            <RewardPointsBadge points={product.rewardPoints} />
            {!product.isActive && !archived ? (
              <Tooltip content="isActive is off — the catalog hides this drop regardless of status.">
                <span>
                  <Badge tone="warning">Inactive</Badge>
                </span>
              </Tooltip>
            ) : null}
            {product.isAgeSpecific ? (
              <Badge tone="warning">
                <ShieldAlert className="h-3 w-3" aria-hidden />
                {product.minimumAge ? `${product.minimumAge}+` : "Age-restricted, no minimum"}
              </Badge>
            ) : null}
          </div>
          {product.description ? (
            <p className="max-w-3xl text-[13px] leading-relaxed text-text-2">
              {product.description}
            </p>
          ) : (
            <p className="text-[12.5px] text-text-3">No description.</p>
          )}
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:text-right">
          <dt className="text-text-3">Brand</dt>
          <dd className="text-text-1">
            {org ? org.name : product.organizationId ? "—" : "Unassigned"}
          </dd>
          <dt className="text-text-3">Artist</dt>
          <dd className="text-text-1">
            {artist ? artist.name : product.artistId ? "—" : "Unassigned"}
          </dd>
          <dt className="text-text-3">Published</dt>
          <dd className="tnum text-text-1">{formatDate(product.publishedAt)}</dd>
        </dl>
      </div>
    </Panel>
  );
}

function DetailsPanel({ product }: { product: AdminProductDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Drop type", product.dropType ? product.dropType.name : "Untyped (legacy)"],
    ["Variants", formatNumber((product.variants ?? []).length)],
    ["Supply", product.totalSupply ? formatNumber(product.totalSupply) : "Not declared"],
    ["Purchase limit", product.purchaseLimit ? String(product.purchaseLimit) : "Unlimited"],
    ["Category", product.category ?? "—"],
    ["Rarity", product.rarity ?? "—"],
    ["Vertical", product.vertical ?? "—"],
    [
      "Age restriction",
      product.isAgeSpecific
        ? product.minimumAge
          ? `${product.minimumAge}+`
          : "Age-specific, no minimum"
        : "None",
    ],
    [
      "Odds disclosure",
      product.oddsDisclosureRef ? (
        <a
          href={product.oddsDisclosureRef}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          View
        </a>
      ) : (
        "None"
      ),
    ],
    ["Release start", formatDateTime(product.releaseStart)],
    ["Release end", formatDateTime(product.releaseEnd)],
    ["Published", formatDateTime(product.publishedAt)],
    ["Created", formatDate(product.createdAt)],
    ["Updated", formatDateTime(product.updatedAt)],
  ];

  return (
    <Panel>
      <PanelHeader title="Details" />
      <dl className="divide-y divide-hairline">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2">
            <dt className="shrink-0 text-[12px] text-text-3">{k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-text-1">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function ActivityPanel({ product }: { product: AdminProductDetail }) {
  const p = product.performance;
  const items: [string, number, string?][] = [
    ["Unclaimed", p.unclaimed],
    ["Held", p.reservedHeld, "Temporary holds while payment settles."],
    ["Committed", p.reservedCommitted],
    ["Resale live", p.resaleActive],
    ["Wishlists", p.wishlists],
  ];
  return (
    <Panel>
      <PanelHeader title="Commerce" />
      <div className="grid grid-cols-2 gap-2 p-3">
        {items.map(([label, value, hint]) => {
          const tile = (
            <div className="rounded-[8px] border border-hairline bg-surface-2 px-2.5 py-2">
              <p className="text-[10.5px] uppercase tracking-wide text-text-3">{label}</p>
              <p className="tnum mt-0.5 text-[15px] font-semibold text-text-1">
                {formatNumber(value)}
              </p>
            </div>
          );
          return hint ? (
            <Tooltip key={label} content={hint}>
              {tile}
            </Tooltip>
          ) : (
            <React.Fragment key={label}>{tile}</React.Fragment>
          );
        })}
      </div>
    </Panel>
  );
}

/** Two clicks: archiving takes the drop out of every workflow. */
function ArchiveButton({ productId, onDone }: { productId: string; onDone: () => void }) {
  const archive = useArchiveProduct();
  const [confirming, setConfirming] = React.useState(false);

  if (!confirming) {
    return (
      <Tooltip content="Soft archive — sets archivedAt, isActive false and status ARCHIVED.">
        <span>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            <Archive className="h-3.5 w-3.5" />
            Archive
          </Button>
        </span>
      </Tooltip>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      <Button
        variant="danger"
        size="sm"
        loading={archive.isPending}
        onClick={() =>
          archive.mutate(productId, {
            onSuccess: () => {
              toast.success("Drop archived");
              onDone();
            },
            onError: (err) => {
              setConfirming(false);
              toast.error(err instanceof ApiError ? err.friendly : "Could not archive the drop.");
            },
          })
        }
      >
        Confirm archive
      </Button>
    </span>
  );
}

/** The drop:read fallback — the flat, paginated units on the detail itself. */
function FlatUnits({
  product,
  fetching,
  claimedStatus,
  onClaimedStatus,
  onPage,
  onLimit,
}: {
  product: AdminProductDetail;
  fetching: boolean;
  claimedStatus: string | undefined;
  onClaimedStatus: (v: string | undefined) => void;
  onPage: (n: number) => void;
  onLimit: (n: number) => void;
}) {
  const columns: Column<ProductSkuUnit>[] = [
    {
      key: "unit",
      header: "Unit",
      cell: (u) => (
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-text-1">
            {u.skuCode} <span className="text-text-3">#{u.serialNumber}</span>
          </p>
          {u.tagId ? <Mono className="mt-0.5 text-[10px]">{u.tagId}</Mono> : null}
        </div>
      ),
    },
    {
      key: "claimed",
      header: "Claimed",
      cell: (u) => (
        <Badge tone={toneForStatus(u.claimedStatus)} dot>
          {humanize(u.claimedStatus)}
        </Badge>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (u) =>
        u.ownerEmail ? (
          <div className="min-w-0">
            <p className="truncate text-[12px] text-text-1">{u.ownerEmail}</p>
            {u.ownerHandle ? (
              <p className="truncate text-[10.5px] text-text-3">@{u.ownerHandle}</p>
            ) : null}
          </div>
        ) : (
          <span className="text-[12px] text-text-3">Unowned</span>
        ),
    },
    {
      key: "state",
      header: "State",
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.tagLifecycleState ? (
            <Badge tone={toneForStatus(u.tagLifecycleState)} className="px-1 py-0 text-[10px]">
              {humanize(u.tagLifecycleState)}
            </Badge>
          ) : null}
          {u.resaleBlocked ? (
            <Tooltip content={u.resaleBlockedReason ?? "Resale is blocked on this unit."}>
              <span>
                <Badge tone="danger" className="px-1 py-0 text-[10px]">
                  Resale blocked
                </Badge>
              </span>
            </Tooltip>
          ) : null}
          {u.tamperStatus ? (
            <Badge tone="warning" className="px-1 py-0 text-[10px]">
              {humanize(u.tamperStatus)}
            </Badge>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-3">
          Serialized units
        </p>
        <FilterSelect
          label="Claimed"
          value={claimedStatus}
          onChange={onClaimedStatus}
          options={CLAIMED_STATUSES}
          allLabel="Any"
        />
      </div>
      <DataTable
        columns={columns}
        rows={product.skuUnits.items}
        getRowKey={(u) => u.skuId}
        dimmed={fetching}
      />
      <Pagination
        page={product.skuUnits.page}
        limit={product.skuUnits.limit}
        total={product.skuUnits.total}
        onPageChange={onPage}
        onLimitChange={onLimit}
      />
    </Panel>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-xl xl:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
