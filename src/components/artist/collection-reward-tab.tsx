"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ArchiveRestore,
  Check,
  FileAudio,
  FileImage,
  FileVideo,
  Gift,
  GripVertical,
  Lock,
  Pencil,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAddRewardItem,
  useCollectionReward,
  useRemoveCollectionReward,
  useRemoveRewardItem,
  useRenameRewardItem,
  useReorderRewardItems,
  useSaveCollectionReward,
  useToggleCollectionReward,
} from "@/lib/api/hooks";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, Button, Field, Input, Panel, Skeleton, Textarea } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/packing/packing-ui";
import type { CollectionReward, CollectionRewardItem, RewardItemKind } from "@/lib/types";

/**
 * Reward — exclusive content on a collection (content/collection-rewards.md §3).
 * A buyer unlocks it by owning a claimed unit of every released drop in the
 * collection. Every write answers with the whole reward, which replaces the
 * cache, so the screen always shows what the server holds.
 */

const MAX_FILES = 20;
const MB = 1024 * 1024;

/** §5 — what the picker accepts, checked before anything is uploaded. */
const FILE_RULES: { kind: RewardItemKind; label: string; types: string[]; ext: string; max: number }[] = [
  { kind: "VIDEO", label: "Video", types: ["video/mp4", "video/webm", "video/quicktime"], ext: "mp4, webm, mov", max: 500 * MB },
  {
    kind: "AUDIO",
    label: "Music",
    types: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac"],
    ext: "mp3, m4a, aac, wav, ogg, flac",
    max: 100 * MB,
  },
  { kind: "GIF", label: "GIF", types: ["image/gif"], ext: "gif", max: 50 * MB },
  { kind: "IMAGE", label: "Image", types: ["image/jpeg", "image/png", "image/webp"], ext: "jpeg, png, webp", max: 25 * MB },
];
const ACCEPT = FILE_RULES.flatMap((r) => r.types).join(",") + ",.mov,.m4a,.flac";

/** Browsers disagree on some types (m4a, flac, mov) — fall back to the extension. */
function normaliseType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type === "audio/x-m4a" ? "audio/mp4" : file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4",
    aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", gif: "image/gif",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  };
  return (ext && byExt[ext]) || file.type;
}

