"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { Mono } from "@/components/ui/primitives";
import type { VendorDropAssignment, VendorVariantAllotment } from "@/lib/types";

/**
 * Allotted / booked / remaining for one vendor's drop, drop-level and per
 * variant. Shared by the admin vendor drawer and the vendor portal — both
 * read the same assignment shape.
 *
 * Booking past the allotment is allowed, so `overBooked` is a warning, not an
 * error. It is read PER VARIANT: drop-level progress compares totals only and
 * can show nothing over while one size is 20 over.
 */
export function AllotmentSummary({
  assignment: a,
  audience = "admin",
}: {
  assignment: VendorDropAssignment;
  /** Words the warning for the person who has to act on it. */
  audience?: "admin" | "vendor";
}) {
  const p = a.progress;
  const over = a.byVariant
    ? a.variants.filter((v) => v.overBooked > 0)
    : p.overBooked > 0
      ? [null]
      : [];
  const overUnits = a.byVariant
    ? a.variants.reduce((sum, v) => sum + v.overBooked, 0)
    : p.overBooked;

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[11.5px] text-[var(--text-2)]">
        {p.allotted === null ? (
          <>
            No cap · <span className="tnum">{formatNumber(p.booked)}</span> booked
          </>
        ) : (
          <>
            <span className="tnum">{formatNumber(p.booked)}</span> of{" "}
            <span className="tnum">{formatNumber(p.allotted)}</span> booked ·{" "}
            <span className={cn("tnum", p.remaining === 0 && "text-[var(--text-3)]")}>
              {formatNumber(p.remaining)} left
            </span>
          </>
        )}
        <span className="text-[var(--text-3)]">
          {" "}
          · {formatNumber(p.approved)} approved · {formatNumber(p.registered)} chips (
          {formatNumber(p.accepted)} passed QC)
        </span>
      </p>
      {p.allotted ? <ProgressBar value={p.booked} max={p.allotted} /> : null}

      {over.length > 0 ? (
        <p className="flex items-start gap-1.5 rounded-[6px] bg-[var(--warning-dim)] px-2 py-1.5 text-[11.5px] leading-relaxed text-[var(--warning)]">
          <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0" aria-hidden />
          <span>
            {formatNumber(overUnits)} booked beyond the allotment
            {a.byVariant
              ? ` on ${(over as VendorVariantAllotment[]).map(variantName).join(", ")}`
              : ""}
            .{" "}
            {audience === "admin"
              ? "Increase the allotment before accepting the extra."
              : "That's allowed — HitBox has to raise your allotment before it can accept the extra."}
          </span>
        </p>
      ) : null}

      {a.byVariant && a.variants.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-[11.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--text-3)]">
                <th className="py-1 font-medium">Variant</th>
                <th className="py-1 text-right font-medium">Allotted</th>
                <th className="py-1 text-right font-medium">Booked</th>
                <th className="py-1 text-right font-medium">Left</th>
                <th className="py-1 text-right font-medium">Over</th>
                <th className="py-1 text-right font-medium">Approved</th>
                <th className="py-1 text-right font-medium">Chips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {a.variants.map((v) => (
                <tr key={v.variantId} className={cn(v.overBooked > 0 && "bg-[var(--warning-dim)]")}>
                  <td className="py-1 pl-1 pr-2">
                    <span className="text-[var(--text-1)]">{variantName(v)}</span>{" "}
                    {v.variantCode ? (
                      <Mono className="text-[9.5px]">{v.variantCode}</Mono>
                    ) : (
                      <span className="text-[10.5px] text-[var(--text-3)]">not allotted</span>
                    )}
                  </td>
                  <Num value={v.allotted} />
                  <Num value={v.booked} />
                  <Num value={v.remaining} muted={v.remaining === 0} />
                  <td
                    className={cn(
                      "tnum py-1 text-right",
                      v.overBooked > 0 ? "font-medium text-[var(--warning)]" : "text-[var(--text-3)]"
                    )}
                  >
                    {v.overBooked > 0 ? `+${formatNumber(v.overBooked)}` : "—"}
                  </td>
                  <Num value={v.approved} />
                  <Num value={v.registered} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/** A variant booked without an allotment has no code or label — fall back to its id. */
export function variantName(v: { variantId: string; label: string | null; variantCode?: string | null }) {
  return v.label ?? v.variantCode ?? `Variant ${v.variantId.slice(0, 8)}`;
}

function Num({ value, muted }: { value: number | null; muted?: boolean }) {
  return (
    <td
      className={cn(
        "tnum py-1 text-right",
        muted ? "text-[var(--text-3)]" : "text-[var(--text-2)]"
      )}
    >
      {value === null ? "—" : formatNumber(value)}
    </td>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn(
          "h-full rounded-full",
          value > max ? "bg-[var(--warning)]" : "bg-[var(--accent)]"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
