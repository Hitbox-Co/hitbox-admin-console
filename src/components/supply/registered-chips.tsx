"use client";

import * as React from "react";
import { CheckCircle2, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { useSupplyTags } from "@/lib/api/hooks";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Mono, Panel, Skeleton, Tooltip, toneForStatus } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { lineName } from "@/components/supply/manifest-form";
import type { SupplyBatch } from "@/lib/types";

/**
 * What is already registered on a consignment — by staff or by the vendor
 * through the portal (GET /admin/supply/tags?supplyBatchId=…).
 *
 * Shown by chip code, never by UID: the API does not return UIDs or keys to
 * anyone, because whoever holds a UID can write it onto a blank chip. What it
 * does say is whether each chip's keys are on file and whether a tap on it
 * could be verified — the two things that decide if its unit can be claimed.
 */
export function RegisteredChips({ batch }: { batch: SupplyBatch }) {
  const [page, setPage] = React.useState(1);
  const limit = 25;
  const q = useSupplyTags({ supplyBatchId: batch.id, page, limit });
  const rows = q.data?.data ?? [];
  const total = q.data?.meta.total ?? 0;
  const pages = q.data?.meta.totalPages ?? 1;
  const lines = batch.lines ?? [];
  const variantName = (id?: string | null) => {
    if (!id) return null;
    const l = lines.find((x) => x.variantId === id);
    return l ? lineName(l) : id.slice(0, 8);
  };
  const withKeys = rows.filter((r) => r.hasActiveKeys).length;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
        <div>
          <p className="text-[12.5px] font-semibold text-[var(--text-1)]">
            Registered chips <span className="tnum font-normal text-[var(--text-3)]">· {formatNumber(total)}</span>
          </p>
          <p className="text-[11px] text-[var(--text-3)]">
            Uploaded so far, by you or the vendor. UIDs and keys are never shown — only whether they&rsquo;re on file.
          </p>
        </div>
        {total > 0 && rows.length === total ? (
          <Badge tone={withKeys === total ? "positive" : "warning"}>
            <KeyRound className="h-3 w-3" /> {formatNumber(withKeys)} of {formatNumber(total)} keyed
          </Badge>
        ) : null}
      </div>

      {q.isLoading ? (
        <div className="space-y-1.5 p-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-[12px] text-[var(--text-3)]">No chips registered on this consignment yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={cn("w-full text-[12px]", q.isFetching && "opacity-60")}>
            <thead>
              <tr className="border-b border-[var(--hairline)] text-left text-[10.5px] uppercase tracking-wide text-[var(--text-3)]">
                <th className="px-3 py-2 font-medium">Chip</th>
                {lines.length ? <th className="px-3 py-2 font-medium">Variant</th> : null}
                <th className="px-3 py-2 font-medium">QC</th>
                <th className="px-3 py-2 font-medium">Keys</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <Mono className="text-[11px]">{r.nfcTagCode}</Mono>
                  </td>
                  {lines.length ? (
                    <td className="px-3 py-2 text-[var(--text-2)]">{variantName(r.variantId) ?? "—"}</td>
                  ) : null}
                  <td className="px-3 py-2">
                    <Tooltip content={r.qcNotes || "No QC notes"}>
                      <span>
                        <Badge tone={toneForStatus(r.qcStatus)}>{humanize(r.qcStatus)}</Badge>
                      </span>
                    </Tooltip>
                  </td>
                  <td className="px-3 py-2">
                    {r.hasActiveKeys === undefined ? (
                      <span className="text-[var(--text-3)]">—</span>
                    ) : r.hasActiveKeys ? (
                      <span className="inline-flex items-center gap-1 text-[var(--positive)]">
                        <ShieldCheck className="h-3.5 w-3.5" /> On file
                      </span>
                    ) : (
                      <Tooltip content="No keys stored for this chip — a tap on it can't be verified.">
                        <span className="inline-flex items-center gap-1 text-[var(--warning)]">
                          <ShieldAlert className="h-3.5 w-3.5" /> Missing
                        </span>
                      </Tooltip>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Badge tone="neutral">{humanize(r.lifecycleState)}</Badge>
                      {r.verifiable ? (
                        <Tooltip content="A tap on this chip can be verified.">
                          <span>
                            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--positive)]" aria-label="Verifiable" />
                          </span>
                        </Tooltip>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.sku ? <Mono className="text-[11px]">{r.sku.skuCode}</Mono> : <span className="text-[var(--text-3)]">Not minted yet</span>}
                  </td>
                  <td className="tnum px-3 py-2 text-[var(--text-3)]">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-[var(--hairline)] px-3 py-1.5 text-[11.5px] text-[var(--text-3)]">
          <span>
            Page {page} of {pages}
          </span>
          <span className="flex gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </Panel>
  );
}
