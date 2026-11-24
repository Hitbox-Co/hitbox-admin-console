"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Eye,
  EyeOff,
  Power,
  PowerOff,
  ShieldCheck,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useArtistGenres, useArtistStateAction, useUpdateArtistStaff } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import type { ArtistStaffProfile, ArtistStaffUpdate, ArtistStateAction } from "@/lib/types";

/**
 * Staff actions on an artist (artist-admin-api.md §7–8): the state menu and
 * the edit form. Both answer with the full profile, which the hooks write
 * into the cache. Every change is audited with an optional reason.
 */

const REASON_MAX = 500;

type ActionDef = {
  action: ArtistStateAction;
  label: string;
  icon: typeof Power;
  danger?: boolean;
  title: string;
  body: string;
};

const ACTIONS: Record<ArtistStateAction, ActionDef> = {
  activate: {
    action: "activate",
    label: "Activate",
    icon: Power,
    title: "Activate this artist?",
    body: "They can sell again and edit their own profile and collections.",
  },
  deactivate: {
    action: "deactivate",
    label: "Deactivate",
    icon: PowerOff,
    danger: true,
    title: "Deactivate this artist?",
    body: "Selling is switched off and their own profile and collections become read-only. Their drops and collections are left as they are.",
  },
  publish: {
    action: "publish",
    label: "Publish profile",
    icon: Eye,
    title: "Show this artist on the storefront?",
    body: "Their public profile becomes visible to buyers.",
  },
  unlist: {
    action: "unlist",
    label: "Unlist profile",
    icon: EyeOff,
    title: "Hide this artist from the storefront?",
    body: "Their public profile is hidden. Nothing else changes.",
  },
  archive: {
    action: "archive",
    label: "Archive",
    icon: Archive,
    danger: true,
    title: "Archive this artist?",
    body: "They're retired from the directory and can't be edited until restored. Drops and collections are left as they are.",
  },
  restore: {
    action: "restore",
    label: "Restore",
    icon: ArchiveRestore,
    title: "Restore this artist?",
    body: "They come back to the directory with their previous settings.",
  },
};

/** What can be done from the current state — the server refuses the rest. */
export function availableActions(p: ArtistStaffProfile): ArtistStateAction[] {
  if (p.archivedAt) return ["restore"];
  const out: ArtistStateAction[] = [];
  out.push(p.isActive ? "deactivate" : "activate");
  if (p.isPublic) out.push("unlist");
  else if (p.isActive) out.push("publish");
  out.push("archive");
  return out;
}

export function ArtistActionMenu({ profile }: { profile: ArtistStaffProfile }) {
  const [pending, setPending] = React.useState<ArtistStateAction | null>(null);
  const actions = availableActions(profile);
  const item =
    "flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12.5px] text-[var(--text-1)] outline-none data-[highlighted]:bg-[var(--surface-2)]";

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="secondary" size="sm">
            Actions <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-[70] min-w-[200px] rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] p-1 shadow-[var(--shadow-3)]"
          >
            {actions.map((a, i) => {
              const def = ACTIONS[a];
              const sep = def.danger && i > 0 && !ACTIONS[actions[i - 1]].danger;
              return (
                <React.Fragment key={a}>
                  {sep ? <DropdownMenu.Separator className="my-1 h-px bg-[var(--hairline)]" /> : null}
                  <DropdownMenu.Item
                    className={cn(item, def.danger && "text-[var(--danger)]")}
                    onSelect={() => setPending(a)}
                  >
                    <def.icon className="h-3.5 w-3.5" /> {def.label}
                  </DropdownMenu.Item>
                </React.Fragment>
              );
            })}
            {!profile.archivedAt && !profile.isActive && !profile.isPublic ? (
              <p className="max-w-[220px] px-2 pb-1.5 pt-1 text-[11px] leading-snug text-[var(--text-3)]">
                Activate first to publish the profile.
              </p>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {pending ? (
        <ActionDialog profile={profile} def={ACTIONS[pending]} onClose={() => setPending(null)} />
      ) : null}
    </>
  );
}

