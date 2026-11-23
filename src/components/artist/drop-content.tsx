"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ArchiveRestore,
  Crown,
  Eye,
  Gift,
  Info,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  dropTierFilesTarget,
  useArtistDropContent,
  useCreateDropContentTier,
  useRemoveDropContentTier,
  useRestoreDropContentTier,
  useUpdateDropContentTier,
} from "@/lib/api/hooks";
import { formatDateTime, formatNumber } from "@/lib/format";
import { describeSerials, formatSerials, parseSerials, serialDiff, serialLabel } from "@/lib/serials";
import { usePageChrome } from "@/components/layout/app-shell";
import { Badge, Button, Field, Input, Panel, Skeleton, Textarea } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/packing/packing-ui";
import {
  RewardFiles,
  Stat,
  StatusBadge,
  Switch,
  rewardContentsSummary,
} from "@/components/artist/collection-reward-tab";
import type {
  ArtistDropContent,
  DropContentClaimedUnit,
  DropContentTier,
  DropContentTierKind,
} from "@/lib/types";

/**
 * A drop's content, from the artist's side (drop-content.md §3).
 *
 *  - REGULAR (at most one): every owner of any unit opens it.
 *  - EXCLUSIVE (up to ten): only owners of the units whose serial numbers it
 *    lists — "#042 comes with the signed video". On top of regular content.
 *
 * "Owner" means owns it now AND has tapped it; access is decided live, so a
 * resale moves it and a refund ends it. A serial can be added to or taken off
 * a tier only while its unit is unclaimed with no owner (or not minted yet):
 * 409 DROP_CONTENT_UNIT_CLAIMED otherwise, with nothing saved.
 */

const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.friendly : fallback);

type Drop = ArtistDropContent["drop"];
type Limits = ArtistDropContent["limits"];

export function ArtistDropContentView({ dropId }: { dropId: string }) {
  const q = useArtistDropContent(dropId);
  const [creating, setCreating] = React.useState<DropContentTierKind | null>(null);

  usePageChrome({
    title: q.data ? `${q.data.drop.name} — content` : "Drop content",
    description: "What owners of this drop's units open: regular content for all, exclusive for chosen units.",
  });

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Panel>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </Panel>
    );
  }

  const { drop, regular, exclusive, limits } = q.data;
  const exclusiveFull = exclusive.length >= limits.maxExclusiveTiers;

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--text-2)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-3)]" aria-hidden />
        <span>
          {drop.name} has {formatNumber(drop.totalSupply)} units. Regular content opens for the owner of
          any unit; exclusive content opens only for the units you list, on top of the regular. An owner
          is whoever owns the unit now and has tapped it — resales move access and refunds end it.
        </span>
      </p>

      {/* Regular ---------------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeading
          title="Regular content"
          hint="One per drop — every owner opens it."
        />
        {regular ? (
          <TierCard tier={regular} drop={drop} limits={limits} />
        ) : creating === "REGULAR" ? (
          <Panel className="overflow-hidden">
            <TierForm kind="REGULAR" drop={drop} limits={limits} onDone={() => setCreating(null)} />
          </Panel>
        ) : (
          <EmptyTier
            title="No regular content yet"
            body="Add a making-of video, a track or a poster every owner of this drop can open."
            action="Add regular content"
            onAction={() => setCreating("REGULAR")}
          />
        )}
      </section>

      {/* Exclusive -------------------------------------------------- */}
      <section className="space-y-3">
        <SectionHeading
          title="Exclusive content"
          hint={`Only owners of the units you list open it · ${exclusive.length} of ${limits.maxExclusiveTiers} tiers used (removed ones count)`}
          action={
            creating !== "EXCLUSIVE" ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={exclusiveFull}
                title={exclusiveFull ? "10 tiers already — restore and reuse a removed one" : undefined}
                onClick={() => setCreating("EXCLUSIVE")}
              >
                <Plus className="h-3.5 w-3.5" /> New exclusive tier
              </Button>
            ) : undefined
          }
        />
        {creating === "EXCLUSIVE" ? (
          <Panel className="overflow-hidden">
            <TierForm kind="EXCLUSIVE" drop={drop} limits={limits} onDone={() => setCreating(null)} />
          </Panel>
        ) : null}
        {exclusive.length === 0 && creating !== "EXCLUSIVE" ? (
          <EmptyTier
            title="No exclusive tiers"
            body={`Give specific units something extra — e.g. ${serialLabel(1, drop.totalSupply)} comes with a signed video the rest don't get.`}
            action="New exclusive tier"
            onAction={() => setCreating("EXCLUSIVE")}
          />
        ) : (
          exclusive.map((t) => <TierCard key={t.id} tier={t} drop={drop} limits={limits} />)
        )}
      </section>
    </div>
  );
}

