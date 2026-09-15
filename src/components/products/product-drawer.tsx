"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Send, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAdminProduct,
  useArchiveProduct,
  useSubmitRelease,
} from "@/lib/api/hooks";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Mono,
  Panel,
  Skeleton,
  Tooltip,
  toneForStatus,
} from "@/components/ui/primitives";
import { MoneyValue } from "@/components/ui/money";
import { DataTable, Pagination, type Column } from "@/components/ui/table";
import { ErrorState } from "@/components/ui/states";
import { FilterSelect } from "@/components/ui/filters";
import { ProductGalleryPanel } from "./product-gallery-panel";
import { SkuUnitsPanel } from "./sku-units-panel";
import type { ProductSkuUnit } from "@/lib/types";

/**
 * Product detail: the catalog record, its performance aggregates and a
 * paginated page of serialized SKU units — one call.
 *
 * The six performance counts are read together server-side because they must
 * agree with each other; a screen that fetched inventory and sales separately
 * can render "500 minted, 620 sold" with both halves individually correct.
 *
 * Units are paginated rather than inlined: a 10,000-unit edition is a
 * legitimate drop and the payload must not grow with it.
 */

const CLAIMED_STATUSES = ["UNCLAIMED", "CLAIMED", "IN_TRANSFER", "FLAGGED"];

