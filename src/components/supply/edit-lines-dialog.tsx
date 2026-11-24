"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Info, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useProductVariants, useUpdateBatchLines } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Input, Mono } from "@/components/ui/primitives";
import type { SupplyBatch } from "@/lib/types";

/**
 * Edit variant lines — PATCH /admin/supply/batches/:batchId/lines.
 *
 * Fixes a consignment booked without (or with the wrong) variant lines while
 * it is still open, instead of rejecting and rebooking it. The lines must add
 * up to the declared quantity. Chips registered without a variant are given
 * one by the server, oldest first, line by line; a chip that already has a
 * variant keeps it, so its line can't drop below the chips already on it.
 */
export function EditLinesDialog({ batch, onClose }: { batch: SupplyBatch; onClose: () => void }) {
  const variantsQuery = useProductVariants(batch.dropId ?? undefined);
  const live = (variantsQuery.data ?? []).filter((v) => v.isActive && !v.archived);
  const save = useUpdateBatchLines(batch.id);
  const current = batch.lines ?? [];

  const [qty, setQty] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(current.map((l) => [l.variantId, String(l.quantity)]))
  );
  const [error, setError] = React.useState<string | null>(null);

  const num = (v: string | undefined) => (v && v.trim() ? Number(v) : 0);
  const lines = live
    .map((v) => ({ variantId: v.id, quantity: num(qty[v.id]) }))
    .filter((l) => l.quantity > 0);
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  const declared = batch.quantity;
  const diff = total - declared;

  // Chips on each variant already, and chips waiting for one.
  const onLine = (variantId: string) => current.find((l) => l.variantId === variantId)?.rowsReceived ?? 0;
  const assigned = current.reduce((s, l) => s + l.rowsReceived, 0);
  const unassigned = Math.max(0, batch.rowsReceived - assigned);

  const tooSmall = live.filter((v) => onLine(v.id) > 0 && num(qty[v.id]) < onLine(v.id));
  const canSave = lines.length > 0 && diff === 0 && tooSmall.length === 0 && !save.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    save.mutate(lines, {
      onSuccess: () => {
        toast.success(
          unassigned > 0
            ? `Variant lines saved — ${formatNumber(unassigned)} chip${unassigned === 1 ? "" : "s"} assigned to them`
            : "Variant lines saved"
        );
        onClose();
      },
      // The server's wording names the line and the numbers — shown as returned.
      onError: (err) => setError(err instanceof ApiError ? err.friendly : "Could not save the lines."),
    });
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.55)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] flex max-h-[min(88dvh,720px)] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Edit variant lines
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                {batch.batchRef ?? "This consignment"} · {formatNumber(declared)} declared
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <p className="flex items-start gap-2 text-[12px] leading-relaxed text-[var(--text-2)]">
                <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" aria-hidden />
                <span>
                  How many of each variant are in the carton. The lines must add up to the declared{" "}
                  {formatNumber(declared)}.
                  {unassigned > 0
                    ? ` The ${formatNumber(unassigned)} chip${unassigned === 1 ? "" : "s"} already registered without a variant will be given one, oldest first, line by line.`
                    : ""}
                </span>
              </p>

              {variantsQuery.isLoading ? (
                <p className="text-[12px] text-[var(--text-3)]">Loading variants…</p>
              ) : live.length === 0 ? (
                <p className="rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] text-[var(--text-1)]">
                  This drop has no live variants. Add them on the drop first.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--hairline)] rounded-[8px] border border-[var(--hairline)]">
                  {live.map((v) => {
                    const min = onLine(v.id);
                    const low = min > 0 && num(qty[v.id]) < min;
                    return (
                      <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] text-[var(--text-1)]">{v.label}</p>
                          <p className="text-[10.5px] text-[var(--text-3)]">
                            <Mono className="text-[9.5px]">{v.variantCode}</Mono>
                            {min > 0 ? ` · ${formatNumber(min)} chip${min === 1 ? "" : "s"} already on it` : ""}
                          </p>
                        </div>
                        <Input
                          aria-label={`Units of ${v.label}`}
                          inputMode="numeric"
                          value={qty[v.id] ?? ""}
                          invalid={low}
                          onChange={(e) => setQty((q) => ({ ...q, [v.id]: e.target.value.replace(/\D/g, "") }))}
                          placeholder="—"
                          className="h-7 w-24 text-right text-[12.5px]"
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <p
                className={cn(
                  "tnum text-[12px]",
                  diff === 0 && lines.length ? "text-[var(--positive)]" : "text-[var(--text-3)]"
                )}
              >
                Total {formatNumber(total)} of {formatNumber(declared)} declared
                {diff > 0 ? ` — ${formatNumber(diff)} too many` : diff < 0 && lines.length ? ` — ${formatNumber(-diff)} still to place` : ""}
              </p>
              {tooSmall.length ? (
                <p className="text-[11.5px] text-[var(--danger)]">
                  {tooSmall.map((v) => v.label).join(", ")} can&rsquo;t go below the chips already on {tooSmall.length === 1 ? "it" : "them"}.
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] px-3 py-2 text-[12px] text-[var(--danger)]">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
              <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!canSave}>
                Save lines
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
