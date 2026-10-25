"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { SupplyBatch, SupplyBatchLine } from "@/lib/types";

/**
 * The consignment lifecycle (vendor-onboarding-flow.md, Steps 6–9):
 *
 *   vendor books ─▶ UPLOADED ─▶ VALIDATED ─▶ (every unit chipped) ─▶ ACCEPTED
 *                      │            │
 *                      └────────────┴──▶ REJECTED
 *
 * "Chips uploaded" is not a status of its own: it is VALIDATED with every
 * declared unit carrying a chip (per variant line, rowsReceived == quantity,
 * FAILED-QC rows included). Accepting needs it — 409
 * SUPPLY_MANIFEST_INCOMPLETE otherwise.
 */

/** Every declared unit has a chip row — what ACCEPTED requires. */
export function manifestComplete(batch: SupplyBatch): boolean {
  const lines = batch.lines ?? [];
  if (lines.length > 0) return lines.every((l) => l.rowsReceived >= l.quantity);
  return batch.quantity > 0 && batch.rowsReceived >= batch.quantity;
}

export function lineLabel(l: Pick<SupplyBatchLine, "variantId" | "label" | "variantCode">): string {
  return l.label ?? l.variantCode ?? `Variant ${l.variantId.slice(0, 8)}`;
}

/** "Red / S 3/3, Red / M 3/3 (1 failed QC), Red / L 3/3". */
export function chipProgressText(
  batch: Pick<SupplyBatch, "lines" | "quantity" | "rowsReceived" | "rowsRejected">
): string {
  const lines = batch.lines ?? [];
  const one = (name: string | null, got: number, of: number, failed: number) =>
    `${name ? `${name} ` : ""}${formatNumber(got)}/${formatNumber(of)}${
      failed > 0 ? ` (${formatNumber(failed)} failed QC)` : ""
    }`;
  if (lines.length === 0) {
    return one(null, batch.rowsReceived, batch.quantity, batch.rowsRejected);
  }
  return lines
    .map((l) => one(lineLabel(l), l.rowsReceived, l.quantity, l.rowsRejected))
    .join(", ");
}

const STEPS = ["Booked", "Validated", "Chips uploaded", "Accepted"] as const;

export function ConsignmentStepper({ batch }: { batch: SupplyBatch }) {
  const rejected = batch.status === "REJECTED";
  const complete = manifestComplete(batch);
  // How many steps are done.
  const done =
    batch.status === "ACCEPTED"
      ? 4
      : batch.status === "VALIDATED"
        ? complete
          ? 3
          : 2
        : 1;

  return (
    <ol className="flex items-center gap-1.5" aria-label="Consignment progress">
      {STEPS.map((label, i) => {
        const isDone = !rejected && i < done;
        const isCurrent = !rejected && i === done;
        const isRejectedHere = rejected && i === Math.min(done, 1);
        return (
          <React.Fragment key={label}>
            {i > 0 ? (
              <span
                aria-hidden
                className={cn(
                  "h-px min-w-3 flex-1",
                  isDone ? "bg-[var(--accent)]" : "bg-[var(--hairline-strong)]"
                )}
              />
            ) : null}
            <li
              className={cn(
                "flex shrink-0 items-center gap-1.5 text-[11.5px]",
                isDone
                  ? "text-[var(--text-1)]"
                  : isCurrent
                    ? "font-medium text-[var(--text-1)]"
                    : isRejectedHere
                      ? "font-medium text-[var(--danger)]"
                      : "text-[var(--text-3)]"
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full border text-[9px]",
                  isDone
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : isRejectedHere
                      ? "border-[var(--danger)] bg-[var(--danger-dim)]"
                      : isCurrent
                        ? "border-[var(--accent)]"
                        : "border-[var(--hairline-strong)]"
                )}
              >
                {isDone ? (
                  <Check className="h-2.5 w-2.5" aria-hidden />
                ) : isRejectedHere ? (
                  <X className="h-2.5 w-2.5" aria-hidden />
                ) : (
                  i + 1
                )}
              </span>
              {isRejectedHere ? "Rejected" : label}
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/**
 * The decision note HitBox appended to `notes` (prefixed `[REJECTED] …`), so
 * a vendor sees why without the whole intake history.
 */
export function rejectionNote(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/\[REJECTED\]\s*([\s\S]*?)(?=\n\[[A-Z]+\]|$)/);
  return m ? m[1].trim() || null : null;
}
