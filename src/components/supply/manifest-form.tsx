"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Cpu, Download, FileUp, Info, Lock } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { formatNumber } from "@/lib/format";
import { chunkManifest, countByVariant, formatManifest, parseManifest } from "@/lib/manifest";
import { chipProgressText } from "@/components/supply/consignment-lifecycle";
import { Badge, Button, Field, Mono, Panel, Textarea } from "@/components/ui/primitives";
import {
  SUPPLY_MANIFEST_MAX,
  type SupplyBatch,
  type SupplyBatchLine,
  type TagManifestInput,
  type TagManifestResult,
} from "@/lib/types";

/**
 * Paste or load the vendor's UIDs, dry-run, then commit.
 *
 * Shared by the staff consignment drawer (POST /admin/supply/batches/:id/tags)
 * and the vendor portal (POST /vendor/batches/:id/tags) — the rules are the
 * same; only the route differs, so the caller hands in `submit`.
 *
 * Each call is all-or-nothing and capped at SUPPLY_MANIFEST_MAX rows. With
 * `allowChunking`, a longer manifest goes as several sequential calls; a
 * failure part-way leaves the earlier chunks committed, and the box is
 * reduced to exactly the rows that were not written so a retry resumes.
 */

interface ManifestOutcome {
  dryRun: boolean;
  registered: number;
  /** Row numbers are positions in the whole manifest, never UIDs. */
  duplicates: { row: number; reason: string }[];
  batch: TagManifestResult["batch"] | null;
  lines: TagManifestResult["lines"];
  chunks: number;
  /** Set when a chunked commit stopped part-way. */
  failure?: { chunk: number; message: string };
}

