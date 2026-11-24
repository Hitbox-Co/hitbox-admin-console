"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import { Info, Send, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCreateInvitation, useRoles } from "@/lib/api/hooks";
import { humanize } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import { Button, Field, Input } from "@/components/ui/primitives";
import type { Role, ScopeType } from "@/lib/types";
import { ORGANIZATION_OPTIONS } from "./organizations";

/**
 * `email` and `roleId` are the only unconditionally required fields
 * (admin-provisioning.md §6). `organizationId` is required only when the
 * assignment resolves to ORGANIZATION scope, so it is asserted at its own
 * Field rather than folded in here — the same way the assignment drawer
 * handles the identical rule.
 */
const inviteSchema = z.object({
  email: z.email(),
  roleId: z.string().min(1),
});
const REQUIRED_INVITE = requiredKeys(inviteSchema);

/**
 * AUTHZ_FORBIDDEN arrives here for two unrelated refusals, and only the
 * server's own sentence tells them apart:
 *
 *   403 — the escalation check. You cannot grant a permission you do not
 *         hold, and the message NAMES the ones you are short of.
 *   400 — the identity provider refused to send the email, with
 *         `details.invitationId` pointing at the FAILED row it left behind.
 *
 * `ApiError.friendly` maps that code to "your role does not include this
 * capability", which is useless for the first and wrong for the second, so
 * both are shown verbatim instead.
 */
function inviteErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Could not send the invitation.";
  if (err.code === "AUTHZ_FORBIDDEN" && err.message) return err.message;
  return err.friendly;
}

/**
 * Inviting a colleague onto the platform.
 *
 * Until this endpoint existed the only route to making someone an
 * administrator was to ask them to register in the consumer app as a buyer
 * and then grant them a role — which is how staff privileges ended up on
 * personal addresses (admin-provisioning.md §1).
 *
 * The form does not ask for a password, and cannot: Clerk emails a one-time
 * link and the person sets their own credential, so no HitBox system ever
 * holds it. The cost of that is the thing this dialog has to say plainly —
 * on the invitation path the role does NOT exist yet, and will not until
 * they accept.
 */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const rolesQuery = useRoles();
  const invite = useCreateInvitation();

  const [email, setEmail] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [scopeType, setScopeType] = React.useState<ScopeType | "">("");
  const [organizationId, setOrganizationId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const selectedRole: Role | undefined = rolesQuery.data?.find((r) => r.id === roleId);

  // Omitting scopeType is legal and usually right — the backend falls back to
  // the role's natural scope, so the dashboard does not have to know that
  // BRAND_ADMIN is org-scoped and HITBOX_SUPPORT is not. This mirrors that
  // rule only to LABEL the default, never to send it.
  const naturalScope: ScopeType = selectedRole
    ? selectedRole.entityGroup === "brand_artist"
      ? "ORGANIZATION"
      : selectedRole.entityGroup === "end_user"
        ? "OWN"
        : "GLOBAL"
    : "GLOBAL";

  const effectiveScope = (scopeType || naturalScope) as ScopeType;
  const activeRoles = (rolesQuery.data ?? []).filter((r) => r.isActive);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const next: Record<string, string> = {};
    if (!inviteSchema.shape.email.safeParse(email.trim()).success)
      next.email = "Enter a valid email address.";
    if (!roleId) next.roleId = "Pick a role.";
    if (effectiveScope === "ORGANIZATION" && !organizationId)
      next.organizationId = "Required for organization scope.";
    setErrors(next);
    if (Object.keys(next).length) return;

    invite.mutate(
      {
        email: email.trim(),
        roleId,
        scopeType: scopeType || undefined,
        organizationId: effectiveScope === "ORGANIZATION" ? organizationId : undefined,
      },
      {
        onSuccess: (result) => {
          // The two outcomes are different events and the operator has to be
          // told which one happened: one is finished, the other is a standing
          // offer that can still expire or be revoked.
          toast.success(
            result.outcome === "ROLE_ASSIGNED"
              ? `${result.invitation.email} already had an account — the ${result.invitation.roleDisplayName} role is live now.`
              : `Invitation emailed to ${result.invitation.email}. They hold the ${result.invitation.roleDisplayName} role once they accept.`
          );
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            const fields = err.fieldErrors;
            if (Object.keys(fields).length) setErrors(fields);
          }
          toast.error(inviteErrorMessage(err));
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Invite someone to the team
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-3)]">
                An email address and the role they should hold.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            <div className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
              <Info
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]"
                aria-hidden
              />
              <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
                No password is set here. If the address already has a HitBox
                account the role is granted immediately; otherwise they are sent
                a sign-up link and hold the role only once they accept — within
                72 hours, or the invitation expires.
              </p>
            </div>

            <Field
              label="Email address"
              htmlFor="invite-email"
              error={errors.email}
              required={REQUIRED_INVITE.has("email")}
              hint="Use their work address — a role granted to a personal mailbox is a role nobody else controls."
            >
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@hitbox.com"
              />
            </Field>

            <Field
              label="Role"
              error={errors.roleId}
              required={REQUIRED_INVITE.has("roleId")}
              hint="You can only grant permissions you hold yourself; the server names any you are short of."
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
                {activeRoles.map((r) => (
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

            {/* An org-scoped role with no organizationId is a 400. */}
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

            <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] pt-3.5">
              <Button type="button" variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" loading={invite.isPending}>
                <Send className="h-3.5 w-3.5" />
                Send invitation
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
