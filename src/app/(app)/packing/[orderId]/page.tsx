"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAdminOrder, useAssignOrderUnit, useOrderUnit } from "@/lib/api/hooks";
import { formatDateTime, humanize } from "@/lib/format";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import { PageGuard } from "@/components/layout/page-guard";
import { Badge, Button, Mono, Panel, PanelHeader, Skeleton, toneForStatus } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import {
  AvailableUnits,
  ConfirmDialog,
  PackedCard,
  PackingSlipButton,
  PickCard,
  ScanErrorCard,
  ScanStation,
  ShipAction,
  StatusFlow,
  failure,
  success,
  type Feedback,
  type ScanStationHandle,
} from "@/components/packing/packing-ui";
import type { AssignOrderUnitInput, UnitScan } from "@/lib/types";

/**
 * Packing one order (order-unit-assignment-api.md §5, §6).
 *
 *   PAID ──scan──▶ PROCESSING ──ship──▶ SHIPPED
 *
 * The PICK card is the biggest thing on the page: what to take off the shelf.
 * A PROVISIONAL order's unit is only checkout's placeholder, so it is never
 * shown as something to find — the packer takes ANY matching item.
 *
 * The scan box is always focused. A scan that hits an order already packed
 * with a DIFFERENT unit is refused (409 ORDERS_UNIT_ALREADY_ASSIGNED); the
 * page asks, and on confirm resends the same scan with replace: true.
 */
export default function PackingDetailPage() {
  return (
    <PageGuard can={(p) => p.canOpen("/packing")} what="Packing" requires="order:read">
      <Route />
    </PageGuard>
  );
}

function Route() {
  const { orderId } = useParams<{ orderId: string }>();
  return <PackingDetail key={orderId} orderId={orderId} />;
}

function scannedText(s: UnitScan) {
  return "tagId" in s && s.tagId ? s.tagId : "skuCode" in s && s.skuCode ? s.skuCode : `#${(s as { serialNumber: number }).serialNumber}`;
}

