"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { AlertTriangle, Check, Lock, ScanLine, TrendingUp, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  usePatchVendorAllotment,
  useRegisterTagManifest,
  useSupplyBatch,
  useSupplyBatchDecision,
} from "@/lib/api/hooks";
import {
  AllotmentCoverageBanner,
  isAllotmentBlock,
} from "@/components/supply/allotment-coverage";
import { variantName } from "@/components/supply/allotment-summary";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
import { Figure, ManifestForm, lineName } from "@/components/supply/manifest-form";
import { AcceptRefusal, AcceptedStock } from "@/components/supply/accept-outcome";
import {
  ConsignmentStepper,
  manifestComplete,
} from "@/components/supply/consignment-lifecycle";
import {
  Badge,
  Button,
  Field,
  Mono,
  Panel,
  Textarea,
  toneForStatus,
} from "@/components/ui/primitives";
import {
  CHIP_BEARING_ITEM_TYPES,
  type BatchAllotment,
  type SupplyAcceptStock,
  type SupplyBatch,
  type SupplyBatchStatus,
} from "@/lib/types";

/**
 *   UPLOADED ──▶ VALIDATED ──▶ (every unit chipped) ──▶ ACCEPTED
 *      │              │
 *      └──────────────┴──────▶ REJECTED
 *
 * HitBox validates the paperwork, the vendor uploads one chip per product,
 * and ACCEPT then mints one unit per chip that did not fail QC into the drop,
 * in one transaction. ACCEPTED and REJECTED are terminal. A consignment
 * accepted in error is not walked backwards — the correction is a second
 * consignment with a note, which keeps both facts.
 *
 * Accept is refused (409, nothing changed) unless the manifest is complete,
 * the vendor's allotment covers it, the drop is release-approved, and the
 * variant and drop caps have room. Rejecting is never blocked.
 */
const NEXT_STATES: Record<SupplyBatchStatus, SupplyBatchStatus[]> = {
  UPLOADED: ["VALIDATED", "REJECTED"],
  VALIDATED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
};

const ACTION_LABEL: Partial<Record<SupplyBatchStatus, string>> = {
  VALIDATED: "Validate",
  ACCEPTED: "Accept",
  REJECTED: "Reject",
};

/** Chips may only be registered while the consignment still accepts rows. */
const ACCEPTS_ROWS: SupplyBatchStatus[] = ["UPLOADED", "VALIDATED"];