function SectionHeading({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">{title}</h2>
        <p className="text-[12px] text-[var(--text-3)]">{hint}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyTier({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--hairline-strong)] px-6 py-8 text-center">
      <p className="text-[13.5px] font-semibold text-[var(--text-1)]">{title}</p>
      <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] text-[var(--text-3)]">{body}</p>
      <Button variant="primary" size="sm" className="mt-4" onClick={onAction}>
        <Sparkles className="h-3.5 w-3.5" /> {action}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One tier                                                            */
/* ------------------------------------------------------------------ */

function TierCard({ tier: t, drop, limits }: { tier: DropContentTier; drop: Drop; limits: Limits }) {
  const update = useUpdateDropContentTier(drop.id);
  const remove = useRemoveDropContentTier(drop.id);
  const restore = useRestoreDropContentTier(drop.id);
  const filesTarget = React.useMemo(() => dropTierFilesTarget(drop.id, t.id), [drop.id, t.id]);
  const [editing, setEditing] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const removed = t.status === "REMOVED";
  const locked = t.moderation?.locked === true;
  const exclusive = t.tier === "EXCLUSIVE";
  const contents = rewardContentsSummary(t.itemCounts);

  const toggle = () =>
    update.mutate(
      { bundleId: t.id, isActive: !t.isActive },
      {
        onSuccess: () => toast.success(t.isActive ? "Paused — hidden from owners" : "Switched on"),
        onError: (err) => toast.error(errText(err, "Could not change it.")),
      }
    );

  return (
    <div className="space-y-3">
      {locked ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border-2 border-[var(--danger)] bg-[var(--danger-dim)] px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <p className="text-[12.5px]">
            <span className="font-semibold text-[var(--danger)]">
              {removed ? "Removed" : "Switched off"} by HitBox: {t.moderation?.reason ?? "no reason given"}
            </span>
            <span className="block text-[var(--text-2)]">
              {t.moderation?.lockedAt ? `Since ${formatDateTime(t.moderation.lockedAt)}. ` : ""}
              Only HitBox can switch it back on.
            </span>
          </p>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-1)]">
        {editing ? (
          <TierForm
            kind={t.tier}
            drop={drop}
            limits={limits}
            tier={t}
            onDone={() => setEditing(false)}
          />
        ) : (
          <div className="flex flex-wrap items-start gap-4 px-5 py-4">
            <span
              className={
                exclusive
                  ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e0a72e] to-[#c86dd7] text-white"
                  : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[#c86dd7] text-white"
              }
            >
              {exclusive ? <Crown className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">{t.name}</h3>
                <StatusBadge status={t.status} />
                {exclusive ? <Badge tone="warning">Exclusive</Badge> : <Badge tone="neutral">Regular</Badge>}
              </div>
              {exclusive ? (
                <p className="mt-1 text-[12.5px] text-[var(--text-1)]">
                  Opens for{" "}
                  <span className="font-medium">{describeSerials(t.serialNumbers, drop.totalSupply)}</span>
                  <span className="text-[var(--text-3)]">
                    {" "}
                    · {formatNumber(t.serialNumbers.length)} unit{t.serialNumbers.length === 1 ? "" : "s"}
                  </span>
                </p>
              ) : null}
              {t.description ? (
                <p className="mt-1 max-w-[70ch] whitespace-pre-line text-[12.5px] text-[var(--text-2)]">{t.description}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Stat
                  icon={Users}
                  text={`${formatNumber(t.holders)} owner${t.holders === 1 ? "" : "s"} can open this`}
                />
                <Stat icon={Eye} text={`Opened by ${formatNumber(t.openedBy)}`} />
                {contents ? <Stat icon={Sparkles} text={contents} /> : <Stat icon={Sparkles} text="No files yet" warn />}
              </div>
            </div>
            {!removed ? (
              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  checked={t.isActive}
                  onChange={toggle}
                  disabled={update.isPending || (locked && !t.isActive)}
                  label={locked ? "Locked" : t.isActive ? "On" : "Paused"}
                />
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-[var(--danger)]" onClick={() => setRemoving(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                size="sm"
                loading={restore.isPending}
                disabled={locked}
                title={locked ? "Locked by HitBox — only staff can restore it" : undefined}
                onClick={() =>
                  restore.mutate(t.id, {
                    onSuccess: () => toast.success("Restored, with its files and units"),
                    onError: (err) => toast.error(errText(err, "Could not restore it.")),
                  })
                }
              >
                <ArchiveRestore className="h-3.5 w-3.5" /> Restore
              </Button>
            )}
          </div>
        )}
      </div>

      {!removed ? <RewardFiles items={t.items} target={filesTarget} editable noun="tier" /> : null}

      <ConfirmDialog
        open={removing}
        title={`Remove “${t.name}”?`}
        body="Nobody opens it while it's removed. Its files and unit list are kept — restore it any time."
        confirmLabel="Remove"
        busy={remove.isPending}
        onCancel={() => setRemoving(false)}
        onConfirm={() =>
          remove.mutate(t.id, {
            onSuccess: () => {
              toast.success("Removed");
              setRemoving(false);
            },
            onError: (err) => {
              toast.error(errText(err, "Could not remove it."));
              setRemoving(false);
            },
          })
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create / edit                                                       */
/* ------------------------------------------------------------------ */

function TierForm({
  kind,
  drop,
  limits,
  tier,
  onDone,
}: {
  kind: DropContentTierKind;
  drop: Drop;
  limits: Limits;
  /** Undefined creates. */
  tier?: DropContentTier;
  onDone: () => void;
}) {
  const create = useCreateDropContentTier(drop.id);
  const update = useUpdateDropContentTier(drop.id);
  const pending = create.isPending || update.isPending;
  const exclusive = kind === "EXCLUSIVE";

  const [name, setName] = React.useState(tier?.name ?? "");
  const [description, setDescription] = React.useState(tier?.description ?? "");
  const [serialText, setSerialText] = React.useState(tier ? formatSerials(tier.serialNumbers) : "");
  const [hidden, setHidden] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; serials?: string }>({});
  /** The units the server refused — kept beside the field until the list changes. */
  const [claimed, setClaimed] = React.useState<DropContentClaimedUnit[]>([]);

  const parsed = React.useMemo(
    () => parseSerials(serialText, drop.totalSupply, limits.maxSerialsPerTier),
    [serialText, drop.totalSupply, limits.maxSerialsPerTier]
  );
  const diff = tier ? serialDiff(tier.serialNumbers, parsed.serials) : null;
  const serialsChanged = !!diff && (diff.added.length > 0 || diff.removed.length > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Required.";
    if (exclusive) {
      if (parsed.errors.length) next.serials = parsed.errors.join(" · ");
      else if (parsed.serials.length === 0) next.serials = "List at least one unit.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const onError = (err: unknown) => {
      if (err instanceof ApiError && err.code === "DROP_CONTENT_UNIT_CLAIMED") {
        // Nothing was saved; keep the edit in the form and point at the units.
        const units = ((err.details as { units?: DropContentClaimedUnit[] })?.units ?? []).sort(
          (a, b) => a.serialNumber - b.serialNumber
        );
        setClaimed(units);
        setErrors({ serials: err.message || err.friendly });
        return;
      }
      if (err instanceof ApiError && err.code === "DROP_CONTENT_SERIALS_INVALID") {
        const invalid = (err.details as { invalid?: number[] })?.invalid;
        setErrors({
          serials: invalid?.length
            ? `${invalid.map((n) => serialLabel(n, drop.totalSupply)).join(", ")} can't be used. ${err.friendly}`
            : err.friendly,
        });
        return;
      }
      if (err instanceof ApiError && err.code === "DROP_CONTENT_REGULAR_EXISTS") {
        toast.error("This drop already has regular content — edit that one instead.");
        onDone();
        return;
      }
      toast.error(errText(err, "Could not save."));
    };

    if (!tier) {
      create.mutate(
        {
          tier: kind,
          name: name.trim(),
          description: description.trim() || undefined,
          ...(hidden ? { isActive: false } : {}),
          ...(exclusive ? { serialNumbers: parsed.serials } : {}),
        },
        {
          onSuccess: () => {
            toast.success(exclusive ? "Exclusive tier created" : "Regular content created");
            onDone();
          },
          onError,
        }
      );
      return;
    }

    // Send only what changed: the lock rule checks changed serials, so a
    // rename of a tier that lists a claimed unit must not resend the list.
    const body = {
      ...(name.trim() !== tier.name ? { name: name.trim() } : {}),
      ...((description.trim() || null) !== (tier.description ?? null)
        ? { description: description.trim() || null }
        : {}),
      ...(exclusive && serialsChanged ? { serialNumbers: parsed.serials } : {}),
    };
    if (Object.keys(body).length === 0) {
      onDone();
      return;
    }
    update.mutate(
      { bundleId: tier.id, ...body },
      {
        onSuccess: () => {
          toast.success("Saved");
          onDone();
        },
        onError,
      }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4 px-5 py-5">
      <p className="text-[13px] font-semibold text-[var(--text-1)]">
        {tier ? `Edit “${tier.name}”` : exclusive ? "New exclusive tier" : "Regular content"}
      </p>

      <Field label="Name" htmlFor="tier-name" error={errors.name} required>
        <Input
          id="tier-name"
          value={name}
          maxLength={120}
          invalid={!!errors.name}
          onChange={(e) => setName(e.target.value)}
          placeholder={exclusive ? "Signed video" : "Making-of"}
          autoFocus
        />
      </Field>

      <Field label="Description" htmlFor="tier-desc" hint="Shown to owners.">
        <Textarea
          id="tier-desc"
          rows={2}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {exclusive ? (
        <div className="space-y-2">
          <Field
            label="Units that open it"
            htmlFor="tier-serials"
            error={errors.serials}
            required
            hint={`Serial numbers 1–${drop.totalSupply}, e.g. “1, 7, 40-45”. Up to ${formatNumber(limits.maxSerialsPerTier)}.`}
          >
            <Input
              id="tier-serials"
              value={serialText}
              invalid={!!errors.serials}
              onChange={(e) => {
                setSerialText(e.target.value);
                setClaimed([]);
                setErrors((x) => ({ ...x, serials: undefined }));
              }}
              placeholder="1, 7, 40-45"
              className="font-mono"
            />
          </Field>

          {claimed.length > 0 ? (
            <ul className="rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2 text-[12px] text-[var(--danger)]">
              {claimed.map((u) => (
                <li key={u.skuId}>
                  Unit {serialLabel(u.serialNumber, drop.totalSupply)} is{" "}
                  {u.claimedStatus === "CLAIMED" ? "claimed" : u.owned ? "owned" : u.claimedStatus.toLowerCase()} —
                  it can&rsquo;t be {tier?.serialNumbers.includes(u.serialNumber) ? "taken off" : "added"}. Nothing
                  was saved.
                </li>
              ))}
            </ul>
          ) : null}

          {parsed.serials.length > 0 && !parsed.errors.length ? (
            <p className="text-[11.5px] text-[var(--text-2)]">
              {formatNumber(parsed.serials.length)} unit{parsed.serials.length === 1 ? "" : "s"}:{" "}
              {describeSerials(parsed.serials, drop.totalSupply)}
              {diff && serialsChanged ? (
                <span className="text-[var(--text-3)]">
                  {diff.added.length ? ` · adding ${describeSerials(diff.added, drop.totalSupply, 6)}` : ""}
                  {diff.removed.length ? ` · removing ${describeSerials(diff.removed, drop.totalSupply, 6)}` : ""}
                </span>
              ) : null}
            </p>
          ) : null}

          <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--text-3)]">
            <Lock className="mt-[2px] h-3 w-3 shrink-0" aria-hidden />
            Units already claimed or owned can&rsquo;t be added or removed — an owner never gains or loses
            exclusive content after buying. They can stay listed. Units not minted yet can always change.
          </p>
        </div>
      ) : null}

      {!tier ? (
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Keep it hidden while I add files
        </label>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          {tier ? "Save" : "Create"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
