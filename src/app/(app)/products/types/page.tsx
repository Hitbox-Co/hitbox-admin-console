"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Plus, Shapes, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCreateDropType, useDropTypes } from "@/lib/api/hooks";
import { PageActions, usePageChrome } from "@/components/layout/app-shell";
import { PageGuard } from "@/components/layout/page-guard";
import { usePermissions } from "@/components/layout/authz-provider";
import { Badge, Button, Field, Input, Mono, Panel, Textarea } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { MODE_COPY, ModeBadge, Swatch } from "@/components/products/variant-bits";
import type { DropType, VariantMode } from "@/lib/types";

/**
 * Drop types — the kinds of product a drop can be, and the variant rules
 * each carries (drop-types-and-variants.md §4, §5).
 *
 * Reading takes drop:read (platform-wide, as the route carries no
 * organization context). Creating and editing a type changes the rules for
 * every drop that uses it, so those take drop-type:manage:global — System
 * Admin only — and are absent, not disabled, for everyone else.
 */
export default function DropTypesPage() {
  return (
    <PageGuard
      can={(p) => p.canOpen("/products/types")}
      what="Drop types"
      requires="drop:read (platform-wide)"
    >
      <DropTypesView />
    </PageGuard>
  );
}

function DropTypesView() {
  const router = useRouter();
  const perms = usePermissions();
  const canManage = perms.canManageDropTypes();
  const [creating, setCreating] = React.useState(false);
  // Inactive types are only interesting to whoever can re-activate them.
  const query = useDropTypes(canManage);

  usePageChrome({
    title: "Drop types",
    description: "What a drop can be, and which variants each kind may have.",
  });

  const rows = React.useMemo(
    () => [...(query.data ?? [])].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)),
    [query.data]
  );

  const columns = React.useMemo<Column<DropType>[]>(
    () => [
      {
        key: "name",
        header: "Type",
        cell: (t) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-1)]">{t.name}</p>
            <Mono className="mt-0.5 text-[10px]">{t.code}</Mono>
          </div>
        ),
      },
      {
        key: "mode",
        header: "Variants",
        cell: (t) => <ModeBadge mode={t.variantMode} />,
      },
      {
        key: "dimensions",
        header: "Varies by",
        cell: (t) => {
          const dims = t.dimensions.filter((d) => !d.archived);
          if (!dims.length) return <span className="text-[12px] text-[var(--text-3)]">—</span>;
          return (
            <div className="space-y-0.5">
              {dims.map((d) => {
                const vals = d.values.filter((v) => !v.archived);
                return (
                  <p key={d.code} className="flex flex-wrap items-center gap-1 text-[11.5px] text-[var(--text-2)]">
                    <span className="text-[var(--text-3)]">{d.label}:</span>
                    {d.displayType === "COLOR"
                      ? vals.map((v) => <Swatch key={v.code} hex={v.hexCode} size={10} />)
                      : vals.map((v) => v.label).join(" · ")}
                    {d.allowCustomValues ? <span className="text-[var(--text-3)]">+ custom</span> : null}
                  </p>
                );
              })}
            </div>
          );
        },
      },
      {
        key: "rules",
        header: "Rules",
        numeric: true,
        cell: (t) => t.rules.length || "—",
      },
      {
        key: "version",
        header: "Version",
        numeric: true,
        cell: (t) => `v${t.version}`,
      },
      {
        key: "status",
        header: "Status",
        cell: (t) =>
          t.isActive ? (
            <Badge tone="positive" dot>
              Active
            </Badge>
          ) : (
            <Badge tone="neutral" outline>
              Inactive
            </Badge>
          ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      {canManage ? (
        <PageActions>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New type
          </Button>
        </PageActions>
      ) : null}

      <Panel className="overflow-hidden">
        {query.isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(t) => t.code}
            onRowClick={(t) => router.push(`/products/types/${t.code}`)}
            dimmed={query.isFetching}
            emptyState={
              <EmptyState
                icon={Shapes}
                title="No drop types"
                description="Seed the built-in types with pnpm db:seed:drop-types, or create one."
              />
            }
          />
        )}
      </Panel>

      {creating ? (
        <CreateDropTypeDialog
          onClose={() => setCreating(false)}
          onCreated={(t) => router.push(`/products/types/${t.code}`)}
        />
      ) : null}
    </div>
  );
}

/**
 * Creates the type shell — code, name, mode. Dimensions and values are added
 * on the type's own page, where each one is its own validated write.
 */
function CreateDropTypeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: DropType) => void;
}) {
  const create = useCreateDropType();
  const [name, setName] = React.useState("");
  // The code follows the name ("T-Shirt" -> T_SHIRT) until the operator types
  // in the code field themselves; clearing it hands it back to the name.
  const [codeOverride, setCodeOverride] = React.useState<string | null>(null);
  const code = codeOverride ?? codeFromName(name);
  const [description, setDescription] = React.useState("");
  const [mode, setMode] = React.useState<VariantMode>("REQUIRED");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    const next: Record<string, string> = {};
    const c = code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(c)) {
      next.code = "2–40 characters: A–Z, 0–9 and _, starting with a letter (e.g. HOODIE).";
    }
    if (!name.trim()) next.name = "A name is required.";
    setErrors(next);
    if (Object.keys(next).length) return;

    create.mutate(
      { code: c, name: name.trim(), description: description.trim() || null, variantMode: mode },
      {
        onSuccess: (t) => {
          toast.success(
            mode === "NONE" ? `${t.name} created` : `${t.name} created — add its dimensions next`
          );
          onCreated(t);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "PRODUCTS_DROP_TYPE_CODE_TAKEN") {
            setErrors({ code: err.friendly });
            return;
          }
          if (err instanceof ApiError && err.status === 422) setErrors(err.fieldErrors);
          toast.error(err instanceof ApiError ? err.validationSummary ?? err.friendly : "Could not create the type.");
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] w-[min(500px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                New drop type
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                Its code never changes once created.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="space-y-4 px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" htmlFor="dt-name" error={errors.name} required>
                <Input
                  id="dt-name"
                  value={name}
                  invalid={!!errors.name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Hoodie"
                  autoFocus
                />
              </Field>
              <Field
                label="Code"
                htmlFor="dt-code"
                error={errors.code}
                required
                hint={codeOverride === null ? "Generated from the name. Edit to override." : "Clear it to generate from the name again."}
              >
                <Input
                  id="dt-code"
                  value={code}
                  invalid={!!errors.code}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 40);
                    setCodeOverride(v === "" ? null : v);
                  }}
                  placeholder="HOODIE"
                  className="font-mono"
                />
              </Field>
            </div>
            <Field label="Description" htmlFor="dt-desc">
              <Textarea
                id="dt-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Apparel sold by size and colour."
              />
            </Field>
            <Field
              label="Variants"
              htmlFor="dt-mode"
              hint={`${MODE_COPY[mode].help} It can change later only while no drop uses the type.`}
            >
              <select
                id="dt-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as VariantMode)}
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
              >
                <option value="REQUIRED">Required — every unit belongs to a variant</option>
                <option value="OPTIONAL">Optional — may have variants</option>
                <option value="NONE">None — one sellable item</option>
              </select>
            </Field>
            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" variant="primary" size="sm" loading={create.isPending}>
                Create type
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

/**
 * "T-Shirt" -> T_SHIRT, "Action Figure" -> ACTION_FIGURE. Matches the
 * server's rule: A–Z, 0–9 and _, starting with a letter, at most 40.
 */
function codeFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^[^A-Z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 40)
    .replace(/_+$/, "");
}