export function ConsignmentDrawer({
  batch: initial,
  onClose,
}: {
  batch: SupplyBatch;
  onClose: () => void;
}) {
  const perms = usePermissions();
  // The list row is a snapshot without `allotment`; the single read has it,
  // and refetches after an allotment increase or a decision.
  const live = useSupplyBatch(initial.id);
  const batch = live.data ?? initial;
  const decide = useSupplyBatchDecision(batch.id);
  const register = useRegisterTagManifest(batch.id);
  const raise = usePatchVendorAllotment(batch.vendorId);
  /** The 409 SUPPLY_ALLOTMENT_INSUFFICIENT block, when an accept was refused. */
  const [blocked, setBlocked] = React.useState<BatchAllotment | null>(null);
  /** Any other refused accept — shown with its own explanation and fix. */
  const [refusal, setRefusal] = React.useState<ApiError | null>(null);
  /** What the accept minted, kept on screen after the status moves on. */
  const [stock, setStock] = React.useState<SupplyAcceptStock | null>(null);
  // isPending lags a render behind a fast double-click; this does not.
  const inFlight = React.useRef(false);

  const canWrite = perms.can("nfc-tag-claim", "manage", "global");
  const canReadChips = perms.canRead("nfc-tag-claim");

  const [target, setTarget] = React.useState<SupplyBatchStatus | null>(null);
  const [note, setNote] = React.useState("");
  const [tab, setTab] = React.useState<"detail" | "manifest">("detail");

  const transitions = NEXT_STATES[batch.status] ?? [];
  const acceptsRows = ACCEPTS_ROWS.includes(batch.status);

  // Only an undecided consignment can still be accepted, so only it can be short.
  const undecided = batch.status === "UPLOADED" || batch.status === "VALIDATED";
  const coverage = undecided
    ? (blocked ?? (batch.allotment && !batch.allotment.covered ? batch.allotment : null))
    : null;

  const reload = () => {
    setRefusal(null);
    setBlocked(null);
    setTarget(null);
    void live.refetch();
  };

  const submitDecision = (status: SupplyBatchStatus | null = target) => {
    if (!status || inFlight.current) return;
    // The API requires a note to reject; refusing a consignment becomes a
    // credit note and a conversation with the vendor, and "why" is the only
    // part that cannot be reconstructed afterwards.
    if (status === "REJECTED" && !note.trim()) return;

    inFlight.current = true;
    setRefusal(null);
    decide.mutate(
      { status, note: note.trim() || undefined },
      {
        onSuccess: (result) => {
          if (status === "ACCEPTED") {
            setStock(result.stock ?? null);
            toast.success(
              result.stock
                ? `Accepted — ${formatNumber(result.stock.minted)} units added to the drop`
                : "Consignment accepted"
            );
          } else {
            toast.success(`Consignment ${humanize(status).toLowerCase()}`);
          }
          setTarget(null);
          setNote("");
          setBlocked(null);
        },
        onError: (err: unknown) => {
          if (!(err instanceof ApiError)) {
            toast.error("Could not record the decision.");
            return;
          }
          // Accepting past the vendor's allotment: open the increase-then-retry
          // flow instead of a dead end.
          if (err.code === "SUPPLY_ALLOTMENT_INSUFFICIENT" && isAllotmentBlock(err.details)) {
            setBlocked(err.details);
            setTarget("ACCEPTED");
          } else if (status === "ACCEPTED" || err.code === "SUPPLY_BATCH_STATE_INVALID") {
            setRefusal(err);
          }
          toast.error(err.friendly);
        },
        onSettled: () => {
          inFlight.current = false;
        },
      }
    );
  };

  /** PATCH the suggested allotment, refetch, and optionally retry the accept. */
  const increaseAllotment = (thenAccept: boolean) => {
    const body = coverage?.suggestedPatch;
    if (!body || !batch.dropId) return;
    raise.mutate(
      { dropId: batch.dropId, ...body },
      {
        onSuccess: async () => {
          toast.success("Allotment increased");
          setBlocked(null);
          await live.refetch();
          if (thenAccept) submitDecision("ACCEPTED");
        },
        onError: (err: unknown) =>
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not increase the allotment."
          ),
      }
    );
  };

  const busy = decide.isPending || raise.isPending;

  const coverageBanner = coverage ? (
    <AllotmentCoverageBanner allotment={coverage} audience="admin">
      {canWrite && coverage.suggestedPatch && batch.dropId ? (
        <>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={busy}
            onClick={() => increaseAllotment(target === "ACCEPTED")}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {target === "ACCEPTED" ? "Increase allotment & accept" : "Increase allotment"}
          </Button>
          <span className="text-[11px] text-[var(--text-3)]">
            Sets {describePatch(coverage)}.
          </span>
        </>
      ) : canWrite ? (
        <span className="text-[11px] text-[var(--text-2)]">
          No single change covers it — adjust the allotment from the vendor&rsquo;s Drops tab.
        </span>
      ) : null}
    </AllotmentCoverageBanner>
  ) : null;

  const refusalPanel = refusal ? (
    <AcceptRefusal
      error={refusal}
      batch={batch}
      pending={busy}
      onRetry={() => submitDecision("ACCEPTED")}
      onReload={reload}
      onOpenChips={() => {
        setRefusal(null);
        setTab("manifest");
      }}
    />
  ) : null;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[640px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="space-y-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                  {batch.batchRef ?? "Consignment"}
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                  <span>{batch.vendor?.name ?? "Unknown vendor"}</span>
                  <Badge tone={toneForStatus(batch.status)} dot>
                    {humanize(batch.status)}
                  </Badge>
                  <Badge tone="neutral">{humanize(batch.itemType)}</Badge>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm" aria-label="Close">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </Dialog.Close>
            </div>
            <ConsignmentStepper batch={batch} />
          </div>

          {CHIP_BEARING_ITEM_TYPES.includes(batch.itemType) && canWrite ? (
            <div className="flex items-center gap-1 border-b border-[var(--hairline)] px-4 py-2">
              <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
                Detail
              </TabButton>
              <TabButton active={tab === "manifest"} onClick={() => setTab("manifest")}>
                <ScanLine className="h-3.5 w-3.5" />
                Register chips
              </TabButton>
            </div>
          ) : null}

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {tab === "manifest" ? (
              <ManifestForm
                batch={batch}
                disabled={!acceptsRows}
                submit={register.mutateAsync}
                allowChunking
                onCommitted={() => void live.refetch()}
              />
            ) : (
              <>
                {stock ? <AcceptedStock stock={stock} batch={batch} /> : null}

                {target !== "ACCEPTED" ? coverageBanner : null}
                {target !== "ACCEPTED" ? refusalPanel : null}

                <Reconciliation batch={batch} canReadChips={canReadChips} />

                <BatchLines batch={batch} />

                <Panel>
                  <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                    Consignment
                  </p>
                  <div className="space-y-2 px-3 pb-3">
                    <Row label="Vendor">
                      <span className="text-[12px] text-[var(--text-1)]">
                        {batch.vendor?.name ?? "—"}
                      </span>
                    </Row>
                    <Row label="Drop">
                      {batch.drop ? (
                        <span className="text-[12px] text-[var(--text-1)]">
                          {batch.drop.name}{" "}
                          <Mono className="text-[10px]">{batch.drop.groupCode}</Mono>
                        </span>
                      ) : (
                        <span className="text-[12px] text-[var(--text-3)]">
                          Platform stock — bought ahead of any drop
                        </span>
                      )}
                    </Row>
                    <Row label="Invoice">
                      {batch.vendorInvoiceRef ? (
                        <Mono className="text-[11px]">{batch.vendorInvoiceRef}</Mono>
                      ) : (
                        <span className="text-[12px] text-[var(--text-3)]">—</span>
                      )}
                    </Row>
                    <Row label="Received">
                      <span className="tnum text-[12px] text-[var(--text-1)]">
                        {formatDate(batch.receivedAt)}
                      </span>
                    </Row>
                    <Row label="Source file">
                      {batch.sourceFileRef ? (
                        <Mono className="text-[10px]">{batch.sourceFileRef}</Mono>
                      ) : (
                        <span className="text-[12px] text-[var(--text-3)]">—</span>
                      )}
                    </Row>
                    <Row label="Last updated">
                      <span className="tnum text-[12px] text-[var(--text-1)]">
                        {formatDateTime(batch.updatedAt)}
                      </span>
                    </Row>
                  </div>
                </Panel>

                {batch.notes ? (
                  <Panel className="px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">
                      Notes
                    </p>
                    {/* Decisions are APPENDED here, prefixed with the decision,
                        so a rejection reason never overwrites the discrepancy
                        that prompted it. */}
                    <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--text-1)]">
                      {batch.notes}
                    </p>
                  </Panel>
                ) : null}
              </>
            )}
          </div>

          {tab === "detail" ? (
            <div className="max-h-[55dvh] space-y-3 overflow-y-auto border-t border-[var(--hairline)] px-4 py-3">
              {!canWrite ? (
                <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                  <Lock className="h-3 w-3" aria-hidden />
                  Deciding a consignment needs nfc-tag-claim:manage at global scope
                </p>
              ) : transitions.length === 0 ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
                  <Lock className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                  {humanize(batch.status)} is terminal. A correction is a second
                  consignment with a note, which keeps both facts on the record.
                </p>
              ) : target ? (
                <>
                  {target === "ACCEPTED" ? <Readiness batch={batch} /> : null}

                  <Field
                    label={target === "REJECTED" ? "Why it was refused" : "Note"}
                    htmlFor="decision-note"
                    hint={
                      target === "REJECTED"
                        ? "Required. A refusal becomes a credit note and a conversation with the vendor — this is the part that cannot be reconstructed later. The vendor sees it."
                        : "Optional. Appended to the notes, never overwriting them."
                    }
                  >
                    <Textarea
                      id="decision-note"
                      rows={target === "REJECTED" ? 3 : 2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={
                        target === "REJECTED"
                          ? "Seals broken on arrival; refused at the dock."
                          : "Counted against the packing list."
                      }
                      autoFocus
                    />
                  </Field>

                  {target === "ACCEPTED" ? coverageBanner : null}
                  {target === "ACCEPTED" ? refusalPanel : null}

                  <div className="flex items-center gap-2">
                    <Button
                      variant={target === "REJECTED" ? "danger" : "primary"}
                      size="sm"
                      loading={decide.isPending}
                      disabled={busy || (target === "REJECTED" && !note.trim())}
                      onClick={() => submitDecision()}
                    >
                      {target === "ACCEPTED" ? <Check className="h-3.5 w-3.5" /> : null}
                      Confirm {ACTION_LABEL[target]?.toLowerCase()}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setTarget(null);
                        setRefusal(null);
                      }}
                    >
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  {batch.status === "VALIDATED" ? <Readiness batch={batch} /> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    {transitions.map((t) => (
                      <Button
                        key={t}
                        variant={t === "REJECTED" ? "danger" : "primary"}
                        size="sm"
                        onClick={() => {
                          setTarget(t);
                          setNote("");
                          setRefusal(null);
                        }}
                      >
                        {t === "ACCEPTED" || t === "VALIDATED" ? <Check className="h-3.5 w-3.5" /> : null}
                        {t === "REJECTED" ? <X className="h-3.5 w-3.5" /> : null}
                        {ACTION_LABEL[t]}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
                    {batch.status === "UPLOADED"
                      ? "Validate once the paperwork checks out — quantities, variants, invoice. The vendor can then upload the chip UIDs."
                      : "Accepting mints one unit per chip that passed (or is pending) QC into the drop, each bound to its chip. Release approval and supply caps are checked when you accept."}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Accept readiness, from data already on screen. The server re-checks all of
 * it (plus release approval and caps, which only it knows) on accept.
 */
function Readiness({ batch }: { batch: SupplyBatch }) {
  const lines = batch.lines ?? [];
  const chipsOk = manifestComplete(batch);
  const allotment = batch.allotment;
  return (
    <ul className="space-y-1 rounded-[8px] border border-[var(--hairline)] px-3 py-2 text-[12px]">
      <li className="flex items-start gap-2">
        <Tick ok={chipsOk} />
        <span className="text-[var(--text-1)]">
          Chips:{" "}
          {lines.length > 0
            ? lines.map((l, i) => (
                <span key={l.variantId}>
                  {i > 0 ? ", " : ""}
                  <span className={l.rowsReceived < l.quantity ? "text-[var(--warning)]" : undefined}>
                    {lineName(l)} {formatNumber(l.rowsReceived)} of {formatNumber(l.quantity)}
                  </span>
                </span>
              ))
            : `${formatNumber(batch.rowsReceived)} of ${formatNumber(batch.quantity)}`}
          {batch.rowsRejected > 0 ? (
            <span className="text-[var(--text-3)]">
              {" "}
              · {formatNumber(batch.rowsRejected)} failed QC (won&rsquo;t be minted)
            </span>
          ) : null}
        </span>
      </li>
      <li className="flex items-start gap-2">
        <Tick ok={!allotment || allotment.covered} />
        <span className="text-[var(--text-1)]">
          {!allotment
            ? "Not limited by a vendor allotment"
            : allotment.covered
              ? "Vendor allotment covers it"
              : "Vendor allotment doesn't cover it — increase it first"}
        </span>
      </li>
      <li className="flex items-start gap-2 text-[var(--text-3)]">
        <span className="mt-[3px] h-3 w-3 shrink-0 rounded-full border border-[var(--hairline-strong)]" aria-hidden />
        Release approval and variant / drop supply caps are checked on accept
      </li>
    </ul>
  );
}

function Tick({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--positive)]" aria-label="Ready" />
  ) : (
    <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[var(--warning)]" aria-label="Not ready" />
  );
}

/* ------------------------------------------------------------------ */

/** "Red / S → 120" — what the suggested PATCH will set, in words. */
function describePatch(a: BatchAllotment): string {
  const p = a.suggestedPatch;
  if (!p) return "";
  if (p.variants?.length) {
    return p.variants
      .map((v) => {
        const meta = a.variants.find((x) => x.variantId === v.variantId);
        return `${meta ? variantName(meta) : "variant"} → ${formatNumber(v.quantity)}`;
      })
      .join(", ");
  }
  return `the drop allotment → ${p.quantity === null ? "no cap" : formatNumber(p.quantity ?? 0)}`;
}

export function Reconciliation({
  batch,
  canReadChips,
}: {
  batch: SupplyBatch;
  canReadChips: boolean;
}) {
  const { declared, registered, shortfall, tagsRegistered } = batch.reconciliation;
  const short = shortfall > 0;

  return (
    <Panel>
      <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        Reconciliation
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 pb-2 sm:grid-cols-4">
        <Figure label="Declared" value={declared} />
        <Figure label="Registered" value={registered} />
        <Figure label="Shortfall" value={shortfall} tone={short ? "warning" : undefined} />
        {/* Present only for a caller holding nfc-tag-claim:read — it is what
            catches a manifest counted twice. */}
        {canReadChips && tagsRegistered !== undefined ? (
          <Figure label="Chip rows" value={tagsRegistered} />
        ) : null}
      </div>
      <p className="px-3 pb-3 text-[11px] leading-relaxed text-[var(--text-3)]">
        {short
          ? "What the vendor's paperwork declared against what was actually keyed in."
          : "The paperwork and what was keyed in agree."}
      </p>
    </Panel>
  );
}

/**
 * The consignment's variant lines — present when it was booked against a
 * drop allotted by variant. Each line is a ceiling for that variant's chips.
 */
export function BatchLines({ batch }: { batch: SupplyBatch }) {
  const lines = batch.lines ?? [];
  if (lines.length === 0) return null;
  return (
    <Panel>
      <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        Variant lines
      </p>
      <table className="mb-2 w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--text-3)]">
            <th className="px-3 py-1 font-medium">Variant</th>
            <th className="px-3 py-1 text-right font-medium">Declared</th>
            <th className="px-3 py-1 text-right font-medium">Chips</th>
            <th className="px-3 py-1 text-right font-medium">Failed QC</th>
            <th className="px-3 py-1 text-right font-medium">Shortfall</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--hairline)]">
          {lines.map((l) => {
            const shortfall = l.shortfall ?? Math.max(0, l.quantity - l.rowsReceived);
            return (
              <tr key={l.variantId}>
                <td className="px-3 py-1.5 text-[var(--text-1)]">{lineName(l)}</td>
                <td className="tnum px-3 py-1.5 text-right text-[var(--text-2)]">{formatNumber(l.quantity)}</td>
                <td className="tnum px-3 py-1.5 text-right text-[var(--text-2)]">{formatNumber(l.rowsReceived)}</td>
                <td className="tnum px-3 py-1.5 text-right text-[var(--text-2)]">{formatNumber(l.rowsRejected)}</td>
                <td
                  className={`tnum px-3 py-1.5 text-right ${
                    shortfall > 0 ? "text-[var(--warning)]" : "text-[var(--text-3)]"
                  }`}
                >
                  {shortfall > 0 ? formatNumber(shortfall) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] text-[var(--text-3)]">{label}</span>
      {children}
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] transition-colors ${
        active
          ? "bg-[var(--surface-3)] font-medium text-[var(--text-1)]"
          : "text-[var(--text-3)] hover:text-[var(--text-1)]"
      }`}
    >
      {children}
    </button>
  );
}