function ActionDialog({ profile, def, onClose }: { profile: ArtistStaffProfile; def: ActionDef; onClose: () => void }) {
  const run = useArtistStateAction(profile.id);
  const [reason, setReason] = React.useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run.mutate(
      { action: def.action, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`${profile.name}: ${def.label.toLowerCase()} done`);
          onClose();
        },
        onError: (err) => {
          // 409s carry a precise message — show it as-is.
          toast.error(err instanceof ApiError ? err.friendly : "That didn't work.");
          if (err instanceof ApiError && err.code === "ARTIST_CHANGED") onClose();
        },
      }
    );
  };
  return (
    <Shell title={def.title} description={profile.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 px-4 py-4">
        <p className="text-[13px] leading-relaxed text-[var(--text-2)]">{def.body}</p>
        <Field label="Reason (optional)" htmlFor="act-reason" hint="Kept in the audit trail.">
          <Textarea
            id="act-reason"
            rows={2}
            maxLength={REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Label asked to pause sales"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={def.danger ? "danger" : "primary"} size="sm" loading={run.isPending} autoFocus>
            {def.label}
          </Button>
        </div>
      </form>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Edit                                                                */
/* ------------------------------------------------------------------ */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function EditArtistDialog({ profile, onClose }: { profile: ArtistStaffProfile; onClose: () => void }) {
  const update = useUpdateArtistStaff(profile.id);
  const genres = useArtistGenres();
  const [name, setName] = React.useState(profile.name);
  const [slug, setSlug] = React.useState(profile.slug);
  const [bio, setBio] = React.useState(profile.bio ?? "");
  const [genre, setGenre] = React.useState(profile.genre ?? "");
  const [takeDownAvatar, setTakeDownAvatar] = React.useState(false);
  const [takeDownCover, setTakeDownCover] = React.useState(false);
  const [attest, setAttest] = React.useState(profile.compliance.attested);
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const genreOptions = genres.data ?? [];
  const genreKnown = !genre || genreOptions.some((g) => g.code === genre || g.label === genre);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim() || name.trim().length > 120) next.name = "1–120 characters.";
    if (slug.length < 3 || slug.length > 60 || !SLUG_RE.test(slug)) {
      next.slug = "3–60 characters: lowercase letters, digits and single hyphens.";
    }
    if (bio.length > 2000) next.bio = "At most 2000 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: ArtistStaffUpdate = {};
    if (name.trim() !== profile.name) body.name = name.trim();
    if (slug !== profile.slug) body.slug = slug;
    if ((bio.trim() || null) !== (profile.bio?.trim() || null)) body.bio = bio.trim() || null;
    if ((genre || null) !== (profile.genre || null)) body.genre = genre || null;
    if (takeDownAvatar) body.avatarUrl = null;
    if (takeDownCover) body.coverUrl = null;
    if (attest !== profile.compliance.attested) body.complianceAttested = attest;
    if (Object.keys(body).length === 0) return onClose();
    if (reason.trim()) body.reason = reason.trim();

    update.mutate(body, {
      onSuccess: () => {
        toast.success("Artist updated");
        onClose();
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          if (err.code === "ARTIST_SLUG_TAKEN") return setErrors({ slug: err.friendly });
          if (err.code === "ARTIST_GENRE_INVALID") return setErrors({ genre: err.friendly });
          if (err.status === 422 || err.code === "VALIDATION_ERROR") setErrors(err.fieldErrors);
        }
        toast.error(err instanceof ApiError ? err.validationSummary ?? err.friendly : "Could not save.");
      },
    });
  };

  return (
    <Shell title="Edit artist" description="Only what you change is sent. State changes live in Actions." onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4 px-4 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="ed-name" error={errors.name}>
            <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field
            label="Handle"
            htmlFor="ed-slug"
            error={errors.slug}
            hint={slug !== profile.slug && profile.isPublic ? "Old profile links will stop working." : undefined}
          >
            <Input
              id="ed-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"))}
              className="font-mono"
              maxLength={60}
            />
          </Field>
        </div>

        <Field label="Genre" htmlFor="ed-genre" error={errors.genre}>
          {genreOptions.length ? (
            <select
              id="ed-genre"
              value={genreKnown ? genreOptions.find((g) => g.label === genre)?.code ?? genre : genre}
              onChange={(e) => setGenre(e.target.value)}
              className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-1)] px-2 text-[13px] text-[var(--text-1)]"
            >
              <option value="">No genre</option>
              {!genreKnown ? <option value={genre}>{genre}</option> : null}
              {genreOptions.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.label}
                </option>
              ))}
            </select>
          ) : (
            <Input id="ed-genre" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. POP" />
          )}
        </Field>

        <Field label="Bio" htmlFor="ed-bio" error={errors.bio} hint={`${bio.length}/2000`}>
          <Textarea id="ed-bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>

        <div className="space-y-2 rounded-[10px] border border-[var(--hairline)] p-3">
          <Check
            checked={attest}
            onChange={setAttest}
            label={
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--positive)]" /> Compliance attested
              </span>
            }
            hint={
              profile.compliance.attested
                ? "Untick to withdraw the attestation."
                : "Records that HitBox checked compliance — now, by you."
            }
          />
          {profile.avatarUrl ? (
            <Check
              checked={takeDownAvatar}
              onChange={setTakeDownAvatar}
              label="Take down the profile photo"
              hint="Only the artist can upload a new one."
            />
          ) : null}
          {profile.coverUrl ? (
            <Check
              checked={takeDownCover}
              onChange={setTakeDownCover}
              label="Take down the cover image"
              hint="Only the artist can upload a new one."
            />
          ) : null}
        </div>

        <Field label="Reason (optional)" htmlFor="ed-reason" hint="Kept in the audit trail.">
          <Input
            id="ed-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            placeholder="e.g. Label asked for a bio update"
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-[var(--hairline)] pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={update.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </Shell>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-[12.5px] text-[var(--text-1)]">{label}</span>
        {hint ? <span className="block text-[11.5px] text-[var(--text-3)]">{hint}</span> : null}
      </span>
    </label>
  );
}

function Shell({
  title,
  description,
  onClose,
  wide,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-[60] bg-[rgba(0,0,0,0.55)] backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "rx-content rx-anchored fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]",
            wide ? "w-[min(560px,calc(100vw-32px))]" : "w-[min(440px,calc(100vw-32px))]"
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div>
              <Dialog.Title className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">{description}</Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
