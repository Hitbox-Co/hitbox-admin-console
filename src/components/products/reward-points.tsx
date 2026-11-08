"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, Sparkles } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useUpdateRewardPoints } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/components/layout/authz-provider";
import { Button, Field, Input, Panel, PanelHeader, Textarea } from "@/components/ui/primitives";
import type { AdminProductDetail } from "@/lib/types";

/**
 * Drop reward points. Shown read-only everywhere a drop is; changed only
 * here, by a System Admin (drop:configure:global), through
 * PUT /admin/products/:id/reward-points. Never part of the drop form.
 */

const MAX_POINTS = 1_000_000;
const REASON_MAX = 500;

/** "250 pts" — or nothing when no points are set (0 / absent). */
export function RewardPointsBadge({
  points,
  className,
  showZero,
}: {
  points: number | undefined | null;
  className?: string;
  /** Render "No points" instead of nothing for 0. */
  showZero?: boolean;
}) {
  if (!points) {
    return showZero ? <span className={cn("text-[11.5px] text-[var(--text-3)]", className)}>No points</span> : null;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(245,185,66,0.14)] px-2 py-0.5 text-[11px] font-medium text-[#e0a72e]",
        className
      )}
      title={`${formatNumber(points)} reward points`}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      <span className="tnum">{formatNumber(points)}</span> pts
    </span>
  );
}

export function RewardPointsPanel({ product }: { product: AdminProductDetail }) {
  const perms = usePermissions();
  const canEdit = perms.canEditRewardPoints();
  const [editing, setEditing] = React.useState(false);
  const points = product.rewardPoints ?? 0;

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Reward points"
        description="What a buyer earns for this drop."
        action={
          canEdit && !editing ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" /> Edit points
            </Button>
          ) : undefined
        }
      />
      {editing ? (
        <EditPoints product={product} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              points ? "bg-[rgba(245,185,66,0.14)] text-[#e0a72e]" : "bg-[var(--surface-2)] text-[var(--text-3)]"
            )}
          >
            <Sparkles className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="tnum text-[22px] font-semibold leading-none text-[var(--text-1)]">{formatNumber(points)}</p>
            <p className="mt-1 text-[11.5px] text-[var(--text-3)]">{points ? "points per purchase" : "No points set"}</p>
          </div>
        </div>
      )}
    </Panel>
  );
}

function EditPoints({ product, onDone }: { product: AdminProductDetail; onDone: () => void }) {
  const update = useUpdateRewardPoints(product.id);
  const [value, setValue] = React.useState(String(product.rewardPoints ?? 0));
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (value.trim() === "" || !Number.isInteger(n) || n < 0 || n > MAX_POINTS) {
      setError(`A whole number from 0 to ${formatNumber(MAX_POINTS)}.`);
      return;
    }
    setError(null);
    update.mutate(
      { rewardPoints: n, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      {
        onSuccess: (p) => {
          toast.success(`Reward points set to ${formatNumber(p.rewardPoints ?? n)}`);
          onDone();
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.status === 403) return setError("Only a System Admin can change points");
            if (err.status === 422) return setError(err.validationSummary ?? err.message);
            if (err.status === 404) return setError("Drop not found.");
          }
          setError(err instanceof ApiError ? err.friendly : "Could not save the points.");
        },
      }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-3 px-4 py-3.5">
      <Field label="Points" htmlFor="rp-points" error={error ?? undefined} hint={`Whole number, 0 – ${formatNumber(MAX_POINTS)}. 0 means none.`}>
        <Input
          id="rp-points"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_POINTS}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="tnum w-[160px]"
          autoFocus
        />
      </Field>
      <Field label="Reason (optional)" htmlFor="rp-reason" hint={`${reason.length}/${REASON_MAX}`}>
        <Textarea
          id="rp-reason"
          rows={2}
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Launch week promotion"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={update.isPending}>
          Save points
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* The drop form's section — System Admin only                         */
/* ------------------------------------------------------------------ */

export interface RewardPointsDraft {
  points: string;
  reason: string;
}

/** null when valid, else the message. */
export function validateRewardPoints(d: RewardPointsDraft): string | null {
  const n = Number(d.points);
  if (d.points.trim() === "" || !Number.isInteger(n) || n < 0 || n > MAX_POINTS) {
    return `A whole number from 0 to ${formatNumber(MAX_POINTS)}.`;
  }
  return null;
}

/** The message for a failed PUT …/reward-points. */
export function rewardPointsError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Only a System Admin can change points";
    if (err.status === 422) return err.validationSummary ?? err.message;
    if (err.status === 404) return "Drop not found.";
    return err.friendly;
  }
  return "Could not save the points.";
}

/**
 * Points inside the create / edit drop form. The value never travels with
 * POST or PATCH /admin/products (refused, 422) — the form sets it through
 * PUT …/reward-points once the drop is saved.
 */
export function RewardPointsFormSection({
  value,
  onChange,
  error,
  disabled,
  current,
}: {
  value: RewardPointsDraft;
  onChange: (next: RewardPointsDraft) => void;
  error?: string;
  disabled?: boolean;
  /** The saved value, when editing. */
  current?: number;
}) {
  const n = Number(value.points);
  const changed = current !== undefined && Number.isInteger(n) && n !== current;
  return (
    <section className="space-y-3 rounded-[12px] border border-[rgba(245,185,66,0.35)] bg-[rgba(245,185,66,0.06)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-1)]">
            <Sparkles className="h-3.5 w-3.5 text-[#e0a72e]" aria-hidden /> Reward points
          </p>
          <p className="mt-0.5 text-[11.5px] text-[var(--text-3)]">
            What a buyer earns with this drop. Only a System Admin can set this; everyone else sees it read-only.
          </p>
        </div>
        {current !== undefined ? (
          <span className="text-[11.5px] text-[var(--text-3)]">
            Now <span className="tnum font-medium text-[var(--text-2)]">{formatNumber(current)}</span>
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Points" htmlFor="form-rp" error={error} hint="0 – 1,000,000 · 0 means none">
          <Input
            id="form-rp"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_POINTS}
            step={1}
            value={value.points}
            onChange={(e) => onChange({ ...value, points: e.target.value })}
            className="tnum"
            disabled={disabled}
          />
        </Field>
        <Field label="Reason (optional)" htmlFor="form-rp-reason" hint={`${value.reason.length}/${REASON_MAX} · kept in the audit trail`}>
          <Input
            id="form-rp-reason"
            value={value.reason}
            maxLength={REASON_MAX}
            onChange={(e) => onChange({ ...value, reason: e.target.value })}
            placeholder={changed || current === undefined ? "e.g. Launch promo" : "Only sent when the points change"}
            disabled={disabled}
          />
        </Field>
      </div>
    </section>
  );
}
