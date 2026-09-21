"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAssignRole,
  useRevokeRole,
  useRoles,
  useUserRoles,
} from "@/lib/api/hooks";
import { formatDate, humanize, personLabel } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import {
  Badge,
  Button,
  Field,
  Mono,
  Skeleton,
  Tooltip,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { Role, ScopeType, TeamMember } from "@/lib/types";
import { ORGANIZATION_OPTIONS } from "./organizations";

/**
 * `roleId` is always required (POST body, admin-write-apis.md §7).
 * `organizationId` is required only for an ORGANIZATION-scoped assignment —
 * conditional on `effectiveScope`, so it is asserted directly at its Field
 * rather than folded into this schema, the same way the create form handles
 * its own checkbox-gated field.
 */
const assignmentSchema = z.object({ roleId: z.string().min(1) });
const REQUIRED_ASSIGNMENT = requiredKeys(assignmentSchema);

/**
 * Role assignment.
 *
 * A person holds a LIST of roles, not one — so this is an additive list with
 * per-row revoke, never a single-select dropdown. Revoking sends
 * `?organizationId=` when the assignment has one, since the same role can be
 * held at several organizations at once (authentication.md §5) and that pair
 * is the real uniqueness key, not roleId alone.
 */
export function AssignmentDrawer({
  user,
  onClose,
}: {
  user: TeamMember;
  onClose: () => void;
}) {
  const assignments = useUserRoles(user.userId);
  const rolesQuery = useRoles();
  const assign = useAssignRole(user.userId);
  const revoke = useRevokeRole(user.userId);

  const [roleId, setRoleId] = React.useState("");
  const [scopeType, setScopeType] = React.useState<ScopeType | "">("");
  const [organizationId, setOrganizationId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const selectedRole: Role | undefined = rolesQuery.data?.find(
    (r) => r.id === roleId
  );

  // `scopeType` is optional — it defaults to the role's natural scope.
  const naturalScope: ScopeType = selectedRole
    ? selectedRole.entityGroup === "brand_artist"
      ? "ORGANIZATION"
      : selectedRole.entityGroup === "end_user"
        ? "OWN"
        : "GLOBAL"
    : "GLOBAL";

  const effectiveScope = (scopeType || naturalScope) as ScopeType;

  const liveAssignments = (assignments.data ?? []).filter((a) => !a.revokedAt);
  // A role may be held again at a DIFFERENT organization, so it is only
  // fully "held" for the picker when every org-scoped slot isn't relevant —
  // simplest honest rule: still offer it, since (roleId, organizationId) is
  // the real uniqueness key and the backend enforces duplicates itself.
  const held = new Set(liveAssignments.map((a) => a.roleId));
  const available = (rolesQuery.data ?? []).filter(
    (r) => r.isActive && (r.entityGroup === "brand_artist" || !held.has(r.id))
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!roleId) next.roleId = "Pick a role.";
    if (effectiveScope === "ORGANIZATION" && !organizationId)
      next.organizationId = "Required for organization scope.";
    setErrors(next);
    if (Object.keys(next).length) return;

    assign.mutate(
      {
        roleId,
        scopeType: scopeType || undefined,
        organizationId: effectiveScope === "ORGANIZATION" ? organizationId : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Role assigned");
          setRoleId("");
          setScopeType("");
          setOrganizationId("");
          setErrors({});
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            const fields = err.fieldErrors;
            if (Object.keys(fields).length) setErrors(fields);
            toast.error(err.friendly);
          } else {
            toast.error("Could not assign the role.");
          }
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="rx-content fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {personLabel(user)}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-[12px] text-[var(--text-3)]">
                {user.email}
              </Dialog.Description>
              <Mono className="mt-1.5 inline-block text-[10px]">{user.userId}</Mono>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto">
            <section className="px-4 py-4">
              <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
                Current roles
              </h3>

              {assignments.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : assignments.isError ? (
                <ErrorState
                  error={assignments.error}
                  onRetry={() => assignments.refetch()}
                />
              ) : liveAssignments.length === 0 ? (
                <EmptyState
                  title="No roles assigned"
                  description="This person can sign in but will see an empty console."
                />
              ) : (
                <ul className="space-y-2">
                  {liveAssignments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start justify-between gap-3 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-1)]">
                          {a.roleDisplayName}
                        </p>
                        <Mono className="mt-0.5 text-[10px]">{a.roleName}</Mono>
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral" className="px-1 py-0 text-[10px]">
                            {humanize(a.scopeType)}
                          </Badge>
                          {a.organizationId ? (
                            <Badge tone="info" className="px-1 py-0 text-[10px]">
                              {ORGANIZATION_OPTIONS.find(
                                (o) => o.id === a.organizationId
                              )?.name ?? a.organizationId.slice(0, 10)}
                            </Badge>
                          ) : null}
                          <span className="text-[10px] text-[var(--text-3)]">
                            since {formatDate(a.grantedAt)}
                          </span>
                        </p>
                      </div>

                      <Tooltip content="Revoke. This is a soft delete — the row is kept for audit.">
                        <span>
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={
                              revoke.isPending &&
                              revoke.variables?.roleId === a.roleId &&
                              (revoke.variables?.organizationId ?? null) ===
                                a.organizationId
                            }
                            onClick={() =>
                              revoke.mutate(
                                { roleId: a.roleId, organizationId: a.organizationId },
                                {
                                  onSuccess: () => toast.success("Role revoked"),
                                  onError: (err) =>
                                    toast.error(
                                      err instanceof ApiError
                                        ? err.friendly
                                        : "Could not revoke the role."
                                    ),
                                }
                              )
                            }
                          >
                            Revoke
                          </Button>
                        </span>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <form
              onSubmit={submit}
              className="space-y-3.5 border-t border-[var(--hairline)] px-4 py-4"
            >
              <h3 className="text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-3)]">
                Assign another role
              </h3>

              <Field
                label="Role"
                error={errors.roleId}
                required={REQUIRED_ASSIGNMENT.has("roleId")}
              >
                <select
                  value={roleId}
                  onChange={(e) => {
                    setRoleId(e.target.value);
                    setScopeType("");
                    setOrganizationId("");
                  }}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                >
                  <option value="">Select a role…</option>
                  {available.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.displayName} ({r.domain === "TECHNICAL" ? "technical" : "business"})
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Scope"
                hint={
                  selectedRole
                    ? `Leave as default to use this role's natural scope (${humanize(naturalScope)}).`
                    : undefined
                }
              >
                <select
                  value={scopeType}
                  disabled={!selectedRole}
                  onChange={(e) => setScopeType(e.target.value as ScopeType | "")}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)] disabled:opacity-50"
                >
                  <option value="">
                    Default{selectedRole ? ` — ${humanize(naturalScope)}` : ""}
                  </option>
                  <option value="GLOBAL">Global</option>
                  <option value="ORGANIZATION">Organization</option>
                  <option value="OWN">Own records</option>
                </select>
              </Field>

              {/* organizationId is required for ORGANIZATION and rejected otherwise. */}
              {effectiveScope === "ORGANIZATION" && selectedRole ? (
                <Field label="Organization" error={errors.organizationId} required>
                  <select
                    value={organizationId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                    className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                  >
                    <option value="">Select an organization…</option>
                    {ORGANIZATION_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={assign.isPending}
                disabled={available.length === 0}
              >
                <Plus className="h-3.5 w-3.5" />
                Assign role
              </Button>

              {available.length === 0 && !rolesQuery.isLoading ? (
                <p className="text-[11px] text-[var(--text-3)]">
                  This person already holds every active role.
                </p>
              ) : null}
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