export function ProductDrawer({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const [skuPage, setSkuPage] = React.useState(1);
  const [skuLimit, setSkuLimit] = React.useState(50);
  const [claimedStatus, setClaimedStatus] = React.useState<string | undefined>();

  const query = useAdminProduct(productId, { skuPage, skuLimit, claimedStatus });
  const submitReview = useSubmitRelease();
  const archive = useArchiveProduct();
  const product = query.data;

  // Writes need drop:manage platform-wide (admin-write-apis.md §0).
  const canWrite = perms.widestScope("drop") === "global" && perms.can("drop", "manage");
  const canSubmit = perms.can("release-approval", "manage");
  // Mirrors buildSkuAccess: refuses PUBLIC visibility and OWN scope.
  const canReadUnits = perms.canReadUnits();

  const columns: Column<ProductSkuUnit>[] = [
    {
      key: "unit",
      header: "Unit",
      cell: (u) => (
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-[var(--text-1)]">
            {u.skuCode} <span className="text-[var(--text-3)]">#{u.serialNumber}</span>
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
      // The owner is resolved by email server-side: an operator looking at a
      // disputed unit needs a person, not a uuid.
      key: "owner",
      header: "Owner",
      cell: (u) =>
        u.ownerEmail ? (
          <div className="min-w-0">
            <p className="truncate text-[12px] text-[var(--text-1)]">{u.ownerEmail}</p>
            {u.ownerHandle ? (
              <p className="truncate text-[10.5px] text-[var(--text-3)]">@{u.ownerHandle}</p>
            ) : null}
          </div>
        ) : (
          <span className="text-[12px] text-[var(--text-3)]">Unowned</span>
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
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[760px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {product ? product.name : "Drop"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                {product ? (
                  <>
                    <Mono className="text-[10px]">{product.groupCode}</Mono>
                    <Badge tone={toneForStatus(product.status)} dot>
                      {humanize(product.status)}
                    </Badge>
                    {product.complianceStatus ? (
                      <Badge tone={toneForStatus(product.complianceStatus)}>
                        {humanize(product.complianceStatus)}
                      </Badge>
                    ) : null}
                  </>
                ) : null}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {query.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-[8px]" />
                ))}
              </div>
            ) : query.isError ? (
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            ) : product ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Minted" value={formatNumber(product.performance.skuTotal)} />
                  <Stat label="Claimed" value={formatNumber(product.performance.claimed)} />
                  <Stat label="Orders" value={formatNumber(product.performance.orders)} />
                  <Stat
                    label="Wishlists"
                    value={formatNumber(product.performance.wishlists)}
                  />
                  <Stat
                    label="Held"
                    value={formatNumber(product.performance.reservedHeld)}
                    hint="Temporary holds while payment settles."
                  />
                  <Stat
                    label="Committed"
                    value={formatNumber(product.performance.reservedCommitted)}
                  />
                  <Stat
                    label="Resale live"
                    value={formatNumber(product.performance.resaleActive)}
                  />
                  <Stat
                    label="Unclaimed"
                    value={formatNumber(product.performance.unclaimed)}
                  />
                </div>

                <Panel className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                    Revenue
                  </p>
                  <div className="mt-1">
                    {/* One row per currency. There is no FX rate in the system. */}
                    <MoneyValue money={product.performance.revenue} />
                  </div>
                  <p className="mt-1 text-[10.5px] text-[var(--text-3)]">
                    Excludes cancelled orders. Currencies are never combined.
                  </p>
                </Panel>

                {Object.keys(product.performance.ordersByStatus).length ? (
                  <Panel className="px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                      Orders by status
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {Object.entries(product.performance.ordersByStatus).map(([s, n]) => (
                        <Badge key={s} tone={toneForStatus(s)}>
                          {humanize(s)} {formatNumber(n)}
                        </Badge>
                      ))}
                    </div>
                  </Panel>
                ) : null}

                <Panel>
                  <dl className="divide-y divide-[var(--hairline)]">
                    {(
                      [
                        ["Supply", formatNumber(product.totalSupply)],
                        [
                          "Purchase limit",
                          product.purchaseLimit ? String(product.purchaseLimit) : "—",
                        ],
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
                        ["Odds disclosure", product.oddsDisclosureRef ?? "None"],
                        ["Release start", formatDateTime(product.releaseStart)],
                        ["Release end", formatDateTime(product.releaseEnd)],
                        ["Published", formatDateTime(product.publishedAt)],
                        ["Created", formatDate(product.createdAt)],
                      ] as [string, string][]
                    ).map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-baseline justify-between gap-4 px-3 py-2"
                      >
                        <dt className="shrink-0 text-[12px] text-[var(--text-3)]">{k}</dt>
                        <dd className="min-w-0 truncate text-right text-[12.5px] text-[var(--text-1)]">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Panel>

                <ProductGalleryPanel productId={productId} />

                {/*
                  Two sources for the same idea, and the richer one is gated
                  separately. /admin/products/:id/skus carries filters, a
                  summary and per-grant blocks, but needs
                  collectible-instance:read — HITBOX_CONTENT_MANAGER holds
                  drop:read and only collectible-instance:UPDATE, which does
                  not imply read, so it lands on the flat fallback below
                  rather than on a 403.
                */}
                {canReadUnits ? (
                  <SkuUnitsPanel
                    productId={productId}
                    totalSupply={product.totalSupply}
                    variants={product.variants ?? []}
                  />
                ) : (
                <Panel className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 border-b border-[var(--hairline)] px-3 py-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                      SKU units
                    </p>
                    <FilterSelect
                      label="Claimed"
                      value={claimedStatus}
                      onChange={(v) => {
                        setClaimedStatus(v);
                        setSkuPage(1);
                      }}
                      options={CLAIMED_STATUSES}
                      allLabel="Any"
                    />
                  </div>
                  <DataTable
                    columns={columns}
                    rows={product.skuUnits.items}
                    getRowKey={(u) => u.skuId}
                    dimmed={query.isFetching}
                  />
                  <Pagination
                    page={product.skuUnits.page}
                    limit={product.skuUnits.limit}
                    total={product.skuUnits.total}
                    onPageChange={setSkuPage}
                    onLimitChange={(n) => {
                      setSkuLimit(n);
                      setSkuPage(1);
                    }}
                  />
                </Panel>
                )}
              </>
            ) : null}
          </div>

          {product ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
              {canSubmit ? (
                <Tooltip content="Opens version N+1 of the review and moves the drop to SUBMITTED, in one transaction.">
                  <span>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={submitReview.isPending}
                      onClick={() =>
                        submitReview.mutate(
                          { productId },
                          {
                            onSuccess: () => toast.success("Submitted for review"),
                            onError: (err) => {
                              // 409 means an undecided review already exists.
                              if (err instanceof ApiError && err.status === 409) {
                                toast.error(
                                  "This drop already has an open review — decide that one first."
                                );
                                return;
                              }
                              toast.error(
                                err instanceof ApiError
                                  ? err.friendly
                                  : "Could not submit for review."
                              );
                            },
                          }
                        )
                      }
                    >
                      <Send className="h-3.5 w-3.5" />
                      Submit for review
                    </Button>
                  </span>
                </Tooltip>
              ) : null}

              {canWrite && !product.archivedAt ? (
                <Tooltip content="Soft archive — sets archivedAt, isActive false and status ARCHIVED.">
                  <span className="ml-auto">
                    <Button
                      variant="danger"
                      size="sm"
                      loading={archive.isPending}
                      onClick={() =>
                        archive.mutate(productId, {
                          onSuccess: () => {
                            toast.success("Drop archived");
                            onClose();
                          },
                          onError: (err) =>
                            toast.error(
                              err instanceof ApiError
                                ? err.friendly
                                : "Could not archive the drop."
                            ),
                        })
                      }
                    >
                      Archive
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const body = (
    <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-2">
      <p className="text-[10.5px] uppercase tracking-wide text-[var(--text-3)]">{label}</p>
      <p className="tnum mt-0.5 text-[15px] font-semibold text-[var(--text-1)]">{value}</p>
    </div>
  );
  return hint ? <Tooltip content={hint}>{body}</Tooltip> : body;
}