export function ManifestForm({
  batch,
  disabled,
  disabledReason,
  submit,
  allowChunking = false,
  canCommit = true,
  commitBlockedReason,
  onCommitted,
}: {
  batch: SupplyBatch;
  disabled: boolean;
  disabledReason?: React.ReactNode;
  submit: (payload: TagManifestInput) => Promise<TagManifestResult>;
  allowChunking?: boolean;
  /**
   * A real (non-dry-run) upload is allowed. The vendor route takes one only
   * once the consignment is VALIDATED (409 SUPPLY_BATCH_NOT_VALIDATED); a
   * dry run works at any time, so the file can be checked early.
   */
  canCommit?: boolean;
  commitBlockedReason?: string;
  onCommitted?: (registered: number) => void;
}) {
  const [raw, setRaw] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<ManifestOutcome | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // A consignment split into variant lines needs a variant on every row.
  const batchLines = React.useMemo(() => batch.lines ?? [], [batch.lines]);
  const split = batchLines.length > 0;
  const [defaultVariantId, setDefaultVariantId] = React.useState<string>(
    batchLines.length === 1 ? batchLines[0].variantId : ""
  );

  const parsed = React.useMemo(
    () =>
      parseManifest(raw, {
        lines: batchLines,
        defaultVariantId: defaultVariantId || undefined,
      }),
    [raw, batchLines, defaultVariantId]
  );
  // Lines this manifest would overfill — refused with SUPPLY_LINE_QUANTITY_EXCEEDED.
  const overfull = React.useMemo(() => {
    const counts = countByVariant(parsed.rows);
    return batchLines
      .map((l) => ({ line: l, adding: counts.get(l.variantId) ?? 0, room: Math.max(0, l.quantity - l.rowsReceived) }))
      .filter((x) => x.adding > x.room);
  }, [parsed.rows, batchLines]);
  const count = parsed.rows.length;
  const chunks = chunkManifest(parsed.rows);
  const overCap = !allowChunking && count > SUPPLY_MANIFEST_MAX;
  const remaining = Math.max(0, batch.quantity - batch.rowsReceived);
  const overDeclared = count > remaining;
  // Checked before sending: no line may take more chips than it has room
  // for (quantity − rowsReceived), nor the consignment more than it declared.
  const blocked =
    count === 0 ||
    overCap ||
    parsed.problems.length > 0 ||
    overfull.length > 0 ||
    overDeclared ||
    pending;

  const loadFile = async (file: File) => {
    setRaw(await file.text());
    setOutcome(null);
  };

  const run = async (dryRun: boolean) => {
    if (blocked) return;
    setPending(true);
    const agg: ManifestOutcome = {
      dryRun,
      registered: 0,
      duplicates: [],
      batch: null,
      lines: undefined,
      chunks: chunks.length,
    };

    for (let i = 0; i < chunks.length; i++) {
      const offset = i * SUPPLY_MANIFEST_MAX;
      try {
        const result = await submit({ dryRun, tags: chunks[i] });
        agg.registered += result.registered;
        agg.batch = result.batch;
        agg.lines = result.lines;
        agg.duplicates.push(
          ...result.duplicates.map((d) => ({ ...d, row: d.row + offset }))
        );
      } catch (err) {
        const base =
          err instanceof ApiError ? err.friendly : "Could not register the manifest.";
        const lineDetail = lineErrors(err, batchLines);
        const rows = errorRows(err);
        // A parallel upload that took a UID first answers without row numbers.
        const raced =
          err instanceof ApiError && err.code === "SUPPLY_TAG_UID_TAKEN" && rows.length === 0
            ? "Another upload registered one of these chips meanwhile — run a dry run again to see which row."
            : null;
        const message = [base, lineDetail, raced].filter(Boolean).join(" ");
        // Server row numbers are 1-based within this call.
        agg.duplicates.push(...rows.map((d) => ({ ...d, row: d.row + offset })));
        if (chunks.length > 1 || lineDetail || raced) agg.failure = { chunk: i + 1, message };
        // Keep exactly what was not written, so "Register" resumes.
        if (!dryRun && i > 0) setRaw(formatManifest(parsed.rows.slice(offset), batchLines));
        if (!dryRun && agg.registered > 0) onCommitted?.(agg.registered);
        setOutcome(agg.duplicates.length || agg.failure ? agg : null);
        toast.error(
          chunks.length > 1 && !dryRun && i > 0
            ? `Stopped at chunk ${i + 1} of ${chunks.length}: ${message}`
            : message
        );
        setPending(false);
        return;
      }
    }

    setOutcome(agg);
    setPending(false);
    if (!dryRun) {
      toast.success(`${formatNumber(agg.registered)} chips registered`);
      setRaw("");
      onCommitted?.(agg.registered);
    }
  };

  if (disabled) {
    return (
      <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]">
        <Lock className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {disabledReason ??
            "This consignment has been decided, and a decided consignment takes no more rows. Appending would change counts somebody has already signed off."}
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]">
        <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          One row per physical product: a CSV with columns{" "}
          <Mono className="text-[10px]">uid</Mono>
          {split ? (
            <>
              , <Mono className="text-[10px]">variant_code</Mono>
            </>
          ) : null}
          , <Mono className="text-[10px]">qc_status</Mono>,{" "}
          <Mono className="text-[10px]">qc_notes</Mono>
          {split ? "" : " (no variant column — this consignment has no variants)"}. A
          UID may contain <Mono className="text-[10px]">:</Mono>,{" "}
          <Mono className="text-[10px]">-</Mono> or spaces; an empty qc_status
          means PENDING. Dry run first — it checks everything and writes
          nothing. <strong className="font-medium">FAILED-QC chips count as
          uploaded but don&rsquo;t become sellable units.</strong>
        </span>
      </p>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--text-3)]">
        <span>Templates:</span>
        <a
          href="/templates/chip-manifest-red-tee.csv"
          download
          className="inline-flex items-center gap-1 text-[var(--text-2)] underline-offset-2 hover:underline"
        >
          <Download className="h-3 w-3" aria-hidden />
          With variants (Red tee)
        </a>
        <a
          href="/templates/chip-manifest-figure-no-variants.csv"
          download
          className="inline-flex items-center gap-1 text-[var(--text-2)] underline-offset-2 hover:underline"
        >
          <Download className="h-3 w-3" aria-hidden />
          Without variants (figure)
        </a>
      </p>

      {split ? (
        <>
          <LineCapacity lines={batchLines} adding={countByVariant(parsed.rows)} />
          <Field
            label="Variant for rows without one"
            htmlFor="manifest-variant"
            hint="Each chip is embedded in one product, so each row names its variant. A CSV variant column wins over this."
          >
            <select
              id="manifest-variant"
              value={defaultVariantId}
              onChange={(e) => setDefaultVariantId(e.target.value)}
              className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
            >
              <option value="">None — the file names each row&rsquo;s variant</option>
              {batchLines.map((l) => (
                <option key={l.variantId} value={l.variantId}>
                  {lineName(l)}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : null}

      <Field
        label="Chip UIDs"
        htmlFor="manifest"
        hint={`${formatNumber(count)} read · ${formatNumber(
          remaining
        )} still declared on this consignment · ${
          allowChunking && count > SUPPLY_MANIFEST_MAX
            ? `sent as ${chunks.length} calls of up to ${formatNumber(SUPPLY_MANIFEST_MAX)}`
            : `at most ${formatNumber(SUPPLY_MANIFEST_MAX)} per call`
        }`}
      >
        <Textarea
          id="manifest"
          rows={10}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setOutcome(null);
          }}
          placeholder={"04:A3:9B:2C:5D:6E:80\n04A39B2C5D6E81\n04-a3-9b-2c-5d-6e-82"}
          className="font-mono text-[12px]"
        />
      </Field>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = "";
        }}
      />

      {parsed.problems.length > 0 ? (
        <div className="rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {parsed.problems.length} row{parsed.problems.length === 1 ? "" : "s"} to
            fix before sending
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
            Rows count from the first line under the header.
          </p>
          <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto">
            {parsed.problems.slice(0, 50).map((p, i) => (
              <li key={i}>
                <Mono className="text-[11px]">Row {p.row}</Mono> — {p.message}
              </li>
            ))}
          </ul>
        </div>
      ) : overCap ? (
        <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
          {formatNumber(count)} rows — the cap is {formatNumber(SUPPLY_MANIFEST_MAX)},
          matched to a physical carton and registered in one transaction. Split
          the reel across several calls.
        </p>
      ) : overfull.length > 0 ? (
        <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            More chips than the line declares on{" "}
            {overfull
              .map((o) => `${lineName(o.line)} (${formatNumber(o.adding)} for ${formatNumber(o.room)} left)`)
              .join(", ")}
            . Remove the extra rows — a line takes no more chips than it declares.
          </span>
        </p>
      ) : overDeclared ? (
        <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
          {formatNumber(count)} rows for {formatNumber(remaining)} still declared on
          this consignment. The declared quantity is a ceiling — remove the extra rows.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-3.5 w-3.5" />
          Load CSV
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          disabled={blocked}
          onClick={() => void run(true)}
        >
          Dry run
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={pending}
          disabled={blocked || !canCommit}
          onClick={() => void run(false)}
        >
          <Cpu className="h-3.5 w-3.5" />
          Upload {formatNumber(count)}
        </Button>
      </div>
      {!canCommit && commitBlockedReason ? (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--text-3)]">
          <Lock className="mt-[2px] h-3 w-3 shrink-0" aria-hidden />
          {commitBlockedReason}
        </p>
      ) : null}

      {outcome ? <ManifestResult outcome={outcome} batchLines={batchLines} declared={batch.quantity} /> : null}
    </div>
  );
}

