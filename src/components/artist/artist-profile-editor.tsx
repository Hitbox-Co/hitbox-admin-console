"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import {
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MoreHorizontal,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useArtistGenres,
  useMyArtistProfile,
  useRemoveArtistImage,
  useUpdateMyArtistProfile,
  useUploadArtistImage,
} from "@/lib/api/hooks";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  ARTIST_IMAGE_MAX_BYTES,
  ARTIST_IMAGE_TYPES,
  prepareImage,
  type ImageTarget,
} from "@/lib/image-prep";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
  PanelHeader,
  Skeleton,
  Textarea,
  Tooltip,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { ArtistImageKind, ArtistProfile, ArtistProfileUpdate } from "@/lib/types";

/**
 * My profile — the signed-in artist's own profile (artist-profile-api.md).
 *
 * There is no artist id anywhere: every call is /artist/me, so this screen
 * cannot reach someone else's profile. Every write answers with the whole
 * profile, which the hooks put straight into the cache.
 *
 * Editable: name, handle (slug), bio, genre, public/unlisted, avatar, cover.
 * Everything else — organization, compliance, counts — is shown read-only.
 * When HitBox has archived or deactivated the profile, `editable` is false
 * and the whole form is read-only (every write would be 409
 * ARTIST_PROFILE_LOCKED).
 */

const BIO_MAX = 2000;
const NAME_MAX = 120;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TARGETS: Record<ArtistImageKind, ImageTarget & { label: string }> = {
  avatar: { width: 800, height: 800, label: "Avatar" },
  cover: { width: 1920, height: 640, label: "Cover image" },
};

/** Lower-case, spaces/underscores to hyphens, nothing else allowed, no double hyphens. */
function formatSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}

export function ArtistProfileEditor() {
  const query = useMyArtistProfile();

  if (query.isLoading) return <ProfileSkeleton />;

  if (query.isError || !query.data) {
    if (query.error instanceof ApiError && query.error.code === "ARTIST_PROFILE_NOT_FOUND") {
      return (
        <Panel>
          <EmptyState
            icon={Users}
            title="No artist profile linked to this account"
            description="Artist profiles are created when HitBox invites you as an artist, and linked when you accept the invitation. Contact HitBox if you expected one."
          />
        </Panel>
      );
    }
    return (
      <Panel>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Panel>
    );
  }

  // Keyed on updatedAt so the form restarts from the saved profile after
  // every write rather than holding stale drafts.
  return <ProfileView key={query.data.updatedAt} profile={query.data} />;
}

