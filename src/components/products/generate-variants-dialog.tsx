"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, Check, Info, Plus, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useDropType, useGenerateVariants } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Field, Input } from "@/components/ui/primitives";
import { HexColorInput, OptionChips, Swatch, normalizeHex } from "./variant-bits";
import type {
  DropTypeDimension,
  DropTypeRule,
  GenerateVariantsResult,
  VariantOptionValue,
  VariantPreview,
  VariantProblem,
} from "@/lib/types";

/**
 * Add variants — every combination of the chosen values
 * (POST /admin/products/:id/variants/generate, drop-types-and-variants.md §7).
 *
 * Preview first, always: the same body with `dryRun: true` writes nothing and
 * answers what WOULD happen — created, revived (archived and selected again),
 * existing (untouched) and skipped (refused by the type's rules, with why).
 * Only a preview of the CURRENT selection unlocks the confirm button, so what
 * the operator confirms is exactly what they read.
 *
 * The server does the rule work — a CARD's `SINGLE × 5` collapses to plain
 * `SINGLE`, duplicates merge, re-running is safe — so nothing here re-derives
 * the rules; they are shown as plain sentences for orientation only.
 */

const MAX_COMBINATIONS = 200;
const VALUE_CODE_RE = /^[A-Za-z0-9]{1,12}$/;

interface CustomValue {
  code: string;
  label: string;
  hexCode: string | null;
}