function checkFile(file: File): string | null {
  const type = normaliseType(file);
  const rule = FILE_RULES.find((r) => r.types.includes(type));
  if (!rule) return `${file.name}: not a video, music track, GIF or image.`;
  if (file.size > rule.max) return `${file.name}: ${rule.label.toLowerCase()} files can be at most ${formatBytes(rule.max)}.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  return null;
}

const KIND_ICON: Record<RewardItemKind, typeof FileVideo> = {
  VIDEO: FileVideo,
  AUDIO: FileAudio,
  GIF: FileImage,
  IMAGE: FileImage,
};
const KIND_LABEL: Record<RewardItemKind, [string, string]> = {
  VIDEO: ["video", "videos"],
  AUDIO: ["track", "tracks"],
  GIF: ["GIF", "GIFs"],
  IMAGE: ["image", "images"],
};

const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.friendly : fallback);

/** "1 video · 2 tracks · 1 image" — empty kinds left out. */
export function rewardContentsSummary(counts: Partial<Record<RewardItemKind, number>> | undefined): string {
  return (Object.keys(KIND_LABEL) as RewardItemKind[])
    .filter((k) => (counts?.[k] ?? 0) > 0)
    .map((k) => {
      const n = counts![k]!;
      return `${n} ${KIND_LABEL[k][n === 1 ? 0 : 1]}`;
    })
    .join(" · ");
}

/* ------------------------------------------------------------------ */

export function CollectionRewardTab({
  collectionId,
  collectionName,
  editable,
}: {
  collectionId: string;
  collectionName: string;
  /** The collection is live and the profile editable. */
  editable: boolean;
}) {
  const q = useCollectionReward(collectionId);
  const [creating, setCreating] = React.useState(false);

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <Panel>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Panel>
    );
  }

  const reward = q.data ?? null;

  if (!reward) {
    return creating ? (
      <Panel className="overflow-hidden">
        <RewardForm collectionId={collectionId} onDone={() => setCreating(false)} />
      </Panel>
    ) : (
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-[var(--hairline-strong)] px-6 py-12 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(200,109,215,0.14),transparent_60%)]" />
        <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[#c86dd7] text-white shadow-[var(--shadow-2)]">
          <Gift className="h-6 w-6" />
        </span>
        <p className="relative mt-4 text-[15px] font-semibold text-[var(--text-1)]">Reward fans who collect it all</p>
        <p className="relative mx-auto mt-1 max-w-[46ch] text-[12.5px] text-[var(--text-3)]">
          Add exclusive videos, music, GIFs or posters to {collectionName}. A fan unlocks them by collecting every
          released drop in it.
        </p>
        {editable ? (
          <Button variant="primary" size="sm" className="relative mt-5" onClick={() => setCreating(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Add a reward
          </Button>
        ) : null}
      </div>
    );
  }

  return <RewardView reward={reward} collectionId={collectionId} editable={editable} />;
}

/* ------------------------------------------------------------------ */
/* The reward                                                          */
/* ------------------------------------------------------------------ */

function RewardView({
  reward: r,
  collectionId,
  editable,
}: {
  reward: CollectionReward;
  collectionId: string;
  editable: boolean;
}) {
  const save = useSaveCollectionReward(collectionId);
  const remove = useRemoveCollectionReward(collectionId);
  const [editing, setEditing] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const removed = r.status === "REMOVED";
  const canFiles = editable && !removed;

  const contents = rewardContentsSummary(r.itemCounts);
  // HitBox switched it off or removed it: only staff can bring it back.
  const locked = r.moderation?.locked === true;

  // Flips at once; the save runs behind it and is undone if it fails.
  const toggleSave = useToggleCollectionReward(collectionId);
  const toggle = () => {
    const next = !r.isActive;
    toggleSave.mutate(
      { name: r.name, isActive: next },
      {
        onError: (err) =>
          toast.error(`${next ? "Couldn't switch it on" : "Couldn't pause it"} — ${errText(err, "the change was undone.")}`),
      }
    );
  };

  const restore = () =>
    save.mutate(
      { name: r.name },
      {
        onSuccess: () => toast.success("Reward restored, with its files and unlocks"),
        onError: (err) => toast.error(errText(err, "Could not restore the reward.")),
      }
    );

  return (
    <div className="space-y-4">
      {locked ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border-2 border-[var(--danger)] bg-[var(--danger-dim)] px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <div className="text-[12.5px]">
            <p className="font-semibold text-[var(--danger)]">
              {removed ? "Removed" : "Switched off"} by HitBox: {r.moderation?.reason ?? "no reason given"}
            </p>
            <p className="mt-0.5 text-[var(--text-2)]">
              {r.moderation?.lockedAt ? `Since ${formatDateTime(r.moderation.lockedAt)}. ` : ""}
              You can still edit the name, description and files, but only HitBox can switch it back on. Contact
              support once it&rsquo;s fixed.
            </p>
          </div>
        </div>
      ) : null}
      {removed ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-4 py-3">
          <p className="flex-1 text-[12.5px] text-[var(--text-2)]">
            This reward is removed — fans can&rsquo;t open it. Its files and unlocks are kept, so restoring brings it
            all back.
          </p>
          {editable ? (
            <Button
              variant="primary"
              size="sm"
              loading={save.isPending}
              onClick={restore}
              disabled={locked}
              title={locked ? "Locked by HitBox — only staff can restore it" : undefined}
            >
              <ArchiveRestore className="h-3.5 w-3.5" /> Restore
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(200,109,215,0.16),transparent_55%)]" />
        {editing ? (
          <RewardForm collectionId={collectionId} reward={r} onDone={() => setEditing(false)} />
        ) : (
          <div className="relative flex flex-wrap items-start gap-4 px-5 py-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[#c86dd7] text-white">
              <Gift className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">{r.name}</h3>
                <StatusBadge status={r.status} />
              </div>
              {r.description ? (
                <p className="mt-1 max-w-[70ch] whitespace-pre-line text-[12.5px] text-[var(--text-2)]">{r.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Stat icon={Users} text={`${formatNumber(r.unlockedCount)} fan${r.unlockedCount === 1 ? "" : "s"} unlocked`} />
                <Stat
                  icon={Lock}
                  text={
                    r.requiredDrops > 0
                      ? `Fans must collect all ${formatNumber(r.requiredDrops)} drop${r.requiredDrops === 1 ? "" : "s"}`
                      : "No released drops yet — nobody can complete it"
                  }
                  warn={r.requiredDrops === 0}
                />
                {contents ? <Stat icon={Sparkles} text={contents} /> : null}
              </div>
            </div>
            {editable && !removed ? (
              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  checked={r.isActive}
                  onChange={toggle}
                  disabled={locked && !r.isActive}
                  label={locked ? "Locked" : r.isActive ? "On" : "Paused"}
                />
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-[var(--danger)]" onClick={() => setRemoving(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <RewardFiles reward={r} collectionId={collectionId} editable={canFiles} />

      <ConfirmDialog
        open={removing}
        title="Remove this reward?"
        body="Fans can't open it and nobody new unlocks it. Nothing is deleted — restore it any time and its files and unlocks come back."
        confirmLabel="Remove reward"
        busy={remove.isPending}
        onCancel={() => setRemoving(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success("Reward removed");
              setRemoving(false);
            },
            onError: (err) => {
              toast.error(errText(err, "Could not remove the reward."));
              setRemoving(false);
            },
          })
        }
      />
    </div>
  );
}

export function StatusBadge({ status }: { status: CollectionReward["status"] }) {
  if (status === "ON") return <Badge tone="positive" dot>On</Badge>;
  if (status === "OFF") return <Badge tone="warning" dot>Off</Badge>;
  return <Badge tone="neutral" dot>Removed</Badge>;
}

function Stat({ icon: Icon, text, warn }: { icon: typeof Users; text: string; warn?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]",
        warn
          ? "border-[var(--warning)] bg-[var(--warning-dim)] text-[var(--warning)]"
          : "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--text-2)]"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}

/**
 * The knob's position comes from layout (justify-start / justify-end), not a
 * fixed offset — so the track can't shrink out from under it.
 */
function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? "Reward on — pause it" : "Reward paused — switch it on"}
      disabled={disabled}
      onClick={onChange}
      title={disabled ? "Locked by HitBox" : checked ? "Pause the reward" : "Switch the reward on"}
      className="group inline-flex h-7 shrink-0 items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] pl-1 pr-2.5 text-[12px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--hairline-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* Fixed-size, non-shrinking track: 36px wide, 2px inset, 16px knob → 16px of travel. */}
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200",
          checked ? "bg-[var(--positive)]" : "bg-[var(--surface-3)]"
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
      <span className={cn("min-w-[44px] text-left", checked ? "text-[var(--text-1)]" : "text-[var(--text-3)]")}>
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Create / edit                                                       */
/* ------------------------------------------------------------------ */

function RewardForm({
  collectionId,
  reward,
  onDone,
}: {
  collectionId: string;
  reward?: CollectionReward;
  onDone: () => void;
}) {
  const save = useSaveCollectionReward(collectionId);
  const [name, setName] = React.useState(reward?.name ?? "");
  const [description, setDescription] = React.useState(reward?.description ?? "");
  const [isActive, setIsActive] = React.useState(reward?.isActive ?? true);
  const locked = reward?.moderation?.locked === true;
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const next: Record<string, string> = {};
    if (!n) next.name = "A name is required.";
    else if (n.length > 120) next.name = "At most 120 characters.";
    if (description.length > 2000) next.description = "At most 2000 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(
      { name: n, description: description.trim() || null, isActive },
      {
        onSuccess: (r) => {
          toast.success(
            reward
              ? "Reward saved"
              : r.unlockedCount > 0
                ? `Reward created — ${r.unlockedCount} fan${r.unlockedCount === 1 ? "" : "s"} unlocked it already`
                : "Reward created — now add its files"
          );
          onDone();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 422) setErrors(err.fieldErrors);
          toast.error(err instanceof ApiError ? err.validationSummary ?? err.friendly : "Could not save the reward.");
        },
      }
    );
  };

  return (
    <form onSubmit={submit} className="relative space-y-4 px-5 py-5">
      <p className="text-[14px] font-semibold text-[var(--text-1)]">{reward ? "Edit reward" : "New reward"}</p>
      <Field label="Name" htmlFor="rw-name" error={errors.name} hint={`${name.length}/120`}>
        <Input id="rw-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Season One — Tour film" autoFocus />
      </Field>
      <Field label="Description" htmlFor="rw-desc" error={errors.description} hint={`${description.length}/2000 · optional`}>
        <Textarea id="rw-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Unseen footage from the Neon Nights tour." />
      </Field>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={isActive}
          disabled={locked && !reward?.isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)] disabled:opacity-50"
        />
        <span>
          <span className="block text-[12.5px] text-[var(--text-1)]">Switched on</span>
          <span className="block text-[11.5px] text-[var(--text-3)]">
            Off pauses it: nobody new unlocks it and nobody can open it. Fans who already have the full set unlock it
            the moment it&rsquo;s on.
          </span>
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={save.isPending}>
          {reward ? "Save" : "Create reward"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

type Upload = { key: string; file: File; progress: number; error?: string };

function RewardFiles({
  reward: r,
  collectionId,
  editable,
}: {
  reward: CollectionReward;
  collectionId: string;
  editable: boolean;
}) {
  const add = useAddRewardItem(collectionId);
  const reorder = useReorderRewardItems(collectionId);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = React.useState<Upload[]>([]);
  const [dragOverZone, setDragOverZone] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const running = React.useRef(false);

  const items = [...r.items].sort((a, b) => a.position - b.position);
  const slots = MAX_FILES - items.length - uploads.filter((u) => !u.error).length;

  /** Uploads run one at a time, in the order picked — later picks join the queue. */
  const queue = React.useRef<Upload[]>([]);
  const pump = React.useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const u = queue.current.shift()!;
      await new Promise<void>((resolve) =>
        add.mutate(
          {
            file: u.file,
            onProgress: (p) => setUploads((list) => list.map((x) => (x.key === u.key ? { ...x, progress: p } : x))),
          },
          {
            onSuccess: () => {
              setUploads((list) => list.filter((x) => x.key !== u.key));
              resolve();
            },
            onError: (err) => {
              setUploads((list) =>
                list.map((x) => (x.key === u.key ? { ...x, error: errText(err, "Upload failed.") } : x))
              );
              resolve();
            },
          }
        )
      );
    }
    running.current = false;
  }, [add]);

  const pick = (files: FileList | File[] | null) => {
    if (!files || !editable) return;
    const list = Array.from(files);
    const accepted: Upload[] = [];
    let room = slots;
    for (const file of list) {
      const problem = checkFile(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      if (room <= 0) {
        toast.error(`A reward can hold at most ${MAX_FILES} files.`);
        break;
      }
      room -= 1;
      // Some browsers leave the type blank; S3 needs the exact one we presign with.
      const typed = file.type === normaliseType(file) ? file : new File([file], file.name, { type: normaliseType(file) });
      accepted.push({ key: `${Date.now()}-${Math.random()}`, file: typed, progress: 0 });
    }
    if (!accepted.length) return;
    setUploads((u) => [...u, ...accepted]);
    queue.current.push(...accepted);
    void pump();
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    reorder.mutate(
      next.map((i) => i.id),
      { onError: (err) => toast.error(errText(err, "Could not reorder the files.")) }
    );
  };

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-[var(--text-1)]">Files</p>
          <p className="text-[11.5px] text-[var(--text-3)]">
            {items.length} of {MAX_FILES} · what fans see once they unlock it, in this order
          </p>
        </div>
        {editable && slots > 0 ? (
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Add files
          </Button>
        ) : null}
      </div>

      {editable && slots > 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            if (dragId) return;
            e.preventDefault();
            setDragOverZone(true);
          }}
          onDragLeave={() => setDragOverZone(false)}
          onDrop={(e) => {
            if (dragId) return;
            e.preventDefault();
            setDragOverZone(false);
            pick(e.dataTransfer.files);
          }}
          className={cn(
            "m-4 flex w-[calc(100%-2rem)] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
            dragOverZone
              ? "border-[var(--accent)] bg-[var(--accent-dim)]"
              : "border-[var(--hairline-strong)] hover:border-[var(--accent)]"
          )}
        >
          <Upload className="h-5 w-5 text-[var(--text-3)]" />
          <span className="text-[12.5px] text-[var(--text-1)]">Drop files here or click to choose</span>
          <span className="text-[11px] text-[var(--text-3)]">
            {FILE_RULES.map((f) => `${f.label} (${f.ext}) ≤ ${formatBytes(f.max)}`).join(" · ")}
          </span>
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      {uploads.length ? (
        <ul className="space-y-1.5 px-4 pb-3">
          {uploads.map((u) => (
            <li key={u.key} className="rounded-[10px] border border-[var(--hairline)] px-3 py-2">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-[var(--text-1)]">{u.file.name}</span>
                <span className="tnum text-[var(--text-3)]">{formatBytes(u.file.size)}</span>
                {u.error ? (
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setUploads((l) => l.filter((x) => x.key !== u.key))}
                    className="text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="tnum w-10 text-right text-[var(--text-2)]">{Math.round(u.progress * 100)}%</span>
                )}
              </div>
              {u.error ? (
                <p className="mt-1 text-[11.5px] text-[var(--danger)]">{u.error}</p>
              ) : (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#c86dd7] transition-[width]"
                    style={{ width: `${Math.max(3, u.progress * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {items.length === 0 && uploads.length === 0 ? (
        <p className="px-4 pb-5 text-center text-[12.5px] text-[var(--text-3)]">
          No files yet{editable ? " — add a video, a track, a GIF or a poster." : "."}
        </p>
      ) : (
        <ul className={cn("divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]", reorder.isPending && "opacity-60")}>
          {items.map((it, i) => (
            <li
              key={it.id}
              draggable={editable && items.length > 1}
              onDragStart={(e) => {
                setDragId(it.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(it.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = items.findIndex((x) => x.id === dragId);
                setDragId(null);
                setOverId(null);
                if (from >= 0) move(from, i);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={cn(
                "transition-colors",
                dragId === it.id && "opacity-40",
                overId === it.id && dragId !== it.id && "bg-[var(--accent-dim)]"
              )}
            >
              <ItemRow item={it} index={i} count={items.length} collectionId={collectionId} editable={editable} onMove={move} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ItemRow({
  item: it,
  index,
  count,
  collectionId,
  editable,
  onMove,
}: {
  item: CollectionRewardItem;
  index: number;
  count: number;
  collectionId: string;
  editable: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const rename = useRenameRewardItem(collectionId);
  const remove = useRemoveRewardItem(collectionId);
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(it.title);
  const [confirm, setConfirm] = React.useState(false);
  const Icon = KIND_ICON[it.kind];

  const saveTitle = () => {
    const t = title.trim();
    if (t === it.title) return setEditing(false);
    rename.mutate(
      { itemId: it.id, title: t || null },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => toast.error(errText(err, "Could not rename the file.")),
      }
    );
  };

  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
      {editable && count > 1 ? (
        <span className="mt-6 hidden cursor-grab text-[var(--text-3)] sm:block" aria-hidden>
          <GripVertical className="h-4 w-4" />
        </span>
      ) : null}
      <Preview item={it} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveTitle();
            }}
            className="flex items-center gap-1.5"
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus className="h-8" placeholder={it.fileName} />
            <Button type="submit" variant="primary" size="icon-sm" loading={rename.isPending} aria-label="Save title">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel"
              onClick={() => {
                setTitle(it.title);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[var(--text-1)]">
            <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
            <span className="truncate">{it.title}</span>
          </p>
        )}
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-3)]">
          {it.kind === "AUDIO" ? "Music" : it.kind.charAt(0) + it.kind.slice(1).toLowerCase()} · {it.fileName} ·{" "}
          {formatBytes(it.sizeBytes)}
        </p>
      </div>
      {editable ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move up" title="Move up">
            ↑
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label="Move down" title="Move down">
            ↓
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Rename" title="Rename">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-[var(--danger)]" onClick={() => setConfirm(true)} aria-label="Remove" title="Remove">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        title={`Remove ${it.title}?`}
        body="It's taken out of the reward. The file is kept in storage for the record."
        confirmLabel="Remove file"
        busy={remove.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          remove.mutate(it.id, {
            onSuccess: () => setConfirm(false),
            onError: (err) => {
              toast.error(errText(err, "Could not remove the file."));
              setConfirm(false);
            },
          })
        }
      />
    </div>
  );
}

/** Previews from the signed link — never stored, re-read with the reward. */
export function Preview({ item: it }: { item: CollectionRewardItem }) {
  const box = "w-full shrink-0 overflow-hidden rounded-[10px] bg-[var(--surface-3)] sm:w-[220px]";
  if (!it.url) {
    const Icon = KIND_ICON[it.kind];
    return (
      <div className={cn(box, "flex h-[124px] items-center justify-center text-[var(--text-3)]")}>
        <Icon className="h-6 w-6" />
      </div>
    );
  }
  if (it.kind === "VIDEO") {
    return (
      <div className={box}>
        <video src={it.url} controls preload="metadata" className="h-[124px] w-full bg-black object-contain" />
      </div>
    );
  }
  if (it.kind === "AUDIO") {
    return (
      <div className={cn(box, "flex h-[124px] flex-col justify-center gap-2 bg-gradient-to-br from-[var(--accent-dim)] to-[var(--surface-3)] px-3")}>
        <FileAudio className="h-6 w-6 text-[var(--accent-text)]" />
        <audio src={it.url} controls preload="none" className="h-8 w-full" />
      </div>
    );
  }
  return (
    <div className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived S3 link */}
      <img src={it.url} alt={it.title} className="h-[124px] w-full object-cover" loading="lazy" />
    </div>
  );
}
