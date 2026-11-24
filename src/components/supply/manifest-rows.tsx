"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { emptyEntry, type ManifestEntry } from "@/lib/manifest";
import { Button, Input, Mono } from "@/components/ui/primitives";
import type { SupplyBatchLine } from "@/lib/types";

/**
 * Row-by-row entry of a chip manifest: one chip per row, its UID and the three
 * keys the vendor wrote onto it (Key 00 / 01 / 02).
 *
 * The rows are only an editor. They are turned into manifest text and checked
 * by the same `parseManifest` as a pasted file, so a problem is reported the
 * same way whichever input was used; `problems` arrive here keyed by editor row.
 *
 * Keys are typed in the clear on purpose — the person entering them is
 * copying them from the vendor's sheet and must be able to check them. They
 * leave this screen once, in the upload request, and the API never returns them.
 */
export function ManifestRows({
  entries,
  onChange,
  lines,
  problems,
}: {
  entries: ManifestEntry[];
  onChange: (next: ManifestEntry[]) => void;
  /** The consignment's variant lines. Empty → no variant picker. */
  lines: SupplyBatchLine[];
  /** Problems by editor row index. */
  problems: Map<number, string[]>;
}) {
  const split = lines.length > 0;

  const update = (index: number, patch: Partial<ManifestEntry>) =>
    onChange(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  const remove = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyEntry()]);
  };

  const keyInput = (index: number, name: "key0" | "key1" | "key2", label: string) => (
    <Input
      aria-label={`Row ${index + 1} ${label}`}
      value={entries[index][name]}
      onChange={(e) => update(index, { [name]: e.target.value })}
      placeholder={`${label} · 32 hex`}
      autoComplete="off"
      spellCheck={false}
      className="font-mono text-[11px]"
    />
  );

  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {entries.map((entry, index) => {
          const rowProblems = problems.get(index) ?? [];
          return (
            <li
              key={index}
              className={
                "space-y-2 rounded-[8px] border bg-[var(--surface-1)] p-2.5 " +
                (rowProblems.length > 0
                  ? "border-[rgba(204,92,92,0.45)]"
                  : "border-[var(--hairline)]")
              }
            >
              <div className="flex items-center gap-2">
                <Mono className="w-8 shrink-0 text-center text-[10px]">{index + 1}</Mono>
                <Input
                  aria-label={`Row ${index + 1} chip UID`}
                  value={entry.uid}
                  onChange={(e) => update(index, { uid: e.target.value })}
                  placeholder="Chip UID · e.g. 04A39B2C5D6E80"
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 font-mono text-[12px]"
                />
                {split ? (
                  <select
                    aria-label={`Row ${index + 1} variant`}
                    value={entry.variantId}
                    onChange={(e) => update(index, { variantId: e.target.value })}
                    className="h-8 w-40 shrink-0 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text-1)]"
                  >
                    <option value="">Default variant</option>
                    {lines.map((l) => (
                      <option key={l.variantId} value={l.variantId}>
                        {l.label ?? l.variantCode ?? l.variantId}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  aria-label={`Row ${index + 1} QC status`}
                  value={entry.qcStatus}
                  onChange={(e) => update(index, { qcStatus: e.target.value as ManifestEntry["qcStatus"] })}
                  className="h-8 w-28 shrink-0 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text-1)]"
                >
                  <option value="">QC pending</option>
                  <option value="PASSED">QC passed</option>
                  <option value="FAILED">QC failed</option>
                </select>
                <button
                  type="button"
                  aria-label={`Remove row ${index + 1}`}
                  onClick={() => remove(index)}
                  className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 pl-10 sm:grid-cols-3">
                {keyInput(index, "key0", "Key 00")}
                {keyInput(index, "key1", "Key 01")}
                {keyInput(index, "key2", "Key 02")}
              </div>
              {rowProblems.length > 0 ? (
                <ul className="space-y-0.5 pl-10 text-[11px] text-[var(--danger)]">
                  {rowProblems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange([...entries, emptyEntry()])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add row
      </Button>
    </div>
  );
}
