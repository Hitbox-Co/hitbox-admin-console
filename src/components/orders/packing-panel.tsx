"use client";

import Link from "next/link";
import { ArrowRight, ScanLine } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useOrderUnit } from "@/lib/api/hooks";
import { formatDateTime } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import { Button, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { PackingSlipButton, UnitStateChip } from "@/components/packing/packing-ui";
import type { AdminOrderDetail } from "@/lib/types";

/**
 * The order page's view of packing (order-unit-assignment-api.md): what to
 * pick, whether the physical unit has been scanned, and a way into the
 * packing screen where the scanning happens. Hidden when the order holds no
 * stock (unpaid / cancelled).
 */
export function PackingPanel({ order }: { order: AdminOrderDetail }) {
  const perms = usePermissions();
  const canScan = perms.can("order", "manage");
  const query = useOrderUnit(order.id);
  const state = query.data;

  if (query.isLoading) {
    return (
      <Panel className="p-4">
        <Skeleton className="h-14 w-full rounded-[8px]" />
      </Panel>
    );
  }
  if (query.isError || !state) {
    return (
      <Panel className="px-4 py-3 text-[12px] text-[var(--text-3)]">
        Packing state unavailable. {query.error instanceof ApiError ? query.error.friendly : ""}
      </Panel>
    );
  }
  if (state.unitState === "NONE") return null;

  const assigned = state.unitState === "ASSIGNED";
  const shipped = state.status === "SHIPPED" || state.status === "DELIVERED";

  return (
    <Panel className={assigned ? "overflow-hidden" : "overflow-hidden border-[var(--accent)]"}>
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            Packing <UnitStateChip state={state.unitState} />
          </span>
        }
        action={
          perms.canOpen("/packing") && !shipped ? (
            <Button asChild variant={assigned ? "secondary" : "primary"} size="sm">
              <Link href={`/packing/${order.id}`}>
                <ScanLine className="h-3.5 w-3.5" />
                {assigned ? "Open packing" : canScan ? "Pack this order" : "View packing"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-3)]">Pick</p>
          <p className="text-[20px] font-bold text-[var(--text-1)]">{state.variantLabel ?? state.productName}</p>
          {assigned && state.unit ? (
            <p className="text-[12px] text-[var(--text-2)]">
              In the parcel: <span className="font-mono">{state.unit.skuCode}</span> (#{state.unit.serialNumber}) ·
              scanned {formatDateTime(state.unitAssignedAt)}
            </p>
          ) : (
            <p className="text-[12px] text-[var(--text-3)]">
              Not scanned yet — any matching item can go in. Shipping unlocks after the scan.
            </p>
          )}
        </div>
        <PackingSlipButton state={state} order={order} />
      </div>
    </Panel>
  );
}
