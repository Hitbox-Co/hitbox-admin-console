"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import { Info, Upload, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useUploadAsset } from "@/lib/api/hooks";
import { formatBytes } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import { Button, Field, Input } from "@/components/ui/primitives";
import type { AssetType } from "@/lib/types";

/**
 * `ownerId` is the field this dialog can actually leave blank — `assetType`
 * and `ownerType` are pickers that always carry a value. `fileName`,
 * `mimeType` and `sizeBytes` are also required on the wire
 * (admin-api-reference.md §6) but are read off the chosen `File` rather than
 * typed, so there is no text Field for them to mark; the file input itself
 * is asserted required separately below.
 */
const uploadSchema = z.object({ ownerId: z.string().min(1) });
const REQUIRED_UPLOAD = requiredKeys(uploadSchema);

/**
 * Upload a file: presign, then PUT the bytes straight to S3.
 *
 * The caps and owner rules below are the server's (admin-api-reference.md §6),
 * repeated here only so the operator learns about a 25 MB limit before waiting
 * out a 400 MB upload — not as a second source of truth. The request is still
 * validated server-side and `INVALID_OWNER` / `FILE_TOO_LARGE` /
 * `UNSUPPORTED_MIME_TYPE` all come back before any URL is issued.
 *
 * There is no scan step: the asset is servable the moment the PUT returns.
 */

interface AssetRule {
  owners: string[];
  accept: string;
  maxBytes: number;
}

const RULES: Record<AssetType, AssetRule> = {
  DROP_IMAGE: {
    owners: ["product"],
    accept: "image/jpeg,image/png,image/webp,image/gif",
    maxBytes: 15 * 1024 * 1024,
  },
  PROFILE_IMAGE: {
    owners: ["user", "artist"],
    accept: "image/jpeg,image/png,image/webp,image/gif",
    maxBytes: 15 * 1024 * 1024,
  },
  EXCLUSIVE_CONTENT: {
    owners: ["product", "collection"],
    accept: "image/*,video/mp4,video/mpeg,application/pdf",
    maxBytes: 500 * 1024 * 1024,
  },
  LEGAL_DOCUMENT: {
    owners: ["organization"],
    accept: "application/pdf",
    maxBytes: 25 * 1024 * 1024,
  },
  SUPPLY_SPREADSHEET: {
    owners: ["vendor"],
    accept: ".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    maxBytes: 25 * 1024 * 1024,
  },
  OTHER: { owners: ["product", "user", "artist", "collection", "organization", "vendor"], accept: "", maxBytes: 25 * 1024 * 1024 },
};

const ASSET_TYPES = Object.keys(RULES) as AssetType[];

export function UploadAssetDialog({ onClose }: { onClose: () => void }) {
  const upload = useUploadAsset();

  const [assetType, setAssetType] = React.useState<AssetType>("DROP_IMAGE");
  const [ownerId, setOwnerId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const rule = RULES[assetType];

  /**
   * The owner type is DERIVED, not synced.
   *
   * Only types valid for the chosen assetType may be sent — the wrong pairing
   * is an `INVALID_OWNER` before a URL is even issued. Deriving means
   * switching assetType corrects the pairing in the same render, with no
   * effect and no window where the two disagree.
   */
  const [ownerTypeChoice, setOwnerType] = React.useState<string | null>(null);
  const ownerType =
    ownerTypeChoice && rule.owners.includes(ownerTypeChoice)
      ? ownerTypeChoice
      : rule.owners[0];

  const validate = () => {
    const next: Record<string, string> = {};
    if (!file) next.file = "Choose a file.";
    else if (file.size > rule.maxBytes) {
      next.file = `${formatBytes(file.size)} is over the ${formatBytes(rule.maxBytes)} cap for ${assetType}.`;
    }
    if (!ownerId.trim()) next.ownerId = "The owning record's id is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (upload.isPending || !validate() || !file) return;

    upload.mutate(
      { file, assetType, ownerType, ownerId: ownerId.trim() },
      {
        onSuccess: (asset) => {
          toast.success(`${file.name} uploaded`);
          // publicUrl is non-null only for the two anonymously-readable
          // prefixes; everything else needs a signed URL per render.
          if (!asset.publicUrl) {
            toast.message("Stored privately — this type is served via signed URLs.");
          }
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.friendly : "Upload failed."),
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Upload asset
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                The file goes straight to storage; the bytes never pass through the API.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="space-y-4 px-4 py-4">
            <Field label="Asset type" htmlFor="up-type">
              <select
                id="up-type"
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as AssetType)}
                className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Owner type"
                htmlFor="up-owner-type"
                hint={`Valid for ${assetType}.`}
              >
                <select
                  id="up-owner-type"
                  value={ownerType}
                  onChange={(e) => setOwnerType(e.target.value)}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)]"
                >
                  {rule.owners.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Owner id"
                htmlFor="up-owner-id"
                error={errors.ownerId}
                required={REQUIRED_UPLOAD.has("ownerId")}
              >
                <Input
                  id="up-owner-id"
                  value={ownerId}
                  invalid={!!errors.ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  placeholder="uuid"
                />
              </Field>
            </div>

            <Field
              label="File"
              htmlFor="up-file"
              error={errors.file}
              // Not derivable from uploadSchema — a browser File object has
              // no meaningful zod primitive here — but it is exactly as
              // required as ownerId: validate() refuses to submit without it.
              required
              hint={`Up to ${formatBytes(rule.maxBytes)}.`}
            >
              <Input
                id="up-file"
                type="file"
                accept={rule.accept || undefined}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="h-auto py-1.5 text-[12px]"
              />
            </Field>

            {file ? (
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
                <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                {file.name} · {formatBytes(file.size)} · {file.type || "unknown type"}.
                The size and content type are bound into the upload signature, so the
                file must not change between now and sending.
              </p>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" variant="primary" size="sm" loading={upload.isPending}>
                <Upload className="h-3.5 w-3.5" />
                Upload
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
