"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, Info, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useBindTags } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import type { TagBinding } from "@/lib/types";

/** `bindings` is the only field POST .../skus/tags rejects a request for
 *  omitting (sku-api.md §3a) — vendorId, provisioningBatchId and replace
 *  are all optional. */
const manifestSchema = z.object({ manifest: z.string().min(1) });
const REQUIRED_MANIFEST = requiredKeys(manifestSchema);

/**
 * Apply a vendor tag manifest to already-minted units.
 *
 * This is the normal path for any real edition (sku-api.md §3a): units are
 * minted when the drop is planned, the physical tags arrive weeks later in a
 * box with a CSV. Passing 500 UIDs to the mint call would mean knowing all 500
 * before a single unit exists.
 *
 * The textarea takes that CSV directly — `serial,tagId` per line — because
 * that is the artefact the operator is holding. Pasting it should work without
 * a spreadsheet detour.
 */

const MAX_BINDINGS = 1000;

/** `serial,tag` / `serial tag` / `SKU-CODE,tag` — one binding per line. */
function parseManifest(raw: string): {
  bindings: TagBinding[];
  errors: string[];
} {
  const bindings: TagBinding[] = [];
  const errors: string[] = [];

  raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#/.test(l))
    .forEach((line, i) => {
      const parts = line.split(/[\s,;\t]+/).filter(Boolean);
      if (parts.length < 2) {
        errors.push(`Line ${i + 1}: expected "serial,tagId".`);
        return;
      }
      const [left, tagId] = parts;
      // Exactly one of serialNumber or skuCode per row. A bare number is a
      // serial; anything else is treated as the full printed code.
      if (/^\d+$/.test(left)) {
        bindings.push({ serialNumber: Number(left), tagId });
      } else {
        bindings.push({ skuCode: left, tagId });
      }
    });

  return { bindings, errors };
}

export function BindTagsDialog({
  productId,
  untagged,
  onClose,
}: {
  productId: string;
  /** How many units are still awaiting a tag, when the summary knows. */
  untagged?: number;
  onClose: () => void;
}) {
  const bind = useBindTags(productId);

  const [raw, setRaw] = React.useState("");
  const [vendorId, setVendorId] = React.useState("");
  const [batchRef, setBatchRef] = React.useState("");
  const [replace, setReplace] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { bindings, errors } = React.useMemo(() => parseManifest(raw), [raw]);
  const tooMany = bindings.length > MAX_BINDINGS;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bind.isPending || !bindings.length || errors.length || tooMany) return;
    setServerError(null);

    bind.mutate(
      {
        bindings,
        vendorId: vendorId.trim() || undefined,
        provisioningBatchId: batchRef.trim() || undefined,
        replace,
      },
      {
        onSuccess: (r) => {
          toast.success(`Bound ${formatNumber(r.bound)} tags`);
          onClose();
        },
        onError: (err) => {
          // The batch is all-or-nothing and reports EVERY bad row at once —
          // the operator has a box in front of them, so one problem per
          // round trip would be 40 round trips. Show the message verbatim.
          if (err instanceof ApiError) {
            setServerError(err.message);
            return;
          }
          toast.error("Could not apply the manifest.");
        },
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] flex max-h-[min(88dvh,720px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Bind NFC tags
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                Paste the vendor manifest — one <code>serial,tagId</code> per line.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <Field
                label="Manifest"
                htmlFor="bind-manifest"
                error={errors[0]}
                required={REQUIRED_MANIFEST.has("manifest")}
                hint={`Up to ${formatNumber(MAX_BINDINGS)} rows per batch. Separators in the UID are stripped, so 04:A3:9B… and 04a39b… are one tag.`}
              >
                <Textarea
                  id="bind-manifest"
                  rows={8}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={"1,04:A3:9B:2C:5D:6E:80\n2,04-a3-9b-2c-5d-6e-81\n3,04a39b2c5d6e82"}
                  className="font-mono text-[12px]"
                  autoFocus
                />
              </Field>

              {bindings.length ? (
                <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                  <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                  {formatNumber(bindings.length)} binding
                  {bindings.length === 1 ? "" : "s"} parsed
                  {untagged !== undefined
                    ? ` · ${formatNumber(untagged)} unit${untagged === 1 ? "" : "s"} currently untagged`
                    : ""}
                  {tooMany
                    ? ` — that is over the ${formatNumber(MAX_BINDINGS)} cap; split it into batches.`
                    : "."}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Vendor id" htmlFor="bind-vendor" hint="Applied to every row.">
                  <Input
                    id="bind-vendor"
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    placeholder="optional"
                  />
                </Field>
                <Field
                  label="Batch reference"
                  htmlFor="bind-batch"
                  hint="Recorded, not verified."
                >
                  <Input
                    id="bind-batch"
                    value={batchRef}
                    onChange={(e) => setBatchRef(e.target.value)}
                    placeholder="BATCH-2026-09-41"
                  />
                </Field>
              </div>

              <label className="flex items-start gap-2 text-[12.5px] text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
                />
                <span>
                  Overwrite tags that are already bound
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-3)]">
                    Even with this on, a <strong>claimed</strong> unit whose tag is still
                    healthy is refused — the owner&rsquo;s app and the unit&rsquo;s hash
                    chain are keyed to the tag it was claimed with. Mark the old tag lost
                    or revoked first.
                  </span>
                </span>
              </label>

              {serverError ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]"
                >
                  <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    {serverError}
                    <span className="mt-1 block text-[11px] text-[var(--text-3)]">
                      Nothing was written — the batch is applied in one transaction, so a
                      rejected manifest leaves every unit untouched.
                    </span>
                  </span>
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={bind.isPending}
                disabled={!bindings.length || errors.length > 0 || tooMany}
              >
                Bind {bindings.length ? formatNumber(bindings.length) : ""} tag
                {bindings.length === 1 ? "" : "s"}
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
