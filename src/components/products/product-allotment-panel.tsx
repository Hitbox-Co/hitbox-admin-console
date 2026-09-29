"use client";

import * as React from "react";
import { Boxes, Info } from "lucide-react";
import { useProductSkuSummary } from "@/lib/api/hooks";
import { formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import { Panel, PanelHeader, Skeleton, Tooltip } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import {
  Meter,
  PipelineBar,
  RankedBarChart,
  type PipelineSegment,
} from "@/components/charts/charts";
import { SERIES, STATUS } from "@/components/charts/palette";
import type { MintGate } from "@/lib/mint-gate";
import type { AdminProductDetail } from "@/lib/types";

/**
 * SKU allotment — where every unit of the edition is, drawn from two sources:
 *
 *   performance (on the product detail)  drop:read — everyone on this page
 *   skus/summary                         collectible-instance:read, and
 *                                        tag counts only with nfc-tag-claim
 *
 * The summary is one grouped query server-side, so its counts agree with
 * each other; counting a paged list client-side would not. Blocks the caller
 * may not see are ABSENT from the summary, and a chart is only drawn for data
 * that came back — an absent block is never rendered as zero.
 *
 * Charts follow the dataviz rules the dashboard uses: part-to-whole as a
 * labelled pipeline bar (never a pie), magnitude as ranked bars, a single
 * ratio as a meter. Status colours only ever mean state.
 */

/** Fixed per state, so the same state is the same colour on every drop. */
const CLAIM_COLOR: Record<string, string> = {
  CLAIMED: SERIES[0],
  UNCLAIMED: STATUS.neutral,
  IN_TRANSFER: STATUS.info,
  FLAGGED: STATUS.serious,
};
const UNMINTED_COLOR = "rgba(255,255,255,0.08)";

export function ProductAllotmentPanel({
  product,
  mintGate,
}: {
  product: AdminProductDetail;
  mintGate?: MintGate;
}) {
  const perms = usePermissions();
  const canReadUnits = perms.canReadUnits();
  const summaryQuery = useProductSkuSummary(product.id, canReadUnits);
  const summary = canReadUnits ? summaryQuery.data : undefined;

  const perf = product.performance;
  const minted = summary?.total ?? perf.skuTotal;
  const supply = product.totalSupply;
  const unminted = supply > 0 ? Math.max(supply - minted, 0) : 0;

  // By claim status: the summary's grouping when readable, else the two
  // counts every drop:read caller gets, with any remainder kept visible
  // rather than silently dropped.
  const claimSegments: PipelineSegment[] = React.useMemo(() => {
    if (summary) {
      return Object.entries(summary.byClaimedStatus)
        .sort(([, a], [, b]) => b - a)
        .map(([k, n], i) => ({
          label: humanize(k),
          value: n,
          color: CLAIM_COLOR[k] ?? SERIES[(i + 1) % SERIES.length],
        }));
    }
    const other = Math.max(perf.skuTotal - perf.claimed - perf.unclaimed, 0);
    return [
      { label: "Claimed", value: perf.claimed, color: CLAIM_COLOR.CLAIMED },
      { label: "Unclaimed", value: perf.unclaimed, color: CLAIM_COLOR.UNCLAIMED },
      ...(other > 0 ? [{ label: "Other", value: other, color: STATUS.warning }] : []),
    ];
  }, [summary, perf]);

  const allotment: PipelineSegment[] =
    supply > 0 ? [...claimSegments, { label: "Not minted", value: unminted, color: UNMINTED_COLOR }] : claimSegments;

  const tagStates = summary?.byTagLifecycleState
    ? Object.entries(summary.byTagLifecycleState)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => ({ name: humanize(k), value: n }))
    : [];

  const orders = Object.entries(perf.ordersByStatus)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({ name: humanize(k), value: n }));

  const reserved = perf.reservedHeld + perf.reservedCommitted;

  if (canReadUnits && summaryQuery.isLoading) {
    return (
      <Panel className="p-4">
        <Skeleton className="mb-3 h-4 w-40" />
        <Skeleton className="h-24 w-full rounded-[8px]" />
      </Panel>
    );
  }

  if (minted === 0) {
    return (
      <Panel>
        <PanelHeader title="SKU allotment" description="How the edition is distributed." />
        <EmptyState
          icon={Boxes}
          title="No units minted yet"
          description={
            mintGate?.state === "blocked"
              ? `${mintGate.reason ?? "Waiting on the owner's approval."}${
                  supply > 0 ? ` The drop declares ${formatNumber(supply)} units.` : ""
                }`
              : supply > 0
                ? `The drop declares ${formatNumber(supply)} units and none exist yet. Mint them from Serialized units — a drop with declared supply cannot be published with nothing to deliver.`
                : "This edition declares no size and has no units. Mint them from Serialized units."
          }
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="SKU allotment"
        description={
          supply > 0
            ? `${formatNumber(minted)} of ${formatNumber(supply)} declared units minted.`
            : `${formatNumber(minted)} units minted · no declared cap.`
        }
      />

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 px-4 py-4 lg:grid-cols-2">
        <Section title="Supply">
          {supply > 0 ? (
            <Meter
              value={minted}
              max={supply}
              label="Minted against declared supply"
              hint={
                unminted === 0
                  ? "Fully minted."
                  : `${formatNumber(unminted)} still to mint.`
              }
            />
          ) : (
            <p className="text-[12px] text-[var(--text-3)]">
              No supply is declared, so there is no cap to measure against.
            </p>
          )}
          <Meter
            value={reserved}
            max={Math.max(minted, reserved)}
            label="Reserved"
            color={STATUS.warning}
            hint={`${formatNumber(perf.reservedHeld)} held while payment settles · ${formatNumber(perf.reservedCommitted)} committed.`}
          />
          <Meter
            value={perf.resaleActive}
            max={minted}
            label="Listed for resale"
            color={SERIES[2]}
          />
        </Section>

        <Section
          title="Allotment by claim status"
          hint={
            supply > 0
              ? "Every declared unit, including those not minted yet."
              : "Every minted unit."
          }
        >
          <PipelineBar segments={allotment} total={supply > 0 ? supply : undefined} />
        </Section>

        {summary && summary.tagged !== undefined && summary.untagged !== undefined ? (
          <Section title="NFC tag coverage" hint="A unit without a bound chip cannot be claimed by a tap.">
            <PipelineBar
              segments={[
                { label: "Tagged", value: summary.tagged, color: SERIES[0] },
                { label: "Untagged", value: summary.untagged, color: STATUS.warning },
              ]}
            />
          </Section>
        ) : null}

        {tagStates.length ? (
          <Section title="Tag lifecycle">
            <RankedBarChart
              data={tagStates}
              valueLabel="Units"
              height={Math.max(96, tagStates.length * 30)}
            />
          </Section>
        ) : null}

        {orders.length ? (
          <Section title="Orders by status" hint="Cancelled orders are counted here but excluded from revenue.">
            <RankedBarChart
              data={orders}
              valueLabel="Orders"
              height={Math.max(96, orders.length * 30)}
            />
          </Section>
        ) : null}
      </div>

      {!canReadUnits ? (
        <p className="flex items-start gap-2 border-t border-[var(--hairline)] px-4 py-2.5 text-[11px] leading-relaxed text-[var(--text-3)]">
          <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
          The per-status breakdown and tag coverage need collectible-instance:read; this
          shows the counts on the drop itself.
        </p>
      ) : null}
    </Panel>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const heading = (
    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">{title}</p>
  );
  return (
    <section className="space-y-3">
      {hint ? (
        <Tooltip content={hint}>
          <span className="inline-block cursor-help">{heading}</span>
        </Tooltip>
      ) : (
        heading
      )}
      {children}
    </section>
  );
}
