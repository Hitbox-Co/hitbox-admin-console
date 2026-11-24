"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Info,
  Mail,
  Package,
  Pencil,
  TrendingUp,
  Unlink,
  UserMinus,
  Users,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useAssignVendorDrop,
  useInviteVendorMember,
  useProductVariants,
  useRevokeVendorMember,
  useUnassignVendorDrop,
  usePatchVendorAllotment,
  useUpdateVendorAllotment,
  useVendorDropAssignments,
  useVendorMembers,
} from "@/lib/api/hooks";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { DropPicker } from "@/components/finance/entity-pickers";
import { AllotmentSummary, variantName } from "@/components/supply/allotment-summary";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
  Segmented,
  Textarea,
  toneForStatus,
  type BadgeTone,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import type {
  Vendor,
  VendorAllotmentInput,
  VendorDropAssignment,
  VendorMember,
  VendorMemberStatus,
} from "@/lib/types";

/**
 * Who may sign in for a vendor, and which drops it may supply
 * (vendor-admin-api.md). Both sit behind nfc-tag-claim:manage at GLOBAL —
 * the same gate as every other supply write — so the vendor drawer only
 * offers these tabs to a caller who can already edit the vendor.
 *
 * A closed vendor (archived or inactive) takes no new invites and no new
 * assignments: the API answers 409, so the controls say why instead.
 */

const onError = (fallback: string) => (err: unknown) =>
  toast.error(err instanceof ApiError ? err.friendly : fallback);

function closedReason(vendor: Vendor): string | null {
  if (vendor.archivedAt) return "This vendor is retired. Restore it first.";
  if (!vendor.isActive) return "This vendor is inactive. Reactivate it on the Details tab first.";
  return null;
}

const MEMBER_TONE: Record<VendorMemberStatus, BadgeTone> = {
  INVITED: "warning",
  ACTIVE: "positive",
  REVOKED: "neutral",
};

/* ------------------------------------------------------------------ */
/* Portal users                                                         */
/* ------------------------------------------------------------------ */

