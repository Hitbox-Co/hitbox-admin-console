"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Lock, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useCreateRole,
  useDeleteRole,
  usePermissionCatalog,
  useUpdateRole,
} from "@/lib/api/hooks";
import { humanize } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import {
  Badge,
  Button,
  Field,
  Input,
  Panel,
  PanelHeader,
  Tooltip,
} from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { PermissionTree } from "./permission-tree";
import type { PermissionDomain, Role } from "@/lib/types";

const ENTITY_GROUPS = ["hitbox", "brand_artist", "end_user"];

/**
 * `name` and `displayName` are the fields this form's own `validate()`
 * actually refuses to submit without — `entityGroup`/`domain` are pickers
 * that always carry a value, and `permissions` is validated separately (its
 * own "select at least one" message) rather than through a text Field.
 */
const roleSchema = z.object({
  name: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
});
const REQUIRED_ROLE = requiredKeys(roleSchema);

export function RoleForm({ role }: { role?: Role }) {
  const router = useRouter();
  const isEdit = !!role;
  const readOnly = !!role?.isSystem;

  const [name, setName] = React.useState(role?.name ?? "");
  const [displayName, setDisplayName] = React.useState(role?.displayName ?? "");
  const [entityGroup, setEntityGroup] = React.useState(role?.entityGroup ?? "hitbox");
  const [domain, setDomain] = React.useState<PermissionDomain>(role?.domain ?? "BUSINESS");
  // The API returns {key, description} objects; the picker works in keys.
  const [permissions, setPermissions] = React.useState<string[]>(() =>
    (role?.permissions ?? []).map((p) => p.key)
  );
  const [isActive, setIsActive] = React.useState(role?.isActive ?? true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const catalog = usePermissionCatalog();
  const create = useCreateRole();
  const update = useUpdateRole(role?.id ?? "");
  const remove = useDeleteRole();

  // Switching domain drops any selection that no longer belongs, so the
  // payload can never mix domains.
  const changeDomain = (next: PermissionDomain) => {
    if (next === domain) return;
    const allowed = new Set(
      (catalog.data ?? [])
        .filter((g) => g.domain === next)
        .flatMap((g) => g.permissions.map((p) => p.key))
    );
    setPermissions((prev) => prev.filter((k) => allowed.has(k)));
    setDomain(next);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Required.";
    else if (!/^[A-Z][A-Z0-9_]*$/.test(name.trim()))
      next.name = "Must be SCREAMING_SNAKE_CASE — capitals, digits and underscores.";
    if (!displayName.trim()) next.displayName = "Required.";
    if (permissions.length === 0)
      next.permissions = "Select at least one permission.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onApiError = (e: unknown) => {
    if (e instanceof ApiError) {
      const fields = e.fieldErrors;
      if (Object.keys(fields).length) setErrors(fields);
      if (e.code === "AUTHZ_DOMAIN_VIOLATION") {
        const offending = (e.details as { permissions?: string[] })?.permissions ?? [];
        setErrors({
          permissions: `These permissions are not in the ${domain} domain: ${offending.join(", ")}`,
        });
      }
      toast.error(e.friendly);
    } else {
      toast.error("Could not save the role.");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!validate()) return;

    if (isEdit) {
      // `domain` is deliberately not sent — it is immutable server-side.
      update.mutate(
        { displayName, entityGroup, permissions, isActive },
        {
          onSuccess: () => {
            toast.success("Role updated");
            router.push("/roles");
          },
          onError: onApiError,
        }
      );
    } else {
      create.mutate(
        { name: name.trim(), displayName, entityGroup, domain, permissions },
        {
          onSuccess: () => {
            toast.success("Role created");
            router.push("/roles");
          },
          onError: onApiError,
        }
      );
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" type="button" onClick={() => router.push("/roles")}>
          <ArrowLeft className="h-3.5 w-3.5" />
          All roles
        </Button>
        {readOnly ? (
          <Badge tone="neutral" className="gap-1">
            <Lock className="h-3 w-3" aria-hidden />
            Seeded role — permissions are read-only
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-1">
          <PanelHeader title="Identity" />
          <div className="space-y-4 px-4 py-4">
            <Field
              label="Name"
              htmlFor="role-name"
              error={errors.name}
              required={REQUIRED_ROLE.has("name")}
              hint="SCREAMING_SNAKE_CASE. Cannot be changed after creation."
            >
              <Input
                id="role-name"
                value={name}
                invalid={!!errors.name}
                disabled={isEdit}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                placeholder="BRAND_CONTENT_EDITOR"
                className="font-mono"
              />
            </Field>

            <Field
              label="Display name"
              htmlFor="role-display"
              error={errors.displayName}
              required={REQUIRED_ROLE.has("displayName")}
            >
              <Input
                id="role-display"
                value={displayName}
                invalid={!!errors.displayName}
                disabled={readOnly}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Brand Content Editor"
              />
            </Field>

            <Field
              label="Entity group"
              hint="Decides the role's natural scope when it is assigned."
            >
              <select
                value={entityGroup}
                disabled={readOnly}
                onChange={(e) => setEntityGroup(e.target.value)}
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)] disabled:opacity-50"
              >
                {ENTITY_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {humanize(g)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Domain"
              hint="Every permission on the role must belong to this domain."
            >
              <div className="flex gap-1.5">
                {(["BUSINESS", "TECHNICAL"] as const).map((dv) => (
                  <button
                    key={dv}
                    type="button"
                    disabled={readOnly}
                    onClick={() => changeDomain(dv)}
                    className={`pressable flex-1 rounded-[6px] border px-2 py-1.5 text-[12px] transition-colors disabled:opacity-50 ${
                      domain === dv
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent-text)]"
                        : "border-[var(--hairline)] text-[var(--text-2)] hover:border-[var(--hairline-strong)]"
                    }`}
                  >
                    {humanize(dv)}
                  </button>
                ))}
              </div>
            </Field>

            {isEdit ? (
              <Field
                label="State"
                hint={
                  readOnly
                    ? "A seeded role cannot be deleted, but it can be deactivated."
                    : undefined
                }
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  <span className="text-[13px] text-[var(--text-1)]">
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </label>
              </Field>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            {/* A seeded role's permissions are immutable, but deactivating is allowed. */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={saving}
              disabled={readOnly && !isEdit}
            >
              {isEdit ? "Save changes" : "Create role"}
            </Button>

            {isEdit && !role?.isSystem ? (
              <Tooltip
                content={
                  "Deleting is refused while the role is still assigned " +
                  "(409 AUTHZ_ROLE_IN_USE) - revoke every assignment first."
                }
              >
                <span className="ml-auto">
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    loading={remove.isPending}
                    onClick={() => {
                      remove.mutate(role!.id, {
                        onSuccess: () => {
                          toast.success("Role deleted");
                          router.push("/roles");
                        },
                        onError: onApiError,
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </span>
              </Tooltip>
            ) : null}
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Permissions"
            description="Chosen from the catalog the backend publishes — never typed by hand."
          />
          <div className="px-4 py-4">
            {catalog.isLoading ? (
              <p className="text-[13px] text-[var(--text-3)]">Loading catalog…</p>
            ) : catalog.isError ? (
              <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />
            ) : (
              <>
                {errors.permissions ? (
                  <p className="mb-3 rounded-[6px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-2.5 py-2 text-[12px] text-[var(--danger)]">
                    {errors.permissions}
                  </p>
                ) : null}
                <PermissionTree
                  groups={catalog.data ?? []}
                  selected={permissions}
                  onChange={setPermissions}
                  domain={domain}
                  readOnly={readOnly}
                />
              </>
            )}
          </div>
        </Panel>
      </div>
    </form>
  );
}