function ProfileView({ profile }: { profile: ArtistProfile }) {
  const locked = !profile.editable;

  return (
    <div className="space-y-4">
      {locked ? (
        <Panel className="flex items-start gap-2 border-[rgba(201,154,63,0.35)] bg-[var(--warning-dim)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--text-2)]">
          <Lock className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-hidden />
          <span>
            <strong className="font-medium text-[var(--text-1)]">This profile is read-only.</strong>{" "}
            HitBox has {profile.archivedAt ? "archived" : "deactivated"} it, so it can&rsquo;t be
            edited. Contact HitBox support if this looks wrong.
          </span>
        </Panel>
      ) : null}

      <Banner profile={profile} locked={locked} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <DetailsForm profile={profile} locked={locked} />
        </div>
        <aside className="min-w-0 space-y-4">
          <AccountPanel profile={profile} />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Banner — how the profile looks, and where its images are changed   */
/*                                                                      */
/* Hovering the cover or the avatar reveals a ⋯ menu: Upload / Replace  */
/* and Remove. The menu stays visible on touch screens and while open.  */
/* ------------------------------------------------------------------ */

function Banner({ profile, locked }: { profile: ArtistProfile; locked: boolean }) {
  const cover = useImageActions("cover");
  const avatar = useImageActions("avatar");

  return (
    <Panel className="overflow-hidden">
      <div
        className="group/cover relative h-36 bg-[var(--surface-2)] bg-cover bg-center sm:h-44"
        style={profile.coverUrl ? { backgroundImage: `url("${profile.coverUrl}")` } : undefined}
      >
        {!profile.coverUrl && !locked ? (
          <button
            type="button"
            onClick={cover.pick}
            className="absolute inset-0 flex items-center justify-center gap-1.5 text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            <Upload className="h-4 w-4" aria-hidden />
            Add a cover image
          </button>
        ) : null}
        <BusyOverlay state={cover.state} />
        {!locked ? (
          <div className="absolute right-3 top-3">
            <ImageMenu
              label="Cover image"
              hint="3:1 banner · 1920 × 640"
              hasImage={!!profile.coverUrl}
              actions={cover}
              className="group-hover/cover:opacity-100"
            />
          </div>
        ) : null}
        {cover.input}
      </div>

      <div className="flex flex-wrap items-end gap-4 px-4 pb-4 sm:px-5">
        {/* relative + z-10: the cover is positioned, so without its own stacking
            context the avatar's top half would paint underneath it. */}
        <div className="group/avatar relative z-10 -mt-10 shrink-0">
          <Avatar
            url={profile.avatarUrl}
            name={profile.name}
            className="h-20 w-20 border-4 border-[var(--surface-1)]"
          />
          <span className="absolute inset-1 overflow-hidden rounded-full">
            <BusyOverlay state={avatar.state} />
          </span>
          {!locked ? (
            <div className="absolute -bottom-0.5 -right-0.5">
              <ImageMenu
                label="Avatar"
                hint="Square · 800 × 800"
                hasImage={!!profile.avatarUrl}
                actions={avatar}
                className="group-hover/avatar:opacity-100"
              />
            </div>
          ) : null}
          {avatar.input}
        </div>

        <div className="min-w-0 flex-1 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[18px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
              {profile.name}
            </h2>
            {profile.compliance.attested ? (
              <Tooltip content={`Compliance attested by HitBox${profile.compliance.attestedAt ? ` on ${formatDate(profile.compliance.attestedAt)}` : ""}.`}>
                <span>
                  <Badge tone="positive">
                    <BadgeCheck className="h-3 w-3" aria-hidden />
                    Verified
                  </Badge>
                </span>
              </Tooltip>
            ) : null}
            {profile.isPublic ? (
              <Badge tone="accent">
                <Eye className="h-3 w-3" aria-hidden />
                Public
              </Badge>
            ) : (
              <Badge tone="neutral">
                <EyeOff className="h-3 w-3" aria-hidden />
                Unlisted
              </Badge>
            )}
            {locked ? <Badge tone="warning">Locked</Badge> : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-[var(--text-3)]">
            <span className="font-mono">@{profile.slug}</span>
            {profile.genre ? <span>{profile.genre}</span> : null}
          </p>
        </div>
        <dl className="flex gap-5 text-right">
          {(
            [
              ["Drops", profile.counts.drops],
              ["Collections", profile.counts.collections],
              ["Followers", profile.counts.followers],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dd className="tnum text-[16px] font-semibold text-[var(--text-1)]">{formatNumber(v)}</dd>
              <dt className="text-[11px] text-[var(--text-3)]">{k}</dt>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

function Avatar({ url, name, className }: { url: string | null; name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- a public S3 URL, rendered as-is
    <img
      src={url}
      alt={`${name}'s avatar`}
      className={cn("block rounded-full bg-[var(--surface-3)] object-cover", className)}
    />
  ) : (
    <span
      aria-label={`${name} has no avatar`}
      className={cn(
        "flex items-center justify-center rounded-full bg-[var(--surface-3)] text-[22px] font-semibold text-[var(--text-2)]",
        className
      )}
    >
      {initials || "?"}
    </span>
  );
}

type ImageState = "idle" | "preparing" | "uploading" | "removing";

interface ImageActions {
  state: ImageState;
  pick: () => void;
  remove: () => void;
  /** The hidden file input — render it once, anywhere. */
  input: React.ReactNode;
}

/**
 * Avatar or cover: pick a file, crop/resize it in the browser, then
 * presign → S3 → set. Remove clears it from the profile (the file is kept).
 */
function useImageActions(kind: ArtistImageKind): ImageActions {
  const target = TARGETS[kind];
  const upload = useUploadArtistImage(kind);
  const removeImage = useRemoveArtistImage(kind);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = React.useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    e.target.value = "";
    if (!original) return;
    if (!ARTIST_IMAGE_TYPES.includes(original.type)) {
      toast.error("Use a JPEG, PNG, WebP or GIF image.");
      return;
    }
    setPreparing(true);
    let file: File;
    try {
      file = await prepareImage(original, target);
    } catch {
      file = original;
    } finally {
      setPreparing(false);
    }
    if (file.size > ARTIST_IMAGE_MAX_BYTES) {
      toast.error("That image is over 15 MB.");
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success(`${target.label} updated`),
      onError: (err) => toast.error(err instanceof ApiError ? err.friendly : "Upload failed."),
    });
  };

  return {
    state: preparing
      ? "preparing"
      : upload.isPending
        ? "uploading"
        : removeImage.isPending
          ? "removing"
          : "idle",
    pick: () => inputRef.current?.click(),
    remove: () =>
      removeImage.mutate(undefined, {
        onSuccess: () => toast.success(`${target.label} removed`),
        onError: (err) => toast.error(err instanceof ApiError ? err.friendly : "Could not remove it."),
      }),
    input: (
      <input
        ref={inputRef}
        type="file"
        accept={ARTIST_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={onPick}
        aria-label={`Choose a ${target.label.toLowerCase()}`}
      />
    ),
  };
}

function BusyOverlay({ state }: { state: ImageState }) {
  if (state === "idle") return null;
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.5)] text-white">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="sr-only">
        {state === "preparing" ? "Preparing" : state === "removing" ? "Removing" : "Uploading"}
      </span>
    </span>
  );
}

/**
 * The ⋯ button. Hidden until its parent is hovered (the parent passes the
 * group-hover class), but always shown on touch screens, on keyboard focus
 * and while its menu is open.
 */
function ImageMenu({
  label,
  hint,
  hasImage,
  actions,
  className,
}: {
  label: string;
  hint: string;
  hasImage: boolean;
  actions: ImageActions;
  className?: string;
}) {
  const busy = actions.state !== "idle";
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={`${label} options`}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(0,0,0,0.6)] text-white backdrop-blur-sm transition-opacity",
            "opacity-0 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100",
            "hover:bg-[rgba(0,0,0,0.8)] disabled:opacity-0",
            className
          )}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="rx-content z-70 min-w-[200px] rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] p-1 shadow-[var(--shadow-3)]"
        >
          <DropdownMenu.Label className="px-2 pb-1 pt-1.5">
            <span className="block text-[12px] font-medium text-[var(--text-1)]">{label}</span>
            <span className="block text-[11px] text-[var(--text-3)]">{hint}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--hairline)]" />
          <DropdownMenu.Item
            onSelect={actions.pick}
            className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12.5px] text-[var(--text-1)] outline-none data-[highlighted]:bg-[var(--surface-3)]"
          >
            <Upload className="h-3.5 w-3.5 text-[var(--text-3)]" aria-hidden />
            {hasImage ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          </DropdownMenu.Item>
          {hasImage ? (
            <DropdownMenu.Item
              onSelect={actions.remove}
              className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12.5px] text-[var(--danger)] outline-none data-[highlighted]:bg-[var(--danger-dim)]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove {label.toLowerCase()}
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Details — PATCH only what changed                                   */
/* ------------------------------------------------------------------ */

function DetailsForm({ profile, locked }: { profile: ArtistProfile; locked: boolean }) {
  const update = useUpdateMyArtistProfile();
  const genres = useArtistGenres();

  const [name, setName] = React.useState(profile.name);
  const [slug, setSlug] = React.useState(profile.slug);
  const [bio, setBio] = React.useState(profile.bio ?? "");
  // The profile stores the LABEL; the dropdown holds the code. A genre from
  // before the list existed matches no code and is shown as-is until replaced.
  const initialGenreCode =
    genres.data?.find((g) => g.label === profile.genre || g.code === profile.genre)?.code ?? null;
  const [genre, setGenre] = React.useState<string | null | undefined>(undefined);
  const genreValue = genre === undefined ? initialGenreCode : genre;
  const [isPublic, setIsPublic] = React.useState(profile.isPublic);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const legacyGenre = profile.genre && !initialGenreCode && genres.data ? profile.genre : null;

  const changes: ArtistProfileUpdate = {};
  if (name.trim() !== profile.name) changes.name = name.trim();
  if (slug !== profile.slug) changes.slug = slug;
  if ((bio.trim() || null) !== (profile.bio || null)) changes.bio = bio.trim() || null;
  if (genre !== undefined && genre !== initialGenreCode) changes.genre = genre;
  if (isPublic !== profile.isPublic) changes.isPublic = isPublic;
  const dirty = Object.keys(changes).length > 0;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "A display name is required.";
    else if (name.trim().length > NAME_MAX) next.name = `At most ${NAME_MAX} characters.`;
    if (slug.length < 3 || slug.length > 60 || !SLUG_RE.test(slug)) {
      next.slug = "3–60 characters: a–z, 0–9 and single hyphens, not at the start or end.";
    }
    if (bio.length > BIO_MAX) next.bio = `At most ${BIO_MAX} characters.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || update.isPending || !validate()) return;
    update.mutate(changes, {
      onSuccess: (p) =>
        toast.success(
          "slug" in changes ? `Saved — your handle is now @${p.slug}` : "Profile saved"
        ),
      onError: (err) => {
        if (err instanceof ApiError) {
          if (err.code === "ARTIST_SLUG_TAKEN") {
            setErrors({ slug: err.friendly });
            return;
          }
          if (err.code === "ARTIST_GENRE_INVALID") {
            setErrors({ genre: err.friendly });
            return;
          }
          if (err.status === 422) setErrors(err.fieldErrors);
          toast.error(err.validationSummary ?? err.friendly);
          return;
        }
        toast.error("Could not save your profile.");
      },
    });
  };

  const reset = () => {
    setName(profile.name);
    setSlug(profile.slug);
    setBio(profile.bio ?? "");
    setGenre(undefined);
    setIsPublic(profile.isPublic);
    setErrors({});
  };

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Profile details" description="How you appear on your drops and the storefront." />
      <form onSubmit={submit}>
        <fieldset disabled={locked || update.isPending} className="space-y-4 px-4 py-4 sm:px-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="ap-name" error={errors.name} required hint="Printed on your drops and the storefront.">
              <Input
                id="ap-name"
                value={name}
                maxLength={NAME_MAX}
                invalid={!!errors.name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field
              label="Handle"
              htmlFor="ap-slug"
              error={errors.slug}
              required
              hint={
                slug !== profile.slug
                  ? `Your profile URL changes to /${slug || "…"} — links using @${profile.slug} stop working.`
                  : "Your public profile URL. Lower-case letters, digits and hyphens."
              }
            >
              <div className="flex items-center">
                <span className="flex h-8 items-center rounded-l-[6px] border border-r-0 border-[var(--hairline)] bg-[var(--surface-3)] px-2 text-[13px] text-[var(--text-3)]">
                  @
                </span>
                <Input
                  id="ap-slug"
                  value={slug}
                  invalid={!!errors.slug}
                  onChange={(e) => setSlug(formatSlug(e.target.value))}
                  onBlur={() => setSlug((s) => s.replace(/-+$/, ""))}
                  className="rounded-l-none font-mono"
                  spellCheck={false}
                  autoCapitalize="none"
                />
              </div>
            </Field>
          </div>

          <Field
            label="Genre"
            htmlFor="ap-genre"
            error={errors.genre}
            hint={legacyGenre ? `Currently "${legacyGenre}", which is no longer on the list — pick one to replace it.` : "One genre."}
          >
            <select
              id="ap-genre"
              value={genreValue ?? ""}
              onChange={(e) => setGenre(e.target.value || null)}
              disabled={genres.isLoading}
              className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)] disabled:opacity-50"
            >
              <option value="">{genres.isLoading ? "Loading genres…" : legacyGenre ?? "No genre"}</option>
              {(genres.data ?? []).map((g) => (
                <option key={g.code} value={g.code}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Bio"
            htmlFor="ap-bio"
            error={errors.bio}
            hint={`${formatNumber(bio.length)} / ${formatNumber(BIO_MAX)} characters. Leave empty to clear it.`}
          >
            <Textarea
              id="ap-bio"
              rows={5}
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell collectors who you are and what you make."
            />
          </Field>

          <label className="flex items-start gap-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
            />
            <span>
              <span className="block text-[12.5px] font-medium text-[var(--text-1)]">Public profile</span>
              <span className="block text-[11.5px] leading-relaxed text-[var(--text-3)]">
                {isPublic
                  ? "Listed publicly — collectors can find your profile."
                  : "Unlisted — your profile isn't listed publicly."}
              </span>
            </span>
          </label>
        </fieldset>

        {!locked ? (
          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3 sm:px-5">
            <Button type="submit" variant="primary" size="sm" loading={update.isPending} disabled={!dirty}>
              Save changes
            </Button>
            {dirty ? (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Discard
              </Button>
            ) : (
              <span className="text-[11.5px] text-[var(--text-3)]">No unsaved changes.</span>
            )}
          </div>
        ) : null}
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Account — set by HitBox, read-only                                  */
/* ------------------------------------------------------------------ */

function AccountPanel({ profile }: { profile: ArtistProfile }) {
  const rows: [string, React.ReactNode][] = [
    [
      "Organization",
      profile.organization ? (
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="h-3 w-3 text-[var(--text-3)]" aria-hidden />
          {profile.organization.name}
        </span>
      ) : (
        "—"
      ),
    ],
    [
      "Type",
      profile.organization
        ? profile.organization.type === "ARTIST_INDIVIDUAL"
          ? "Independent artist"
          : profile.organization.type === "BRAND"
            ? "Signed to a label"
            : humanize(profile.organization.type)
        : "—",
    ],
    [
      "Compliance",
      profile.compliance.attested ? (
        <Badge tone="positive">Attested {formatDate(profile.compliance.attestedAt)}</Badge>
      ) : (
        <Badge tone="warning">Not attested yet</Badge>
      ),
    ],
    ["Status", profile.archivedAt ? "Archived" : profile.isActive ? "Active" : "Deactivated"],
    ["Profile code", <Mono key="c" className="text-[10.5px]">{profile.publicCode}</Mono>],
    ["Member since", formatDate(profile.createdAt)],
    ["Last updated", formatDate(profile.updatedAt)],
  ];
  return (
    <Panel>
      <PanelHeader title="Account" description="Set by HitBox — contact support to change these." />
      <dl className="divide-y divide-[var(--hairline)]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-2">
            <dt className="shrink-0 text-[12px] text-[var(--text-3)]">{k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-[var(--text-1)]">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-56 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-80 w-full rounded-xl xl:col-span-2" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}