const ROW_REASON: Record<string, string> = {
  SUPPLY_TAG_UID_TAKEN: "already registered",
  SUPPLY_TAG_UID_DUPLICATED: "repeated",
  SUPPLY_VARIANT_REQUIRED: "no variant",
  SUPPLY_VARIANT_NOT_IN_BATCH: "variant not on this consignment",
};

/**
 * The offending rows of a refused manifest, by position:
 * `details.duplicates[].row` on the UID errors, `details.rows` on the
 * variant errors (numbers or `{ row, reason }`).
 */
function errorRows(err: unknown): { row: number; reason: string }[] {
  if (!(err instanceof ApiError)) return [];
  const details = err.details as
    | {
        duplicates?: { row: number; reason?: string }[];
        rows?: (number | { row: number; reason?: string })[];
      }
    | undefined;
  const fallback = ROW_REASON[err.code] ?? "refused";
  return [...(details?.duplicates ?? []), ...(details?.rows ?? [])].map((d) =>
    typeof d === "number"
      ? { row: d, reason: fallback }
      : { row: d.row, reason: d.reason ?? fallback }
  );
}

/**
 * `details.lines` on SUPPLY_LINE_QUANTITY_EXCEEDED — which variant would get
 * more chips than its line declares. The field names past `variantId` are not
 * pinned down in the docs, so the common ones are read and the rest ignored.
 */
function lineErrors(err: unknown, batchLines: SupplyBatchLine[]): string | null {
  if (!(err instanceof ApiError) || err.code !== "SUPPLY_LINE_QUANTITY_EXCEEDED") return null;
  const lines = (err.details as { lines?: Record<string, unknown>[] } | undefined)?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  return lines
    .map((l) => {
      const meta = batchLines.find((b) => b.variantId === l.variantId);
      const name = meta ? lineName(meta) : String(l.label ?? l.variantCode ?? "A variant");
      const n = (k: string) => (typeof l[k] === "number" ? (l[k] as number) : undefined);
      const declared = n("quantity") ?? n("declared");
      const wanted = n("requested") ?? n("total") ?? n("after");
      return wanted !== undefined && declared !== undefined
        ? `${name}: ${formatNumber(wanted)} chips for a line of ${formatNumber(declared)}.`
        : `${name} is over its line.`;
    })
    .join(" ");
}

export function lineName(l: Pick<SupplyBatchLine, "variantId" | "label" | "variantCode">): string {
  if (l.label && l.variantCode) return `${l.label} · ${l.variantCode}`;
  return l.label ?? l.variantCode ?? l.variantId.slice(0, 8);
}