function PackingDetail({ orderId }: { orderId: string }) {
  const perms = usePermissions();
  const canScan = perms.can("order", "manage");
  const query = useOrderUnit(orderId);
  const order = useAdminOrder(orderId);
  const assign = useAssignOrderUnit(orderId);
  const state = query.data;
  const scanRef = React.useRef<ScanStationHandle>(null);

  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  /** The packer chose "Replace item": the next scan swaps the packed unit. */
  const [replaceNext, setReplaceNext] = React.useState(false);
  const [confirmReplaceItem, setConfirmReplaceItem] = React.useState(false);
  /** A scan refused because the order is already packed — asks before resending. */
  const [pendingReplace, setPendingReplace] = React.useState<{ body: UnitScan; assignedSkuCode: string | null } | null>(null);

  usePageChrome({
    title: state ? `Pack ${state.publicCode}` : "Packing",
    description: state ? state.productName : undefined,
  });

  const send = React.useCallback(
    (body: AssignOrderUnitInput) => {
      const label = scannedText(body);
      assign.mutate(body, {
        onSuccess: (s) => {
          setFeedback(success(s, label));
          setReplaceNext(false);
          setPendingReplace(null);
        },
        onError: (err) => {
          setFeedback(failure(err, label));
          if (err instanceof ApiError && err.code === "ORDERS_UNIT_ALREADY_ASSIGNED" && !body.replace) {
            const d = (err.details ?? {}) as { assignedSkuCode?: string | null };
            const { replace: _omit, ...scan } = body;
            void _omit;
            setPendingReplace({ body: scan as UnitScan, assignedSkuCode: d.assignedSkuCode ?? null });
          }
          if (err instanceof ApiError && err.code === "ORDERS_ASSIGN_CONFLICT") query.refetch();
          setTimeout(() => scanRef.current?.focus(), 0);
        },
      });
    },
    [assign, query]
  );

  const onScan = (scan: UnitScan) => send({ ...scan, ...(replaceNext ? { replace: true } : {}) } as AssignOrderUnitInput);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (query.isError || !state) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      </div>
    );
  }

  const assigned = state.unitState === "ASSIGNED";
  const shipped = state.status === "SHIPPED" || state.status === "DELIVERED";
  const scannable = canScan && state.unitState !== "NONE" && !shipped;

  return (
    <div className="space-y-4">
      <BackLink />

      {/* Header */}
      <Panel className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Mono className="text-[12px]">{state.publicCode}</Mono>
          <span className="text-[13px] font-medium text-[var(--text-1)]">{state.productName}</span>
          <Badge tone={toneForStatus(state.status)} dot>
            {humanize(state.status)}
          </Badge>
          <span className="text-[11.5px] text-[var(--text-3)]">placed {formatDateTime(state.placedAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusFlow status={state.status} />
          {perms.canOpen("/orders") ? (
            <Link
              href={`/orders/${orderId}`}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)]"
            >
              Order <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="min-w-0 space-y-4 xl:col-span-3">
          <PickCard state={state} />

          {state.unitState === "NONE" ? (
            <Panel className="px-4 py-3 text-[13px] text-[var(--text-2)]">
              Nothing to pack — this order holds no stock (unpaid or cancelled).
            </Panel>
          ) : null}

          {scannable ? (
            <Panel className="space-y-3 p-4">
              {replaceNext ? (
                <p className="flex items-center justify-between gap-2 rounded-[8px] bg-[var(--warning-dim)] px-3 py-2 text-[12.5px] text-[var(--text-1)]">
                  <span>
                    <strong>Replacing</strong> {state.unit?.skuCode} — scan the new item. The current one goes back into stock.
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setReplaceNext(false)}>
                    Cancel
                  </Button>
                </p>
              ) : null}
              <ScanStation
                ref={scanRef}
                busy={assign.isPending}
                productCode={state.productCode}
                onScan={onScan}
                allowSerial
                placeholder={assigned && !replaceNext ? "Already packed — scan to check, or use Replace item" : undefined}
              />
              {feedback?.kind === "error" ? (
                <ScanErrorCard feedback={feedback} expectedLabel={state.variantLabel} />
              ) : null}
            </Panel>
          ) : !canScan && state.unitState === "PROVISIONAL" ? (
            <Panel className="px-4 py-3 text-[12.5px] text-[var(--text-3)]">
              You can view this order. Scanning and shipping need order:manage.
            </Panel>
          ) : null}

          <PackedCard state={state}>
            <PackingSlipButton state={state} order={order.data} />
            {canScan && !shipped && !replaceNext ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirmReplaceItem(true)}>
                <RefreshCw className="h-3.5 w-3.5" />
                Replace item
              </Button>
            ) : null}
          </PackedCard>

          {state.unitState === "PROVISIONAL" && state.unit ? (
            <p className="text-[11.5px] text-[var(--text-3)]">
              Checkout is holding a placeholder unit for this order. It returns to stock when you scan
              a different matching item — you don&rsquo;t need to find it.
            </p>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4 xl:col-span-2">
          <Panel className="overflow-hidden">
            <PanelHeader title="Ship" description={state.readyToShip ? "Packed and ready." : shipped ? undefined : "Unlocks after the item is scanned."} />
            <div className="px-4 py-3">
              {canScan ? (
                <ShipAction orderId={orderId} readyToShip={state.readyToShip} status={state.status} />
              ) : (
                <p className="text-[12px] text-[var(--text-3)]">Shipping needs order:manage.</p>
              )}
            </div>
          </Panel>

          {scannable && (!assigned || replaceNext) ? (
            <AvailableUnits
              state={state}
              busy={assign.isPending}
              onPick={(skuCode) => send({ skuCode, ...(replaceNext ? { replace: true } : {}) })}
            />
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmReplaceItem}
        title="Replace the packed item?"
        body={
          <>
            The next scan swaps <span className="font-mono">{state.unit?.skuCode}</span> for the item you
            scan. The current one goes back into stock — take it out of the parcel.
          </>
        }
        confirmLabel="Scan replacement"
        onCancel={() => {
          setConfirmReplaceItem(false);
          scanRef.current?.focus();
        }}
        onConfirm={() => {
          setConfirmReplaceItem(false);
          setReplaceNext(true);
          setFeedback(null);
          setTimeout(() => scanRef.current?.focus(), 0);
        }}
      />

      <ConfirmDialog
        open={!!pendingReplace}
        title="This order is already packed"
        body={
          <>
            It&rsquo;s packed with{" "}
            <span className="font-mono">{pendingReplace?.assignedSkuCode ?? state.unit?.skuCode ?? "another unit"}</span>.
            Replace it with the item you just scanned? The current one goes back into stock.
          </>
        }
        confirmLabel="Replace it"
        busy={assign.isPending}
        onCancel={() => {
          setPendingReplace(null);
          scanRef.current?.focus();
        }}
        onConfirm={() => {
          if (pendingReplace) send({ ...pendingReplace.body, replace: true } as AssignOrderUnitInput);
        }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/packing"
      className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Packing queue
    </Link>
  );
}