export function VendorMembersPanel({ vendor }: { vendor: Vendor }) {
  const [status, setStatus] = React.useState<VendorMemberStatus | "ALL">("ALL");
  const members = useVendorMembers(vendor.id, status === "ALL" ? undefined : status);
  const invite = useInviteVendorMember(vendor.id);
  const [email, setEmail] = React.useState("");
  const closed = closedReason(vendor);

  const sendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (invite.isPending || closed) return;
    // "" counts as absent server-side — the vendor's contactEmail is used.
    invite.mutate(
      { email: email.trim() || undefined },
      {
        onSuccess: (res) => {
          setEmail("");
          toast.success(
            res.outcome === "ROLE_ASSIGNED"
              ? `${res.member.email} already had an account — access granted now.`
              : `Invitation emailed to ${res.member.email}${
                  res.invitationExpiresAt
                    ? ` — expires ${formatDateTime(res.invitationExpiresAt)}`
                    : ""
                }.`
          );
        },
        onError: onError("Could not send the invitation."),
      }
    );
  };

  const rows = members.data ?? [];

  return (
    <div className="space-y-4">
      <form onSubmit={sendInvite} className="space-y-2">
        <Field
          label="Invite someone to the vendor portal"
          htmlFor="vm-email"
          hint={
            closed ??
            (vendor.contactEmail
              ? `Leave blank to invite the contact on file (${vendor.contactEmail}).`
              : "No contact email on file — an address is required.")
          }
        >
          <div className="flex gap-2">
            <Input
              id="vm-email"
              type="email"
              value={email}
              disabled={!!closed}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={vendor.contactEmail ?? "name@factory.example"}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={invite.isPending}
              disabled={!!closed || (!email.trim() && !vendor.contactEmail)}
            >
              <Mail className="h-3.5 w-3.5" />
              Invite
            </Button>
          </div>
        </Field>
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-3)]">
          <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
          A new address gets a sign-up email and stays Invited until they set a
          password. An address with an account already is granted access
          immediately. One address can act for one vendor at a time.
        </p>
      </form>

      <Panel>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
            Portal users
          </p>
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: "ALL", label: "All" },
              { value: "INVITED", label: "Invited" },
              { value: "ACTIVE", label: "Active" },
              { value: "REVOKED", label: "Revoked" },
            ]}
          />
        </div>
        {members.isLoading ? (
          <TableSkeleton rows={3} cols={3} />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={status === "ALL" ? "Nobody invited yet" : `No ${humanize(status).toLowerCase()} users`}
            description="Invited users book consignments and upload chip manifests for this vendor's assigned drops."
          />
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {rows.map((m) => (
              <MemberRow key={m.id} vendorId={vendor.id} member={m} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function MemberRow({ vendorId, member }: { vendorId: string; member: VendorMember }) {
  const revoke = useRevokeVendorMember(vendorId);
  const [revoking, setRevoking] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const confirm = () => {
    const r = reason.trim();
    if (!r || revoke.isPending) return;
    revoke.mutate(
      { memberId: member.id, reason: r },
      {
        onSuccess: () => {
          toast.success(
            member.status === "INVITED"
              ? `Invitation to ${member.email} withdrawn`
              : `${member.email} can no longer sign in for this vendor`
          );
          setRevoking(false);
          setReason("");
        },
        onError: onError("Could not revoke this member."),
      }
    );
  };

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[var(--text-1)]">{member.email}</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
            Invited {formatDate(member.invitedAt)}
            {member.acceptedAt ? ` · joined ${formatDate(member.acceptedAt)}` : ""}
            {member.revokedAt ? ` · revoked ${formatDate(member.revokedAt)}` : ""}
          </p>
          {member.revokeReason ? (
            <p className="mt-0.5 text-[11px] italic text-[var(--text-3)]">
              “{member.revokeReason}”
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={MEMBER_TONE[member.status] ?? toneForStatus(member.status)} dot>
            {humanize(member.status)}
          </Badge>
          {member.status !== "REVOKED" && !revoking ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRevoking(true)}
              aria-label={`Revoke ${member.email}`}
            >
              <UserMinus className="h-3.5 w-3.5" />
              {member.status === "INVITED" ? "Withdraw" : "Revoke"}
            </Button>
          ) : null}
        </div>
      </div>

      {revoking ? (
        <div className="mt-2.5 space-y-2">
          <Field
            label="Reason"
            htmlFor={`revoke-${member.id}`}
            hint={
              member.status === "INVITED"
                ? "Withdraws the pending invitation too. Recorded in the audit log."
                : "Their portal access ends on their next request. Recorded in the audit log."
            }
          >
            <Textarea
              id={`revoke-${member.id}`}
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Left the company"
              autoFocus
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              loading={revoke.isPending}
              disabled={!reason.trim()}
              onClick={confirm}
            >
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRevoking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Drop assignments and variant allotments                              */
/*                                                                      */
/* The chip is embedded in the goods and goods come in variants, so a   */
/* drop with live variants is allotted PER VARIANT ("Red / S: 100 ·     */
/* Red / M: 100"); one without takes an optional drop-level cap. The    */
/* vendor can book no more than the allotment; staff routes ignore it.  */
/* ------------------------------------------------------------------ */

export function VendorDropsPanel({ vendor }: { vendor: Vendor }) {
  const assignments = useVendorDropAssignments(vendor.id);
  const assign = useAssignVendorDrop(vendor.id);
  const [dropId, setDropId] = React.useState<string | undefined>();
  const closed = closedReason(vendor);

  const rows = assignments.data ?? [];
  const alreadyAssigned = !!dropId && rows.some((a) => a.dropId === dropId);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Field
          label="Assign a drop"
          htmlFor="vd-drop"
          hint={
            closed ??
            (alreadyAssigned
              ? "Already assigned — change its allotment below instead."
              : "Then set how many the vendor is to supply. Several vendors may share a drop — e.g. one makes S/M, another L.")
          }
        >
          <DropPicker id="vd-drop" value={dropId} onChange={setDropId} disabled={!!closed} />
        </Field>

        {dropId && !closed && !alreadyAssigned ? (
          <Panel className="px-3 py-3">
            <AllotmentEditor
              key={dropId}
              dropId={dropId}
              pending={assign.isPending}
              submitLabel="Assign"
              onCancel={() => setDropId(undefined)}
              onSubmit={(allotment, onFail) =>
                assign.mutate(
                  { dropId, ...allotment },
                  {
                    onSuccess: (a) => {
                      toast.success(`${a.drop.name} assigned`);
                      setDropId(undefined);
                    },
                    onError: (err) => {
                      onFail(err);
                      onError("Could not assign the drop.")(err);
                    },
                  }
                )
              }
            />
          </Panel>
        ) : null}
      </div>

      <Panel>
        <p className="border-b border-[var(--hairline)] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
          Assigned drops
        </p>
        {assignments.isLoading ? (
          <TableSkeleton rows={3} cols={3} />
        ) : assignments.isError ? (
          <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No drops assigned"
            description="Assignments can be made before or after the vendor's users join."
          />
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {rows.map((a) => (
              <AssignmentRow key={a.id} vendorId={vendor.id} assignment={a} closed={!!closed} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function AssignmentRow({
  vendorId,
  assignment: a,
  closed,
}: {
  vendorId: string;
  assignment: VendorDropAssignment;
  closed: boolean;
}) {
  const unassign = useUnassignVendorDrop(vendorId);
  const replace = useUpdateVendorAllotment(vendorId);
  const patch = usePatchVendorAllotment(vendorId);
  const [mode, setMode] = React.useState<"view" | "increase" | "replace" | "unassign">("view");

  const remove = () =>
    unassign.mutate(a.dropId, {
      onSuccess: () => toast.success(`${a.drop.name} unassigned`),
      onError: onError("Could not unassign the drop."),
    });

  const editing = mode === "increase" || mode === "replace";
  const mutation = mode === "replace" ? replace : patch;

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[var(--text-1)]">{a.drop.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
            <Mono className="text-[10px]">{a.drop.groupCode}</Mono>
            assigned {formatDate(a.assignedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={toneForStatus(a.drop.status)}>{humanize(a.drop.status)}</Badge>
          {mode === "view" ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={closed}
                onClick={() => setMode("increase")}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Increase supply
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={closed}
                onClick={() => setMode("replace")}
                aria-label={`Replace the allotment for ${a.drop.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode("unassign")}
                aria-label={`Unassign ${a.drop.name}`}
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 rounded-[8px] border border-[var(--hairline)] px-3 py-3">
          <AllotmentEditor
            key={mode}
            mode={mode}
            dropId={a.dropId}
            existing={a}
            pending={mutation.isPending}
            submitLabel={mode === "increase" ? "Save changes" : "Replace allotment"}
            onCancel={() => setMode("view")}
            onSubmit={(allotment, onFail) =>
              mutation.mutate(
                { dropId: a.dropId, ...allotment },
                {
                  onSuccess: () => {
                    toast.success(`Allotment for ${a.drop.name} updated`);
                    setMode("view");
                  },
                  onError: (err) => {
                    onFail(err);
                    onError("Could not update the allotment.")(err);
                  },
                }
              )
            }
          />
        </div>
      ) : (
        <AllotmentSummary assignment={a} />
      )}

      {mode === "unassign" ? (
        <div className="mt-2.5 space-y-2">
          <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
            The allotment goes with it. Consignments already booked for this
            drop stay as they are and remain visible to the vendor, but they
            can no longer upload manifests to them or book new ones.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="danger" size="sm" loading={unassign.isPending} onClick={remove}>
              Unassign
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
              Keep
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

type BelowAccepted = { variantId?: string; accepted: number; requested: number };

/**
 * Sets an allotment for one drop. The shape follows the drop: one quantity
 * per LIVE variant when it has any (archived/inactive variants are refused
 * with SUPPLY_VARIANT_INVALID), otherwise a single optional cap.
 *
 *  - assign   — POST …/drops; blank leaves a variant out.
 *  - increase — PATCH …/allotment; only the variants CHANGED here are sent,
 *               every other variant keeps its allotment. The everyday action.
 *  - replace  — PUT …/allotment; blank REMOVES a variant.
 *
 * The floor is what HitBox has already ACCEPTED (`approved`) — 409
 * SUPPLY_ALLOTMENT_BELOW_ACCEPTED below it. Going under merely booked units is
 * allowed; it just leaves those units over-booked, which is flagged.
 */
function AllotmentEditor({
  mode = "assign",
  dropId,
  existing,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  mode?: "assign" | "increase" | "replace";
  dropId: string;
  existing?: VendorDropAssignment;
  pending: boolean;
  submitLabel: string;
  onSubmit: (allotment: VendorAllotmentInput, onFail: (err: unknown) => void) => void;
  onCancel: () => void;
}) {
  const variantsQuery = useProductVariants(dropId);
  const live = React.useMemo(
    () => (variantsQuery.data ?? []).filter((v) => v.isActive && !v.archived),
    [variantsQuery.data]
  );
  const byVariant = live.length > 0;

  const prior = React.useMemo(
    () => new Map((existing?.variants ?? []).map((v) => [v.variantId, v])),
    [existing]
  );
  const initialQty = React.useMemo(
    () =>
      Object.fromEntries(
        (existing?.variants ?? [])
          .filter((v) => v.allotted > 0)
          .map((v) => [v.variantId, String(v.allotted)])
      ) as Record<string, string>,
    [existing]
  );
  const initialCap =
    existing && !existing.byVariant && existing.progress.allotted !== null
      ? String(existing.progress.allotted)
      : "";
  const [qty, setQty] = React.useState<Record<string, string>>(initialQty);
  const [cap, setCap] = React.useState(initialCap);
  const [fillAll, setFillAll] = React.useState("");
  const [belowAccepted, setBelowAccepted] = React.useState<BelowAccepted[]>([]);

  const num = (v: string | undefined) => (v && v.trim() ? Number(v) : 0);
  // In increase mode a blank box means "leave as is", so it is not a value.
  const effective = (id: string) =>
    mode === "increase" && !(qty[id] ?? "").trim()
      ? (prior.get(id)?.allotted ?? 0)
      : num(qty[id]);
  const total = byVariant ? live.reduce((sum, v) => sum + effective(v.id), 0) : num(cap);

  // What the server refuses with SUPPLY_ALLOTMENT_BELOW_ACCEPTED.
  const tooLow = byVariant
    ? live.filter((v) => effective(v.id) < (prior.get(v.id)?.approved ?? 0))
    : [];
  const capTooLow =
    !byVariant && existing && cap.trim() !== "" && num(cap) < existing.progress.approved;
  // Variants a PATCH would send: changed from what is allotted now.
  const changed = live.filter(
    (v) => (qty[v.id] ?? "").trim() && num(qty[v.id]) !== (prior.get(v.id)?.allotted ?? 0)
  );
  const capChanged = cap !== initialCap;
  // Allotted variants that are no longer live — a replace drops them.
  const orphaned = (existing?.variants ?? []).filter(
    (v) => v.allotted > 0 && !live.some((l) => l.id === v.variantId)
  );
  const booked = (id: string) => prior.get(id)?.booked ?? 0;
  const wouldBeOver = byVariant
    ? live.filter((v) => booked(v.id) > effective(v.id))
    : [];

  const invalid =
    variantsQuery.isLoading ||
    (byVariant && total === 0) ||
    tooLow.length > 0 ||
    !!capTooLow ||
    (mode === "increase" && (byVariant ? changed.length === 0 : !capChanged));

  const submit = () => {
    if (invalid || pending) return;
    setBelowAccepted([]);
    const onFail = (err: unknown) => {
      if (err instanceof ApiError && err.code === "SUPPLY_ALLOTMENT_BELOW_ACCEPTED") {
        const d = err.details as { variants?: BelowAccepted[] } & Partial<BelowAccepted>;
        setBelowAccepted(d?.variants ?? (d?.requested !== undefined ? [d as BelowAccepted] : []));
      }
    };
    if (!byVariant) {
      onSubmit({ quantity: cap.trim() ? num(cap) : null }, onFail);
    } else if (mode === "increase") {
      onSubmit(
        { variants: changed.map((v) => ({ variantId: v.id, quantity: num(qty[v.id]) })) },
        onFail
      );
    } else {
      onSubmit(
        {
          variants: live
            .filter((v) => num(qty[v.id]) > 0)
            .map((v) => ({ variantId: v.id, quantity: num(qty[v.id]) })),
        },
        onFail
      );
    }
  };

  if (variantsQuery.isLoading) return <TableSkeleton rows={3} cols={2} />;
  if (variantsQuery.isError) {
    return <ErrorState error={variantsQuery.error} onRetry={() => variantsQuery.refetch()} />;
  }

  const label = (id: string) => live.find((v) => v.id === id)?.label ?? id.slice(0, 8);
  const anyOverBooked = live.some((v) => booked(v.id) > (prior.get(v.id)?.allotted ?? 0));

  return (
    <div className="space-y-3">
      {mode !== "assign" ? (
        <p className="text-[11.5px] leading-relaxed text-[var(--text-3)]">
          {mode === "increase"
            ? "Change only what needs to move — variants you don't touch keep their allotment."
            : "Replaces the whole allotment. A blank variant is removed from it."}{" "}
          It can&rsquo;t go below what HitBox has already accepted.
        </p>
      ) : null}

      {byVariant ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-[12px] font-medium text-[var(--text-2)]">
              Units per variant
              <span className="ml-1 font-normal text-[var(--text-3)]">
                {mode === "increase" ? "— blank keeps it as is" : "— blank leaves a variant out"}
              </span>
            </p>
            <div className="flex items-center gap-1.5">
              {mode !== "assign" && anyOverBooked ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    // Raise each variant to at least what is booked; leave the rest.
                    setQty((q) => {
                      const next = { ...q };
                      for (const v of live) {
                        if (booked(v.id) > effective(v.id)) next[v.id] = String(booked(v.id));
                      }
                      return next;
                    })
                  }
                >
                  Cover what&rsquo;s booked
                </Button>
              ) : null}
              <Input
                aria-label="Quantity for every variant"
                inputMode="numeric"
                value={fillAll}
                onChange={(e) => setFillAll(e.target.value.replace(/\D/g, ""))}
                placeholder="100"
                className="h-7 w-20 text-[12px]"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={!fillAll}
                onClick={() => setQty(Object.fromEntries(live.map((v) => [v.id, fillAll])))}
              >
                Set all
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-[var(--hairline)] rounded-[8px] border border-[var(--hairline)]">
            {live.map((v) => {
              const p = prior.get(v.id);
              const low = effective(v.id) < (p?.approved ?? 0);
              const over = booked(v.id) > effective(v.id);
              return (
                <li key={v.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] text-[var(--text-1)]">{v.label}</p>
                    <p className="text-[10.5px] text-[var(--text-3)]">
                      <Mono className="text-[9.5px]">{v.variantCode}</Mono>
                      {p ? ` · ${formatNumber(p.allotted)} allotted` : " · not allotted"}
                      {p?.booked ? ` · ${formatNumber(p.booked)} booked` : ""}
                      {p?.approved ? ` · ${formatNumber(p.approved)} accepted` : ""}
                    </p>
                    {low ? (
                      <p className="text-[10.5px] text-[var(--danger)]">
                        Can&rsquo;t go below {formatNumber(p?.approved)} accepted.
                      </p>
                    ) : over ? (
                      <p className="text-[10.5px] text-[var(--warning)]">
                        {formatNumber(booked(v.id) - effective(v.id))} booked beyond this
                      </p>
                    ) : null}
                  </div>
                  <Input
                    aria-label={`Units of ${v.label}`}
                    inputMode="numeric"
                    value={qty[v.id] ?? ""}
                    invalid={low}
                    onChange={(e) =>
                      setQty((q) => ({ ...q, [v.id]: e.target.value.replace(/\D/g, "") }))
                    }
                    placeholder={mode === "increase" && p ? String(p.allotted) : "—"}
                    className="h-7 w-24 text-right text-[12.5px]"
                  />
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-[var(--text-3)]">
            Drop total <span className="tnum text-[var(--text-2)]">{formatNumber(total)}</span>
            {existing?.progress.allotted != null && total !== existing.progress.allotted
              ? ` (was ${formatNumber(existing.progress.allotted)})`
              : ""}
            {wouldBeOver.length > 0
              ? ` · ${wouldBeOver.map((v) => v.label).join(", ")} still over-booked`
              : ""}
          </p>
        </>
      ) : (
        <Field
          label="Units to supply"
          htmlFor={`cap-${dropId}`}
          error={
            capTooLow
              ? `HitBox has already accepted ${formatNumber(existing?.progress.approved)}.`
              : undefined
          }
          hint={
            existing && existing.progress.booked > 0
              ? `This drop has no variants. ${formatNumber(existing.progress.booked)} booked so far. Leave blank for no cap.`
              : "This drop has no variants. Leave blank for no cap."
          }
        >
          <Input
            id={`cap-${dropId}`}
            inputMode="numeric"
            value={cap}
            invalid={!!capTooLow}
            onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))}
            placeholder="No cap"
          />
        </Field>
      )}

      {mode === "replace" && orphaned.length > 0 ? (
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--warning)]">
          <Info className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
          {orphaned.map(variantName).join(", ")} {orphaned.length === 1 ? "is" : "are"} no
          longer a live variant and will be removed from the allotment.
        </p>
      ) : null}

      {belowAccepted.length > 0 ? (
        <ul className="rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2 text-[11.5px] text-[var(--danger)]">
          {belowAccepted.map((b, i) => (
            <li key={i}>
              {b.variantId ? label(b.variantId) : "Drop"}: {formatNumber(b.accepted)} already
              accepted, {formatNumber(b.requested)} requested
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" loading={pending} disabled={invalid} onClick={submit}>
          {submitLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
