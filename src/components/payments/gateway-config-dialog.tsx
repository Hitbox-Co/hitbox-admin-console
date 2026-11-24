"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { ShieldAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  looksLikeCredential,
  useCreateGatewayConfig,
  useUpdateGatewayConfig,
} from "@/lib/api/hooks";
import {
  Button,
  Field,
  Input,
  Segmented,
} from "@/components/ui/primitives";
import type {
  GatewayConfig,
  GatewayConfigStatus,
  GatewayScope,
} from "@/lib/types";

/**
 * Creating or amending a gateway configuration.
 *
 * `credentialsRef` is a POINTER into the secrets manager, never a key. The
 * DTO refuses a value starting `sk_`, `rk_`, `pk_live` or `whsec_` — and this
 * form refuses it first, which matters more than it looks: a secret that
 * reaches the server to be rejected has already been through a proxy, a
 * request log and whatever sits in between. Catching it in the browser means
 * it never leaves.
 *
 * On edit, `scope`, `organizationId` and `gateway` are not sent at all: the
 * PATCH DTO accepts only `isDefault`, `status` and `credentialsRef`. A
 * configuration's scope is what decides which drops it covers, and changing
 * that under an active checkout would repoint live payments.
 */
export function GatewayConfigDialog({
  config,
  onClose,
}: {
  /** Present when amending; absent when creating. */
  config?: GatewayConfig;
  onClose: () => void;
}) {
  const editing = !!config;
  const create = useCreateGatewayConfig();
  const update = useUpdateGatewayConfig(config?.id ?? "");

  const [scope, setScope] = React.useState<GatewayScope>(
    (config?.scope as GatewayScope) ?? "PLATFORM"
  );
  const [organizationId, setOrganizationId] = React.useState(
    config?.organizationId ?? ""
  );
  const [credentialsRef, setCredentialsRef] = React.useState(
    config?.credentialsRef ?? ""
  );
  const [isDefault, setIsDefault] = React.useState(config?.isDefault ?? false);
  const [status, setStatus] = React.useState<GatewayConfigStatus>(
    (config?.status as GatewayConfigStatus) ?? "ACTIVE"
  );

  const secretPasted = looksLikeCredential(credentialsRef);
  const needsOrg = !editing && scope === "ORGANIZATION" && !organizationId.trim();
  const valid = credentialsRef.trim() !== "" && !secretPasted && !needsOrg;

  const submit = () => {
    if (!valid) return;

    const onError = (err: unknown) =>
      toast.error(
        err instanceof ApiError ? err.friendly : "Could not save the configuration."
      );

    if (editing) {
      update.mutate(
        {
          isDefault,
          status,
          credentialsRef: credentialsRef.trim(),
        },
        {
          onSuccess: () => {
            toast.success("Configuration updated.");
            onClose();
          },
          onError,
        }
      );
      return;
    }

    create.mutate(
      {
        scope,
        ...(scope === "ORGANIZATION" ? { organizationId: organizationId.trim() } : {}),
        gateway: "STRIPE",
        isDefault,
        credentialsRef: credentialsRef.trim(),
        status,
      },
      {
        onSuccess: () => {
          toast.success("Configuration created.");
          onClose();
        },
        onError,
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(540px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {editing ? "Amend configuration" : "Add gateway configuration"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-3)]">
                {editing
                  ? "Scope and gateway are fixed — changing them would repoint live payments."
                  : "Decides which provider credentials a checkout uses."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            {editing ? (
              <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
                <p className="text-[12px] text-[var(--text-2)]">
                  {config.gateway} · {config.scope}
                  {config.organizationId ? ` · ${config.organizationId}` : ""}
                </p>
              </div>
            ) : (
              <>
                <Field label="Scope">
                  <Segmented
                    value={scope}
                    onChange={setScope}
                    size="sm"
                    options={[
                      { value: "PLATFORM" as GatewayScope, label: "Platform" },
                      { value: "ORGANIZATION" as GatewayScope, label: "Organization" },
                      { value: "DROP" as GatewayScope, label: "Drop" },
                    ]}
                  />
                </Field>

                {scope === "ORGANIZATION" ? (
                  <Field
                    label="Organization id"
                    htmlFor="gw-org"
                    required
                    hint="An organization-scoped configuration must name its organization."
                  >
                    <Input
                      id="gw-org"
                      value={organizationId}
                      onChange={(e) => setOrganizationId(e.target.value)}
                      placeholder="uuid"
                    />
                  </Field>
                ) : null}
              </>
            )}

            <Field
              label="Credentials reference"
              htmlFor="gw-ref"
              required
              error={
                secretPasted
                  ? "That looks like an API key. Store the key in the secrets manager and put its reference here."
                  : undefined
              }
              hint="A pointer, never the key itself — e.g. secretsmanager://hitbox/stripe/brand-x"
            >
              <Input
                id="gw-ref"
                value={credentialsRef}
                invalid={secretPasted}
                onChange={(e) => setCredentialsRef(e.target.value)}
                placeholder="secretsmanager://hitbox/stripe/brand-x"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            {secretPasted ? (
              <div className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5">
                <ShieldAlert
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]"
                  aria-hidden
                />
                <p className="text-[12px] leading-relaxed text-[var(--text-2)]">
                  This has not been sent anywhere. A live key in this column is a
                  secret sitting in every database backup — treat the one you pasted
                  as compromised only if it left this machine, which it has not.
                </p>
              </div>
            ) : null}

            <Field label="Status">
              <Segmented
                value={status}
                onChange={setStatus}
                size="sm"
                options={[
                  { value: "ACTIVE" as GatewayConfigStatus, label: "Active" },
                  { value: "INACTIVE" as GatewayConfigStatus, label: "Inactive" },
                ]}
              />
            </Field>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
              />
              <span className="text-[12px] leading-relaxed text-[var(--text-1)]">
                Use as the default for this scope
                <span className="mt-0.5 block text-[11px] text-[var(--text-3)]">
                  Picked up by any checkout that does not match a narrower
                  configuration.
                </span>
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              variant="primary"
              size="sm"
              loading={create.isPending || update.isPending}
              disabled={!valid}
              onClick={submit}
            >
              {editing ? "Save changes" : "Create configuration"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