/** Each line's room, and what the manifest in the box would add to it. */
function LineCapacity({
  lines,
  adding,
}: {
  lines: SupplyBatchLine[];
  adding: Map<string, number>;
}) {
  return (
    <Panel>
      <p className="px-3 pb-1.5 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        Variant lines
      </p>
      <ul className="divide-y divide-[var(--hairline)]">
        {lines.map((l) => {
          const room = Math.max(0, l.quantity - l.rowsReceived);
          const add = adding.get(l.variantId) ?? 0;
          return (
            <li key={l.variantId} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="truncate text-[12px] text-[var(--text-2)]">{lineName(l)}</span>
              <span
                className={`tnum shrink-0 text-[12px] ${
                  add > room ? "text-[var(--warning)]" : "text-[var(--text-3)]"
                }`}
              >
                {add ? `+${formatNumber(add)} · ` : ""}
                {formatNumber(l.rowsReceived)} / {formatNumber(l.quantity)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ManifestResult({
  outcome,
  batchLines,
  declared,
}: {
  outcome: ManifestOutcome;
  batchLines: SupplyBatchLine[];
  /** The consignment's declared quantity. */
  declared: number;
}) {
  return (
    <Panel>
      <p className="flex items-center gap-2 px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        {outcome.dryRun ? "Dry run — nothing written" : "Registered"}
        {outcome.dryRun ? <Badge tone="neutral">Preview</Badge> : null}
        {outcome.chunks > 1 ? <Badge tone="neutral">{outcome.chunks} calls</Badge> : null}
      </p>
      {outcome.batch ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 pb-3 sm:grid-cols-4">
          <Figure label={outcome.dryRun ? "Would add" : "Added"} value={outcome.registered} />
          <Figure label="Chips on consignment" value={outcome.batch.rowsReceived} />
          <Figure label="Passed / pending QC" value={outcome.batch.rowsAccepted} />
          <Figure label="Failed QC" value={outcome.batch.rowsRejected} />
        </div>
      ) : null}

      {outcome.batch && !outcome.dryRun ? (
        <p className="border-t border-[var(--hairline)] px-3 py-2 text-[12px] text-[var(--text-1)]">
          {chipProgressText({
            lines: (outcome.lines ?? []).map((l) => {
              const meta = batchLines.find((b) => b.variantId === l.variantId);
              return { ...l, label: meta?.label, variantCode: meta?.variantCode };
            }),
            quantity: declared,
            rowsReceived: outcome.batch.rowsReceived,
            rowsRejected: outcome.batch.rowsRejected,
          })}
        </p>
      ) : null}

      {outcome.lines && outcome.lines.length > 0 ? (
        <ul className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {outcome.lines.map((l) => {
            const meta = batchLines.find((b) => b.variantId === l.variantId);
            return (
              <li key={l.variantId} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="truncate text-[12px] text-[var(--text-2)]">
                  {lineName({ ...l, label: meta?.label, variantCode: meta?.variantCode })}
                </span>
                <span className="tnum shrink-0 text-[12px] text-[var(--text-3)]">
                  {formatNumber(l.rowsReceived)} / {formatNumber(l.quantity)} ·{" "}
                  {formatNumber(l.rowsRejected)} failed QC
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {outcome.failure ? (
        <p className="border-t border-[var(--hairline)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
          {outcome.chunks > 1
            ? `Stopped at call ${outcome.failure.chunk} of ${outcome.chunks}: `
            : ""}
          {outcome.failure.message}
          {!outcome.dryRun && outcome.registered > 0
            ? ` ${formatNumber(outcome.registered)} rows from earlier calls were committed; the box now holds only what was not.`
            : ""}
        </p>
      ) : null}

      {outcome.duplicates.length > 0 ? (
        <div className="border-t border-[var(--hairline)] px-3 py-2.5">
          <p className="text-[11px] font-medium text-[var(--danger)]">
            {outcome.duplicates.length} row
            {outcome.duplicates.length === 1 ? "" : "s"} refused — the call is
            refused whole
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-3)]">
            Nothing from this call was written. Rows are named by position,
            never by UID.
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {outcome.duplicates.map((d, i) => (
              <li key={`${d.row}-${i}`} className="text-[12px] text-[var(--text-2)]">
                <Mono className="text-[11px]">Row {d.row}</Mono> — {d.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

export function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning";
}) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-3)]">{label}</p>
      <p
        className={`tnum mt-0.5 text-[16px] font-medium ${
          tone === "warning" ? "text-[var(--warning)]" : "text-[var(--text-1)]"
        }`}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}
