"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { variantName } from "@/components/supply/allotment-summary";
import type { BatchAllotment } from "@/lib/types";

/**
 * "Needs allotment increase" — shown when a consignment's `allotment.covered`
 * is false: the vendor booked past its allotment, which is allowed, but
 * HitBox can only ACCEPT once the allotment covers it (409
 * SUPPLY_ALLOTMENT_INSUFFICIENT otherwise). Rejecting is never blocked.
 *
 * The same block arrives as `allotment` on the consignment and as `details`
 * of that 409, so both render here.
 */
export function AllotmentCoverageBanner({
  allotment,
  audience,
  children,
}: {
  allotment: BatchAllotment;
  audience: "admin" | "vendor";
  /** The admin's action row. */
  children?: React.ReactNode;
}) {
  const short = allotment.variants.filter((v) => v.shortBy > 0);
  const total = allotment.total && allotment.total.shortBy > 0 ? allotment.total : null;

  return (
    <div className="rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--warning)]">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {audience === "admin" ? "Needs allotment increase" : "Awaiting allotment increase from HitBox"}
      </p>
      <p className="mt-1 text-[11.5px] text-[var(--text-2)]">
        {audience === "admin"
          ? "Accepting this would take the vendor past its allotment. Increase it to take the extra stock, or reject — rejecting is never blocked."
          : "This shipment goes beyond your allotment. That's fine — HitBox has to raise the allotment before it can accept it."}
      </p>
      <ul className="mt-1.5 space-y-0.5 text-[11.5px]">
        {short.map((v) => (
          <li key={v.variantId}>
            <span className="font-medium">{variantName(v)}</span> short by{" "}
            {formatNumber(v.shortBy)} — {formatNumber(v.required)} needed (
            {formatNumber(v.acceptedElsewhere)} accepted before + {formatNumber(v.thisBatch)}{" "}
            here) against {formatNumber(v.allotted ?? 0)} allotted
          </li>
        ))}
        {total ? (
          <li>
            Short by {formatNumber(total.shortBy)} — {formatNumber(total.required)} needed against{" "}
            {formatNumber(total.allotted ?? 0)} allotted
          </li>
        ) : null}
      </ul>
      {children ? <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Reads the coverage block out of a 409 SUPPLY_ALLOTMENT_INSUFFICIENT. */
export function isAllotmentBlock(details: unknown): details is BatchAllotment {
  return (
    !!details &&
    typeof details === "object" &&
    "covered" in details &&
    Array.isArray((details as BatchAllotment).variants)
  );
}