export function GenerateVariantsDialog({
  productId,
  typeCode,
  onClose,
}: {
  productId: string;
  typeCode: string;
  onClose: () => void;
}) {
  const typeQuery = useDropType(typeCode);
  const generate = useGenerateVariants(productId);
  const type = typeQuery.data;

  // Archived dimensions and values are hidden from new variants (§5).
  const dimensions = React.useMemo(
    () =>
      (type?.dimensions ?? [])
        .filter((d) => !d.archived)
        .sort((a, b) => a.position - b.position)
        .map((d) => ({
          ...d,
          values: d.values.filter((v) => !v.archived).sort((a, b) => a.position - b.position),
        })),
    [type]
  );

  const [picked, setPicked] = React.useState<Record<string, string[]>>({});
  const [custom, setCustom] = React.useState<Record<string, CustomValue[]>>({});
  const [supplyEach, setSupplyEach] = React.useState("");
  const [preview, setPreview] = React.useState<{ key: string; result: GenerateVariantsResult } | null>(
    null
  );
  const [problems, setProblems] = React.useState<VariantProblem[]>([]);

  const select = React.useMemo(() => {
    const out: Record<string, VariantOptionValue[]> = {};
    for (const d of dimensions) {
      const vals: VariantOptionValue[] = [
        ...(picked[d.code] ?? []),
        ...(custom[d.code] ?? []).map((c) => ({
          code: c.code,
          label: c.label || undefined,
          ...(d.displayType === "COLOR" && c.hexCode ? { hexCode: c.hexCode } : {}),
        })),
      ];
      if (vals.length) out[d.code] = vals;
    }
    return out;
  }, [dimensions, picked, custom]);

  // Counted BEFORE the rules prune anything — the same count the server caps.
  const combinations = Object.values(select).reduce((n, v) => n * v.length, Object.keys(select).length ? 1 : 0);
  const missingRequired = dimensions.filter((d) => d.required && !select[d.code]?.length);
  const supplyN = supplyEach ? Number(supplyEach) : null;

  const body = { select, totalSupplyEach: supplyN };
  const key = JSON.stringify(body);
  const current = preview && preview.key === key ? preview.result : null;
  const toWrite = current ? current.created.length + current.revived.length : 0;

  const toggle = (dim: string, code: string) => {
    setPicked((prev) => {
      const list = prev[dim] ?? [];
      return { ...prev, [dim]: list.includes(code) ? list.filter((c) => c !== code) : [...list, code] };
    });
  };

  const run = (dryRun: boolean) => {
    setProblems([]);
    generate.mutate(
      { ...body, dryRun },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setPreview({ key, result });
            return;
          }
          const n = result.created.length + result.revived.length;
          toast.success(
            `${formatNumber(n)} variant${n === 1 ? "" : "s"} added` +
              (result.revived.length ? ` (${result.revived.length} restored)` : "")
          );
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            const d = (err.details ?? {}) as { problems?: VariantProblem[] };
            if (d.problems?.length) setProblems(d.problems);
            toast.error(err.validationSummary ?? err.friendly);
            return;
          }
          toast.error("Could not generate the variants.");
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] flex max-h-[calc(100vh-48px)] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Add variants{type ? ` — ${type.name}` : ""}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                Pick values on each dimension. Every combination becomes a variant.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {typeQuery.isLoading ? (
              <p className="text-[12px] text-[var(--text-3)]">Loading the type&rsquo;s dimensions…</p>
            ) : typeQuery.isError || !type ? (
              <p className="text-[12px] text-[var(--danger)]">
                {typeQuery.error instanceof ApiError
                  ? typeQuery.error.friendly
                  : "Could not load this drop type."}
              </p>
            ) : (
              <>
                {dimensions.map((d) => (
                  <DimensionPicker
                    key={d.code}
                    dimension={d}
                    picked={picked[d.code] ?? []}
                    custom={custom[d.code] ?? []}
                    onToggle={(code) => toggle(d.code, code)}
                    onAddCustom={(v) =>
                      setCustom((prev) => ({ ...prev, [d.code]: [...(prev[d.code] ?? []), v] }))
                    }
                    onRemoveCustom={(code) =>
                      setCustom((prev) => ({
                        ...prev,
                        [d.code]: (prev[d.code] ?? []).filter((c) => c.code !== code),
                      }))
                    }
                  />
                ))}

                {type.rules.length ? <RulesNote rules={type.rules} dimensions={dimensions} /> : null}

                <Field
                  label="Supply per variant"
                  htmlFor="gen-supply"
                  hint="Optional cap applied to every new variant. Blank draws from the drop's total supply."
                >
                  <Input
                    id="gen-supply"
                    inputMode="numeric"
                    value={supplyEach}
                    onChange={(e) => setSupplyEach(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 100"
                  />
                </Field>

                <div
                  className={cn(
                    "flex items-start gap-2 rounded-[8px] border px-3 py-2 text-[11.5px] leading-relaxed",
                    combinations > MAX_COMBINATIONS
                      ? "border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] text-[var(--text-2)]"
                      : "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--text-3)]"
                  )}
                >
                  <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    {combinations === 0
                      ? "Nothing selected yet."
                      : `${formatNumber(combinations)} combination${combinations === 1 ? "" : "s"} before the type's rules are applied.`}
                    {combinations > MAX_COMBINATIONS
                      ? ` Over the limit of ${MAX_COMBINATIONS} — split the selection, e.g. one colour group per run.`
                      : ""}
                    {missingRequired.length && combinations > 0
                      ? ` ${missingRequired.map((d) => d.label).join(", ")} ${missingRequired.length === 1 ? "is" : "are"} required — combinations without ${missingRequired.length === 1 ? "it" : "them"} will be skipped.`
                      : ""}
                  </span>
                </div>

                {problems.length ? <ProblemList problems={problems} /> : null}
                {current ? <PreviewResult result={current} /> : null}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => run(true)}
              loading={generate.isPending && generate.variables?.dryRun === true}
              disabled={!type || combinations === 0 || combinations > MAX_COMBINATIONS}
            >
              {current ? "Preview again" : "Preview"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => run(false)}
              loading={generate.isPending && generate.variables?.dryRun === false}
              disabled={!current || toWrite === 0}
            >
              <Check className="h-3.5 w-3.5" />
              {current
                ? toWrite
                  ? `Create ${formatNumber(toWrite)} variant${toWrite === 1 ? "" : "s"}`
                  : "Nothing to create"
                : "Preview to continue"}
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DimensionPicker({
  dimension: d,
  picked,
  custom,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}: {
  dimension: DropTypeDimension;
  picked: string[];
  custom: CustomValue[];
  onToggle: (code: string) => void;
  onAddCustom: (v: CustomValue) => void;
  onRemoveCustom: (code: string) => void;
}) {
  const isColor = d.displayType === "COLOR";
  const [adding, setAdding] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [hex, setHex] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const add = () => {
    const c = code.trim().toUpperCase();
    if (!VALUE_CODE_RE.test(c)) {
      setError("1–12 letters or digits, no dashes.");
      return;
    }
    if (d.values.some((v) => v.code === c) || custom.some((v) => v.code === c)) {
      setError("That code is already offered.");
      return;
    }
    // No hex = no swatch, which the server accepts; a malformed one it refuses.
    const hexCode = isColor && hex ? normalizeHex(hex) : null;
    if (isColor && hex && !hexCode) {
      setError("Colour: a hex code such as #C2B280, or leave it blank for no swatch.");
      return;
    }
    onAddCustom({ code: c, label: label.trim() || c, hexCode });
    setCode("");
    setLabel("");
    setHex("");
    setError(null);
    setAdding(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium text-[var(--text-2)]">{d.label}</span>
        {d.required ? (
          <Badge tone="accent" className="px-1 py-0 text-[10px]">
            Required
          </Badge>
        ) : (
          <Badge tone="neutral" className="px-1 py-0 text-[10px]">
            Optional
          </Badge>
        )}
        {picked.length + custom.length ? (
          <span className="text-[11px] text-[var(--text-3)]">
            {picked.length + custom.length} selected
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={d.label}>
        {d.values.map((v) => {
          const on = picked.includes(v.code);
          return (
            <button
              key={v.code}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(v.code)}
              title={v.code}
              className={cn(
                "pressable inline-flex h-7 items-center gap-1.5 rounded-[6px] border px-2 text-[12px] transition-colors",
                on
                  ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-1)]"
                  : "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--text-2)] hover:border-[var(--hairline-strong)]"
              )}
            >
              {isColor ? <Swatch hex={v.hexCode} /> : null}
              {v.label}
            </button>
          );
        })}

        {custom.map((v) => (
          <span
            key={v.code}
            className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-dashed border-[var(--accent)] bg-[var(--accent-dim)] px-2 text-[12px] text-[var(--text-1)]"
            title="Custom value — exists only on this drop's variants"
          >
            {isColor ? <Swatch hex={v.hexCode} /> : null}
            {v.label}
            <button
              type="button"
              aria-label={`Remove ${v.label}`}
              onClick={() => onRemoveCustom(v.code)}
              className="text-[var(--text-3)] hover:text-[var(--text-1)]"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {d.allowCustomValues && !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="pressable inline-flex h-7 items-center gap-1 rounded-[6px] border border-dashed border-[var(--hairline-strong)] px-2 text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            <Plus className="h-3 w-3" />
            Custom
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-2">
          <Field label="Code" htmlFor={`cv-code-${d.code}`} className="w-24">
            <Input
              id={`cv-code-${d.code}`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 12))}
              placeholder="SND"
              autoFocus
            />
          </Field>
          <Field label="Label" htmlFor={`cv-label-${d.code}`} className="min-w-[120px] flex-1">
            <Input
              id={`cv-label-${d.code}`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Sand"
            />
          </Field>
          {isColor ? (
            <Field label="Colour" htmlFor={`cv-hex-${d.code}`}>
              <HexColorInput id={`cv-hex-${d.code}`} value={hex} onChange={setHex} />
            </Field>
          ) : null}
          <Button type="button" size="sm" variant="primary" onClick={add}>
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
          {error ? <p className="w-full text-[11px] text-[var(--danger)]">{error}</p> : null}
          <p className="w-full text-[11px] text-[var(--text-3)]">
            Exists only on this drop&rsquo;s variants — it is not added to the type.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The type's rules as sentences — orientation only; the server applies them. */
function RulesNote({ rules, dimensions }: { rules: DropTypeRule[]; dimensions: DropTypeDimension[] }) {
  const label = (code: string) => dimensions.find((d) => d.code === code)?.label ?? code;
  return (
    <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2">
      <p className="mb-1 text-[11px] font-medium text-[var(--text-2)]">This type&rsquo;s rules</p>
      <ul className="space-y-0.5 text-[11.5px] leading-relaxed text-[var(--text-3)]">
        {rules.map((r, i) => (
          <li key={i}>{describeRule(r, label)}</li>
        ))}
      </ul>
    </div>
  );
}

export function describeRule(r: DropTypeRule, label: (code: string) => string = (c) => c): string {
  const match = (m: Record<string, string | string[]>) =>
    Object.entries(m)
      .map(([k, v]) => `${label(k)} is ${Array.isArray(v) ? v.join(" or ") : v}`)
      .join(" and ");
  if (r.kind === "exclude") return `Never allowed: ${match(r.match)}.`;
  const dims = r.dimensions.map(label).join(", ");
  return r.kind === "require"
    ? `When ${match(r.when)}, ${dims} must be chosen.`
    : `When ${match(r.when)}, ${dims} is left out.`;
}

function ProblemList({ problems }: { problems: VariantProblem[] }) {
  return (
    <div className="rounded-[8px] border border-[rgba(204,92,92,0.35)] bg-[var(--danger-dim)] px-3 py-2">
      <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--danger)]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        The type&rsquo;s rules refused this
      </p>
      <ul className="space-y-0.5 text-[11.5px] text-[var(--text-2)]">
        {problems.map((p, i) => (
          <li key={i}>
            {p.dimension ? <strong className="font-medium">{p.dimension}: </strong> : null}
            {p.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewResult({ result }: { result: GenerateVariantsResult }) {
  return (
    <div className="space-y-3 rounded-[8px] border border-[var(--hairline)] p-3">
      <p className="text-[12px] font-medium text-[var(--text-1)]">
        Preview — nothing has been written yet
      </p>
      <PreviewGroup title="Will be created" tone="positive" rows={result.created} />
      <PreviewGroup title="Will be restored (were archived)" tone="info" rows={result.revived} />
      <PreviewGroup title="Already on this drop — untouched" tone="neutral" rows={result.existing} />
      {result.skipped.length ? (
        <div>
          <p className="mb-1 text-[11px] font-medium text-[var(--warning)]">
            Skipped by the rules ({result.skipped.length})
          </p>
          <ul className="space-y-0.5 text-[11.5px] text-[var(--text-3)]">
            {result.skipped.slice(0, 20).map((s, i) => (
              <li key={i}>
                {describeOptions(s.options)} — {s.problems.map((p) => p.message).join(" ")}
              </li>
            ))}
            {result.skipped.length > 20 ? <li>…and {result.skipped.length - 20} more.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function describeOptions(options: unknown): string {
  if (Array.isArray(options)) {
    return options
      .map((o) => (o && typeof o === "object" ? String((o as { label?: string; value?: string }).label ?? (o as { value?: string }).value) : String(o)))
      .join(" / ");
  }
  if (options && typeof options === "object") {
    return Object.values(options as Record<string, unknown>)
      .map((v) => (v && typeof v === "object" ? String((v as { label?: string; code?: string }).label ?? (v as { code?: string }).code) : String(v)))
      .join(" / ");
  }
  return "Combination";
}

function PreviewGroup({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "positive" | "info" | "neutral";
  rows: VariantPreview[];
}) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-2)]">
        {title}
        <Badge tone={tone} className="px-1 py-0 text-[10px]">
          {rows.length}
        </Badge>
      </p>
      <ul className="divide-y divide-[var(--hairline)] rounded-[6px] border border-[var(--hairline)]">
        {rows.slice(0, 50).map((v) => (
          <li key={v.variantCode} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
            <span className="text-[12px] text-[var(--text-1)]">{v.label}</span>
            <OptionChips options={v.options} />
            <code className="ml-auto font-mono text-[10.5px] text-[var(--text-3)]">{v.variantCode}</code>
            {v.totalSupply != null ? (
              <span className="text-[11px] text-[var(--text-3)]">cap {formatNumber(v.totalSupply)}</span>
            ) : null}
          </li>
        ))}
        {rows.length > 50 ? (
          <li className="px-2 py-1.5 text-[11px] text-[var(--text-3)]">…and {rows.length - 50} more.</li>
        ) : null}
      </ul>
    </div>
  );
}
