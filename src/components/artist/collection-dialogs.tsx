"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCreateCollection, useRestoreCollection, useUpdateCollection } from "@/lib/api/hooks";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import type { ArtistCollection } from "@/lib/types";

/**
 * Create / edit / restore dialogs for the artist's own collections
 * (artist-collection-api.md §2, §4, §5a).
 */

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The server's slug rule: lowercase letters, digits and single hyphens. */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function DialogShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-32px)] w-[min(500px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">{description}</Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * New or edit. Creating may leave the slug blank — the server makes
 * `{handle}-{name}`. Editing the name never changes the slug; changing the
 * slug of a public collection breaks its old links, so that is said first.
 */
export function CollectionFormDialog({
  collection,
  handle,
  onClose,
  onSaved,
}: {
  /** Absent when creating. */
  collection?: ArtistCollection;
  /** The artist's own slug, for the generated-slug preview. */
  handle?: string;
  onClose: () => void;
  onSaved?: (c: ArtistCollection) => void;
}) {
  const editing = Boolean(collection);
  const create = useCreateCollection();
  const update = useUpdateCollection(collection?.id ?? "");
  const busy = create.isPending || update.isPending;

  const [name, setName] = React.useState(collection?.name ?? "");
  const [slug, setSlug] = React.useState(collection?.slug ?? "");
  const [description, setDescription] = React.useState(collection?.description ?? "");
  const [isPublic, setIsPublic] = React.useState(collection?.isPublic ?? false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const generated = slugify([handle, name].filter(Boolean).join(" "));
  const slugChanged = editing && slug.trim() !== collection?.slug;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    const n = name.trim();
    const s = slug.trim();
    if (!n) next.name = "A name is required.";
    else if (n.length > NAME_MAX) next.name = `At most ${NAME_MAX} characters.`;
    if (s && (s.length < 3 || s.length > 60 || !SLUG_RE.test(s))) {
      next.slug = "3–60 characters: lowercase letters, digits and single hyphens.";
    }
    if (editing && !s) next.slug = "A collection always has a web address.";
    if (description.length > DESCRIPTION_MAX) next.description = `At most ${DESCRIPTION_MAX} characters.`;
    setErrors(next);
    if (Object.keys(next).length) return;

    const onError = (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === "ARTIST_COLLECTION_NAME_TAKEN") return setErrors({ name: err.friendly });
        if (err.code === "ARTIST_COLLECTION_SLUG_TAKEN") return setErrors({ slug: err.friendly });
        if (err.status === 422) setErrors(err.fieldErrors);
        toast.error(err.validationSummary ?? err.friendly);
        return;
      }
      toast.error("Could not save the collection.");
    };

    if (!collection) {
      create.mutate(
        {
          name: n,
          ...(s ? { slug: s } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          isPublic,
        },
        {
          onSuccess: (c) => {
            toast.success(`${c.name} created${c.isPublic ? "" : " as a draft"}`);
            onSaved?.(c);
            onClose();
          },
          onError,
        }
      );
      return;
    }

    // Send only what changed.
    const body: Record<string, unknown> = {};
    if (n !== collection.name) body.name = n;
    if (s !== collection.slug) body.slug = s;
    if ((description.trim() || null) !== (collection.description || null)) body.description = description.trim() || null;
    if (isPublic !== collection.isPublic) body.isPublic = isPublic;
    if (Object.keys(body).length === 0) return onClose();
    update.mutate(body, {
      onSuccess: (c) => {
        toast.success("Collection saved");
        onSaved?.(c);
        onClose();
      },
      onError,
    });
  };

  return (
    <DialogShell
      title={editing ? "Edit collection" : "New collection"}
      description={editing ? undefined : "It starts as a draft unless you show it on your page."}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4 px-4 py-4">
        <Field label="Name" htmlFor="col-name" error={errors.name} required>
          <Input
            id="col-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="Season Two"
            autoFocus
          />
        </Field>

        <Field
          label="Description"
          htmlFor="col-desc"
          error={errors.description}
          hint={`${description.length}/${DESCRIPTION_MAX}`}
        >
          <Textarea
            id="col-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Twelve pieces from the autumn tour."
          />
        </Field>

        <Field
          label="Web address"
          htmlFor="col-slug"
          error={errors.slug}
          hint={
            editing
              ? "Changing the name doesn't change this. Old links stop working if you change it."
              : slug.trim()
                ? "Lowercase letters, digits and hyphens."
                : generated
                  ? `Leave blank to use ${generated}`
                  : "Leave blank and one is made from your handle and the name."
          }
        >
          <Input
            id="col-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"))}
            placeholder={editing ? undefined : generated || "my-collection"}
            className="font-mono"
            maxLength={60}
          />
        </Field>

        {slugChanged && collection?.isPublic ? (
          <p className="flex items-start gap-2 rounded-[8px] border border-[var(--warning)] bg-[var(--warning-dim)] px-3 py-2 text-[12px] text-[var(--text-1)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
            This collection is public. Links to <span className="font-mono">{collection.slug}</span> will stop working.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-[var(--hairline)] px-3 py-2.5">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-[12.5px] font-medium text-[var(--text-1)]">Show on my page</span>
            <span className="block text-[11.5px] text-[var(--text-3)]">
              Off keeps it as a draft only you can see here.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 border-t border-[var(--hairline)] pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={busy}>
            {editing ? "Save" : "Create collection"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

/**
 * Restore asks for nothing unless the old name was taken since — then the
 * server says ARTIST_COLLECTION_NAME_TAKEN and this asks for a new one.
 */
export function useRestoreFlow() {
  const restore = useRestoreCollection();
  const [renaming, setRenaming] = React.useState<ArtistCollection | null>(null);

  const run = (c: ArtistCollection, name?: string, onDone?: () => void) =>
    restore.mutate(
      { collectionId: c.id, name },
      {
        onSuccess: (r) => {
          toast.success(`${r.name} restored as a draft — publish it again when you're ready`);
          setRenaming(null);
          onDone?.();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "ARTIST_COLLECTION_NAME_TAKEN") {
            setRenaming(c);
            return;
          }
          toast.error(err instanceof ApiError ? err.friendly : "Could not restore the collection.");
        },
      }
    );

  const dialog = renaming ? (
    <RenameToRestoreDialog
      collection={renaming}
      busy={restore.isPending}
      onCancel={() => setRenaming(null)}
      onSubmit={(name) => run(renaming, name)}
    />
  ) : null;

  return { restore: run, busy: restore.isPending, dialog };
}

function RenameToRestoreDialog({
  collection,
  busy,
  onCancel,
  onSubmit,
}: {
  collection: ArtistCollection;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = React.useState(`${collection.name} (${new Date(collection.createdAt).getFullYear()})`);
  return (
    <DialogShell
      title="Choose a new name"
      description={`You already have another collection called "${collection.name}".`}
      onClose={onCancel}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
        className="space-y-4 px-4 py-4"
      >
        <Field label="Name" htmlFor="restore-name" hint="It comes back as a draft at the end of your list.">
          <Input id="restore-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!name.trim()}>
            Restore
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
