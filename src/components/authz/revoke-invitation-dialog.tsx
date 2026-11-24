"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useRevokeInvitation } from "@/lib/api/hooks";
import { Button, Field, Mono, Textarea } from "@/components/ui/primitives";
import type { StaffInvitation } from "@/lib/types";

/**
 * Withdrawing an invitation that has not been claimed.
 *
 * There is no resend endpoint on purpose: a resend reusing the row would have
 * to decide whether the 72-hour clock restarts, and "revoke, then invite
 * again" answers that unambiguously with endpoints that already exist
 * (admin-provisioning.md §8). So this dialog is also the first half of
 * correcting a typo in an address.
 *
 * The local row is revoked first and the provider second. This database
 * decides whether a role is granted, so a provider call that fails must not
 * leave a claimable invitation behind — the link may still open, but accepting
 * it then creates an ordinary account with no role attached.
 */
export function RevokeInvitationDialog({
  invitation,
  onClose,
}: {
  invitation: StaffInvitation;
  onClose: () => void;
}) {
  const revoke = useRevokeInvitation();
  const [reason, setReason] = React.useState("");

  const submit = () => {
    revoke.mutate(
      { invitationId: invitation.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Invitation to ${invitation.email} revoked.`);
          onClose();
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not revoke the invitation."
          ),
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Revoke this invitation
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-3)]">
                {invitation.email} will not receive the{" "}
                {invitation.roleDisplayName} role.
              </Dialog.Description>
              <Mono className="mt-1.5 inline-block text-[10px]">{invitation.id}</Mono>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            <div className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]"
                aria-hidden
              />
              <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
                There is no resend. To correct an address, revoke this and send a
                fresh invitation — the 72-hour clock starts again with it.
              </p>
            </div>

            <Field
              label="Reason"
              htmlFor="revoke-reason"
              hint="Optional, and kept on the row. Worth writing when the address was wrong."
            >
              <Textarea
                id="revoke-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Sent to the wrong address"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] px-4 py-3.5">
            <Button variant="secondary" size="md" onClick={onClose}>
              Keep it
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={revoke.isPending}
              onClick={submit}
            >
              Revoke invitation
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
