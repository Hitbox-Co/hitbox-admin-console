"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Archive, ArrowLeft, Plus, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAddDimension,
  useAddDimensionValue,
  useDropType,
  useSetDimensionArchived,
  useSetDimensionValueArchived,
  useUpdateDimension,
  useUpdateDropType,
} from "@/lib/api/hooks";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePageChrome } from "@/components/layout/app-shell";
import { usePermissions } from "@/components/layout/authz-provider";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
  PanelHeader,
  Skeleton,
  Textarea,
  Tooltip,
} from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { describeRule } from "./generate-variants-dialog";
import { HexColorInput, MODE_COPY, ModeBadge, Swatch, normalizeHex } from "./variant-bits";
import type { DropType, DropTypeDimension, DropTypeRule, VariantMode } from "@/lib/types";

/**
 * One drop type: its settings, dimensions, values and rules
 * (drop-types-and-variants.md §5, §10).
 *
 * Every write returns the whole updated type, which the hooks put straight
 * into the cache — no refetch. What changing each part does to drops already
 * using the type:
 *   - adding a value or an optional dimension: nothing;
 *   - renaming a value / changing its hex: nothing — variants keep snapshots;
 *   - archiving: existing variants keep it, new ones can't use it;
 *   - rules or a new required dimension: bumps `version`, never re-checked
 *     against existing variants;
 *   - `variantMode`: only while no drop uses the type.
 */
export function DropTypeDetailView({ code }: { code: string }) {
  const perms = usePermissions();
  const canManage = perms.canManageDropTypes();
  const query = useDropType(code);
  const type = query.data;

  usePageChrome({
    title: type?.name ?? "Drop type",
    description: type ? `Drop type ${type.code}` : undefined,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError || !type) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Panel>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Panel>
      </div>
    );
  }

  const dims = [...type.dimensions].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-4">
      <BackLink />

      <Panel className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Mono className="text-[11px]">{type.code}</Mono>
              <ModeBadge mode={type.variantMode} />
              {type.isActive ? (
                <Badge tone="positive" dot>
                  Active
                </Badge>
              ) : (
                <Badge tone="neutral" outline>
                  Inactive — can&rsquo;t be picked for new drops
                </Badge>
              )}
            </div>
            <p className="max-w-3xl text-[13px] leading-relaxed text-[var(--text-2)]">
              {type.description ?? "No description."}
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:text-right">
            <dt className="text-[var(--text-3)]">Drops using it</dt>
            <dd className="tnum text-[var(--text-1)]">
              {type.dropCount != null ? formatNumber(type.dropCount) : "—"}
            </dd>
            <dt className="text-[var(--text-3)]">Rules version</dt>
            <dd className="tnum text-[var(--text-1)]">v{type.version}</dd>
            <dt className="text-[var(--text-3)]">Variant code</dt>
            <dd>
              <Mono className="text-[10.5px]">{type.variantCodePattern}</Mono>
            </dd>
            <dt className="text-[var(--text-3)]">Updated</dt>
            <dd className="text-[var(--text-1)]">{formatDateTime(type.updatedAt)}</dd>
          </dl>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Dimensions"
              description={
                type.variantMode === "NONE"
                  ? "A type with no variants has no dimensions."
                  : "What a variant varies along, and the values it may take."
              }
            />
            {dims.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--text-3)]">
                {type.variantMode === "NONE" ? "None — by design." : "No dimensions yet."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--hairline)]">
                {dims.map((d) => (
                  <DimensionRow
                    key={d.code}
                    typeCode={type.code}
                    dimension={d}
                    canManage={canManage}
                    namedByRule={type.rules.some((r) => ruleNames(r).includes(d.code))}
                  />
                ))}
              </ul>
            )}
            {canManage && type.variantMode !== "NONE" ? <AddDimension typeCode={type.code} /> : null}
          </Panel>

          <RulesPanel type={type} canManage={canManage} />
        </div>

        <aside className="min-w-0 space-y-4">
          {/* Remounted on each save so the form starts from the saved type. */}
          {canManage ? <SettingsPanel key={type.updatedAt} type={type} /> : null}
          <Panel>
            <PanelHeader title="What changes affect" />
            <ul className="space-y-1.5 px-4 py-3 text-[11.5px] leading-relaxed text-[var(--text-3)]">
              <li>Adding a value or optional dimension — nothing existing changes.</li>
              <li>Renaming a value or its colour — existing variants keep their snapshot.</li>
              <li>Archiving — existing variants keep it; new ones can&rsquo;t use it.</li>
              <li>
                Rules or a new required dimension — bumps the version; existing variants are
                never re-checked.
              </li>
              <li>Variant mode — only while no drop uses the type.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/products/types"
      className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      All drop types
    </Link>
  );
}

function ruleNames(r: DropTypeRule): string[] {
  return r.kind === "exclude"
    ? Object.keys(r.match)
    : [...Object.keys(r.when), ...r.dimensions];
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.validationSummary ?? err.friendly : fallback;
}

function DimensionRow({
  typeCode,
  dimension: d,
  canManage,
  namedByRule,
}: {
  typeCode: string;
  dimension: DropTypeDimension;
  canManage: boolean;
  namedByRule: boolean;
}) {
  const update = useUpdateDimension(typeCode);
  const setArchived = useSetDimensionArchived(typeCode);
  const setValueArchived = useSetDimensionValueArchived(typeCode);
  const isColor = d.displayType === "COLOR";
  const values = [...d.values].sort((a, b) => a.position - b.position);

  const toggle = (field: "required" | "allowCustomValues", next: boolean) =>
    update.mutate(
      { dimension: d.code, body: { [field]: next } },
      {
        onSuccess: () => toast.success(`${d.label} updated`),
        onError: (err) => toast.error(errorText(err, "Could not update the dimension.")),
      }
    );

  return (
    <li className={cn("space-y-2 px-4 py-3", d.archived && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-[var(--text-1)]">{d.label}</span>
        <Mono className="text-[10px]">{d.code}</Mono>
        <Badge tone={d.required ? "accent" : "neutral"} className="px-1 py-0 text-[10px]">
          {d.required ? "Required" : "Optional"}
        </Badge>
        {isColor ? (
          <Badge tone="info" className="px-1 py-0 text-[10px]">
            Colour swatches
          </Badge>
        ) : null}
        {d.allowCustomValues ? (
          <Badge tone="neutral" className="px-1 py-0 text-[10px]">
            Custom values allowed
          </Badge>
        ) : null}
        {d.archived ? (
          <Badge tone="neutral" outline className="px-1 py-0 text-[10px]">
            Archived
          </Badge>
        ) : null}

        {canManage ? (
          <span className="ml-auto flex items-center gap-1">
            {!d.archived ? (
              <>
                <label className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                  <input
                    type="checkbox"
                    checked={d.required}
                    disabled={update.isPending}
                    onChange={(e) => toggle("required", e.target.checked)}
                    className="h-3 w-3 accent-[var(--accent)]"
                  />
                  Required
                </label>
                <label className="ml-2 flex items-center gap-1 text-[11px] text-[var(--text-3)]">
                  <input
                    type="checkbox"
                    checked={d.allowCustomValues}
                    disabled={update.isPending}
                    onChange={(e) => toggle("allowCustomValues", e.target.checked)}
                    className="h-3 w-3 accent-[var(--accent)]"
                  />
                  Custom values
                </label>
              </>
            ) : null}
            <Tooltip
              content={
                !d.archived && namedByRule
                  ? "A rule still names this dimension — edit the rules first."
                  : d.archived
                    ? "Make it available to new variants again."
                    : "Hide it from new variants. Existing variants keep it."
              }
            >
              <span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={(!d.archived && namedByRule) || setArchived.isPending}
                  onClick={() =>
                    setArchived.mutate(
                      { dimension: d.code, archived: !d.archived },
                      {
                        onSuccess: () => toast.success(`${d.label} ${d.archived ? "restored" : "archived"}`),
                        onError: (err) => toast.error(errorText(err, "Could not change the dimension.")),
                      }
                    )
                  }
                >
                  {d.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  {d.archived ? "Restore" : "Archive"}
                </Button>
              </span>
            </Tooltip>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 ? (
          <span className="text-[11.5px] text-[var(--text-3)]">
            {d.allowCustomValues ? "No preset values — every value is entered per drop." : "No values yet."}
          </span>
        ) : (
          values.map((v) => (
            <span
              key={v.code}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text-1)]",
                v.archived && "border-dashed text-[var(--text-3)] line-through"
              )}
              title={`${v.code}${v.hexCode ? ` · ${v.hexCode}` : ""}${v.archived ? " · archived" : ""}`}
            >
              {isColor ? <Swatch hex={v.hexCode} /> : null}
              {v.label}
              {v.label !== v.code ? (
                <span className="font-mono text-[10px] text-[var(--text-3)]">{v.code}</span>
              ) : null}
              {canManage && !d.archived ? (
                <button
                  type="button"
                  aria-label={v.archived ? `Restore ${v.label}` : `Archive ${v.label}`}
                  title={v.archived ? "Restore" : "Archive — existing variants keep it"}
                  disabled={setValueArchived.isPending}
                  onClick={() =>
                    setValueArchived.mutate(
                      { dimension: d.code, value: v.code, archived: !v.archived },
                      {
                        onSuccess: () => toast.success(`${v.label} ${v.archived ? "restored" : "archived"}`),
                        onError: (err) => toast.error(errorText(err, "Could not change the value.")),
                      }
                    )
                  }
                  className="text-[var(--text-3)] no-underline hover:text-[var(--text-1)]"
                >
                  {v.archived ? <RotateCcw className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                </button>
              ) : null}
            </span>
          ))
        )}
      </div>

      {canManage && !d.archived ? <AddValue typeCode={typeCode} dimension={d} /> : null}
    </li>
  );
}

function AddValue({ typeCode, dimension: d }: { typeCode: string; dimension: DropTypeDimension }) {
  const add = useAddDimensionValue(typeCode);
  const isColor = d.displayType === "COLOR";
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [hex, setHex] = React.useState("");
  const [useHex, setUseHex] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11.5px] text-[var(--accent-text)] hover:underline"
      >
        <Plus className="h-3 w-3" />
        Add value
      </button>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(c)) {
      setError("Code: 1–12 letters or digits, no dashes.");
      return;
    }
    if (!label.trim()) {
      setError("A label is required.");
      return;
    }
    const hexCode = isColor && useHex ? normalizeHex(hex) : null;
    if (isColor && useHex && !hexCode) {
      setError("Colour: a hex code such as #1A1A1A — or untick Swatch for none.");
      return;
    }
    add.mutate(
      {
        dimension: d.code,
        body: { code: c, label: label.trim(), ...(isColor ? { hexCode } : {}) },
      },
      {
        onSuccess: () => {
          toast.success(`${label.trim()} added to ${d.label}`);
          setCode("");
          setLabel("");
          setHex("");
          setError(null);
          setOpen(false);
        },
        onError: (err) => setError(errorText(err, "Could not add the value.")),
      }
    );
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-2"
    >
      <Field label="Code" htmlFor={`nv-code-${d.code}`} className="w-24">
        <Input
          id={`nv-code-${d.code}`}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 12))}
          placeholder={isColor ? "GRN" : "XL"}
          autoFocus
        />
      </Field>
      <Field label="Label" htmlFor={`nv-label-${d.code}`} className="min-w-[120px] flex-1">
        <Input
          id={`nv-label-${d.code}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={isColor ? "Forest Green" : "XL"}
        />
      </Field>
      {isColor ? (
        <Field label="Colour" htmlFor={`nv-hex-${d.code}`}>
          <span className="flex items-center gap-1.5">
            <HexColorInput id={`nv-hex-${d.code}`} value={hex} onChange={setHex} disabled={!useHex} />
            <label className="flex items-center gap-1 text-[11px] text-[var(--text-3)]">
              <input
                type="checkbox"
                checked={useHex}
                onChange={(e) => setUseHex(e.target.checked)}
                className="h-3 w-3 accent-[var(--accent)]"
              />
              Swatch
            </label>
          </span>
        </Field>
      ) : null}
      <Button type="submit" size="sm" variant="primary" loading={add.isPending}>
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error ? <p className="w-full text-[11px] text-[var(--danger)]">{error}</p> : null}
    </form>
  );
}

function AddDimension({ typeCode }: { typeCode: string }) {
  const add = useAddDimension(typeCode);
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [required, setRequired] = React.useState(false);
  const [color, setColor] = React.useState(false);
  const [custom, setCustom] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) {
    return (
      <div className="border-t border-[var(--hairline)] px-4 py-2.5">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add dimension
        </Button>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z][A-Za-z0-9]*$/.test(code.trim())) {
      setError("Code: camelCase, starting lower-case (e.g. size, packSize).");
      return;
    }
    if (!label.trim()) {
      setError("A label is required.");
      return;
    }
    add.mutate(
      {
        code: code.trim(),
        label: label.trim(),
        required,
        allowCustomValues: custom,
        displayType: color ? "COLOR" : "TEXT",
      },
      {
        onSuccess: () => {
          toast.success(
            required
              ? `${label.trim()} added — the rules version went up; existing variants are not re-checked`
              : `${label.trim()} added`
          );
          setOpen(false);
          setCode("");
          setLabel("");
          setError(null);
        },
        onError: (err) => setError(errorText(err, "Could not add the dimension.")),
      }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" htmlFor="nd-code" required>
          <Input
            id="nd-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
            placeholder="material"
            autoFocus
          />
        </Field>
        <Field label="Label" htmlFor="nd-label" required>
          <Input id="nd-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Material" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-[12px] text-[var(--text-2)]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
          Required on every variant
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={color} onChange={(e) => setColor(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
          Colour (values carry swatches)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
          Allow custom values per drop
        </label>
      </div>
      <p className="text-[11px] text-[var(--text-3)]">Values are added once the dimension exists.</p>
      {error ? <p className="text-[11px] text-[var(--danger)]">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={add.isPending}>
          Add dimension
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * Rules read as sentences; a System Admin edits them as JSON — the list is
 * REPLACED on save (PATCH { rules }) and the type's version goes up.
 */
function RulesPanel({ type, canManage }: { type: DropType; canManage: boolean }) {
  const update = useUpdateDropType(type.code);
  const [editing, setEditing] = React.useState(false);
  const [raw, setRaw] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const label = (c: string) => type.dimensions.find((d) => d.code === c)?.label ?? c;

  const start = () => {
    setRaw(JSON.stringify(type.rules, null, 2));
    setError(null);
    setEditing(true);
  };

  const save = () => {
    let rules: DropTypeRule[];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Rules must be a JSON array.");
      rules = parsed;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not valid JSON.");
      return;
    }
    update.mutate(
      { rules },
      {
        onSuccess: (t) => {
          toast.success(`Rules saved — now v${t.version}. Existing variants are not re-checked.`);
          setEditing(false);
        },
        onError: (err) => setError(errorText(err, "Could not save the rules.")),
      }
    );
  };

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Rules"
        description="Constraints between dimensions — e.g. pack size only for packs."
        action={
          canManage && type.variantMode !== "NONE" && !editing ? (
            <Button variant="secondary" size="sm" onClick={start}>
              Edit rules
            </Button>
          ) : null
        }
      />
      {editing ? (
        <div className="space-y-2 px-4 py-3">
          <Textarea
            rows={10}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="font-mono text-[11.5px]"
            spellCheck={false}
            aria-label="Rules JSON"
          />
          <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
            Kinds: <Mono className="text-[10px]">{`{"kind":"require","when":{"format":"PACK"},"dimensions":["packSize"]}`}</Mono>,{" "}
            <Mono className="text-[10px]">forbid</Mono> (same shape), and{" "}
            <Mono className="text-[10px]">{`{"kind":"exclude","match":{...}}`}</Mono>. Up to 50.
          </p>
          {error ? <p className="text-[11px] text-[var(--danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" loading={update.isPending} onClick={save}>
              Save rules
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : type.rules.length ? (
        <ul className="divide-y divide-[var(--hairline)]">
          {type.rules.map((r, i) => (
            <li key={i} className="flex items-start gap-2 px-4 py-2 text-[12.5px] text-[var(--text-2)]">
              <Badge tone="neutral" className="mt-px px-1 py-0 text-[10px]">
                {r.kind}
              </Badge>
              {describeRule(r, label)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-[12px] text-[var(--text-3)]">No rules — every combination is allowed.</p>
      )}
    </Panel>
  );
}

function SettingsPanel({ type }: { type: DropType }) {
  const update = useUpdateDropType(type.code);
  const [name, setName] = React.useState(type.name);
  const [description, setDescription] = React.useState(type.description ?? "");
  const [mode, setMode] = React.useState<VariantMode>(type.variantMode);
  const [pattern, setPattern] = React.useState(type.variantCodePattern);
  const [error, setError] = React.useState<string | null>(null);
  const inUse = (type.dropCount ?? 0) > 0;

  const body: Record<string, unknown> = {};
  if (name.trim() !== type.name) body.name = name.trim();
  if ((description.trim() || null) !== type.description) body.description = description.trim() || null;
  if (mode !== type.variantMode) body.variantMode = mode;
  if (pattern.trim() !== type.variantCodePattern) body.variantCodePattern = pattern.trim();
  const dirty = Object.keys(body).length > 0;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    if (!pattern.includes("{groupCode}") || !pattern.includes("{values}")) {
      setError("The pattern must contain both {groupCode} and {values}.");
      return;
    }
    setError(null);
    update.mutate(body, {
      onSuccess: () => toast.success(`${name.trim()} saved`),
      onError: (err) => setError(errorText(err, "Could not save the type.")),
    });
  };

  const toggleActive = () =>
    update.mutate(
      { isActive: !type.isActive },
      {
        onSuccess: (t) =>
          toast.success(
            t.isActive ? `${t.name} re-activated` : `${t.name} deactivated — existing drops keep working`
          ),
        onError: (err) => toast.error(errorText(err, "Could not change the type.")),
      }
    );

  return (
    <Panel>
      <PanelHeader title="Settings" description="System Admin only." />
      <form onSubmit={save} className="space-y-3 px-4 py-3">
        <Field label="Name" htmlFor="ts-name">
          <Input id="ts-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="ts-desc">
          <Textarea id="ts-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field
          label="Variants"
          htmlFor="ts-mode"
          hint={inUse ? `Locked — ${formatNumber(type.dropCount ?? 0)} drops use this type.` : MODE_COPY[mode].help}
        >
          <select
            id="ts-mode"
            value={mode}
            disabled={inUse}
            onChange={(e) => setMode(e.target.value as VariantMode)}
            className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] disabled:opacity-50"
          >
            <option value="REQUIRED">Required</option>
            <option value="OPTIONAL">Optional</option>
            <option value="NONE">None</option>
          </select>
        </Field>
        <Field label="Variant code pattern" htmlFor="ts-pattern" hint="Tokens {groupCode} and {values}, both required.">
          <Input id="ts-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" />
        </Field>
        {error ? <p className="text-[11px] text-[var(--danger)]">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={!dirty} loading={update.isPending && dirty}>
            Save
          </Button>
          <Button type="button" variant={type.isActive ? "ghost" : "secondary"} size="sm" onClick={toggleActive}>
            {type.isActive ? "Deactivate" : "Re-activate"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
