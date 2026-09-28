"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Cpu,
  Info,
  Lock,
  ScanLine,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api/client";
import {
  useRegisterTagManifest,
  useSupplyBatchDecision,
} from "@/lib/api/hooks";
import { formatDate, formatDateTime, formatNumber, humanize } from "@/lib/format";
import { usePermissions } from "@/components/layout/authz-provider";
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
  SUPPLY_MANIFEST_MAX,
  type SupplyBatch,
  type SupplyBatchStatus,
  type TagManifestResult,
} from "@/lib/types";

/**
 *   UPLOADED ──▶ VALIDATED ──▶ ACCEPTED
 *      │              │
 *      └──────────────┴──────▶ REJECTED
 *
 * ACCEPTED and REJECTED are terminal. A consignment accepted in error is not
 * walked backwards — the stock is physically in the building by then, and
 * pretending otherwise loses the record that it ever arrived. The correction
 * is a second consignment with a note, which keeps both facts.
 *
 * VALIDATED may be skipped: a small consignment keyed in by hand is checked by
 * the person keying it.
 */
const NEXT_STATES: Record<SupplyBatchStatus, SupplyBatchStatus[]> = {
  UPLOADED: ["VALIDATED", "ACCEPTED", "REJECTED"],
  VALIDATED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
};

/** Chips may only be registered while the consignment still accepts rows. */
const ACCEPTS_ROWS: SupplyBatchStatus[] = ["UPLOADED", "VALIDATED"];

export function ConsignmentDrawer({
  batch,
  onClose,
}: {
  batch: SupplyBatch;
  onClose: () => void;
}) {
  const perms = usePermissions();
  const decide = useSupplyBatchDecision(batch.id);

  const canWrite = perms.can("nfc-tag-claim", "manage", "global");
  const canReadChips = perms.canRead("nfc-tag-claim");

  const [target, setTarget] = React.useState<SupplyBatchStatus | null>(null);
  const [note, setNote] = React.useState("");
  const [tab, setTab] = React.useState<"detail" | "manifest">("detail");

  const transitions = NEXT_STATES[batch.status] ?? [];
  const acceptsRows = ACCEPTS_ROWS.includes(batch.status);

  const submitDecision = () => {
    if (!target) return;
    // The API requires a note to reject; refusing a consignment becomes a
    // credit note and a conversation with the vendor, and "why" is the only
    // part that cannot be reconstructed afterwards.
    if (target === "REJECTED" && !note.trim()) return;

    decide.mutate(
      { status: target, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Consignment ${humanize(target).toLowerCase()}`);
          setTarget(null);
          setNote("");
        },
        onError: (err: unknown) =>
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not record the decision."
          ),
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[640px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
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
              <ManifestForm batch={batch} disabled={!acceptsRows} />
            ) : (
              <>
                <Reconciliation batch={batch} canReadChips={canReadChips} />

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
            <div className="space-y-3 border-t border-[var(--hairline)] px-4 py-3">
              {!canWrite ? (
                <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                  <Lock className="h-3 w-3" aria-hidden />
                  Deciding a consignment needs nfc-tag-claim:manage at global scope
                </p>
              ) : transitions.length === 0 ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
                  <Lock className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                  {humanize(batch.status)} is terminal. The stock is in the
                  building; a correction is a second consignment with a note,
                  which keeps both facts on the record.
                </p>
              ) : target ? (
                <>
                  <Field
                    label={target === "REJECTED" ? "Why it was refused" : "Note"}
                    htmlFor="decision-note"
                    hint={
                      target === "REJECTED"
                        ? "Required. A refusal becomes a credit note and a conversation with the vendor — this is the part that cannot be reconstructed later."
                        : "Optional. Appended to the notes, never overwriting them."
                    }
                  >
                    <Textarea
                      id="decision-note"
                      rows={3}
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

                  {target === "ACCEPTED" && batch.reconciliation.shortfall > 0 ? (
                    <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
                      <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                      {formatNumber(batch.reconciliation.shortfall)} short against
                      the paperwork. Accepting is terminal — the gap stays on the
                      record exactly as it is now.
                    </p>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <Button
                      variant={target === "REJECTED" ? "danger" : "primary"}
                      size="sm"
                      loading={decide.isPending}
                      disabled={target === "REJECTED" && !note.trim()}
                      onClick={submitDecision}
                    >
                      Confirm {humanize(target).toLowerCase()}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {transitions.map((t) => (
                      <Button
                        key={t}
                        variant={
                          t === "REJECTED"
                            ? "danger"
                            : t === "ACCEPTED"
                              ? "primary"
                              : "secondary"
                        }
                        size="sm"
                        onClick={() => {
                          setTarget(t);
                          setNote("");
                        }}
                      >
                        {t === "ACCEPTED" ? <Check className="h-3.5 w-3.5" /> : null}
                        {t === "REJECTED" ? <X className="h-3.5 w-3.5" /> : null}
                        {humanize(t)}
                      </Button>
                    ))}
                  </div>
                  {acceptsRows ? (
                    <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
                      Register the chips first. Rows go in with the reviewer
                      watching, so the decision is taken with them in front of
                      you — appending to an accepted consignment would silently
                      change counts somebody has signed off.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* The chip manifest                                                    */
/* ------------------------------------------------------------------ */

/**
 * Paste the vendor's UIDs, preview, then commit.
 *
 * Nothing parses XLSX server-side, so converting the vendor's file is this
 * console's job — which here means a paste box that accepts one UID per line
 * and tolerates the separator styles vendors actually ship.
 */
function ManifestForm({
  batch,
  disabled,
}: {
  batch: SupplyBatch;
  disabled: boolean;
}) {
  const register = useRegisterTagManifest(batch.id);
  const [raw, setRaw] = React.useState("");
  const [preview, setPreview] = React.useState<TagManifestResult | null>(null);

  /*
   * One UID per line, blanks dropped. Separator style is left alone: the API
   * normalises 04:A3:…, 04-a3-… and 04a39b… to the same UID, and stripping
   * them here would only add a second place that has to agree about it.
   */
  const uids = React.useMemo(
    () =>
      raw
        .split(/[\r\n,;]+/)
        .map((line) => line.trim())
        .filter(Boolean),
    [raw]
  );

  const overCap = uids.length > SUPPLY_MANIFEST_MAX;
  const remaining = batch.quantity - batch.rowsReceived;
  const overDeclared = uids.length > remaining;

  const run = (dryRun: boolean) => {
    if (uids.length === 0 || overCap) return;
    register.mutate(
      { dryRun, tags: uids.map((uid) => ({ uid })) },
      {
        onSuccess: (result) => {
          setPreview(result);
          if (!result.dryRun) {
            toast.success(`${formatNumber(result.registered)} chips registered`);
            setRaw("");
          }
        },
        onError: (err: unknown) => {
          setPreview(null);
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not register the manifest."
          );
        },
      }
    );
  };

  if (disabled) {
    return (
      <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]">
        <Lock className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
        This consignment has been decided, and a decided consignment takes no
        more rows. Appending would change counts somebody has already signed
        off.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]">
        <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          One UID per line. Colons, dashes and bare hex are all accepted — they
          normalise to the same chip, so the same consignment keyed from two
          differently-formatted vendor files cannot become two rows.
        </span>
      </p>

      <Field
        label="Chip UIDs"
        htmlFor="manifest"
        hint={`${formatNumber(uids.length)} read · ${formatNumber(
          remaining
        )} still declared on this consignment · at most ${formatNumber(
          SUPPLY_MANIFEST_MAX
        )} per call`}
      >
        <Textarea
          id="manifest"
          rows={10}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"04:A3:9B:2C:5D:6E:80\n04A39B2C5D6E81\n04-a3-9b-2c-5d-6e-82"}
          className="font-mono text-[12px]"
        />
      </Field>

      {overCap ? (
        <p className="flex items-start gap-2 rounded-[8px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
          {formatNumber(uids.length)} rows — the cap is{" "}
          {formatNumber(SUPPLY_MANIFEST_MAX)}, matched to a physical carton and
          registered in one transaction. Split the reel across several calls.
        </p>
      ) : overDeclared ? (
        <p className="flex items-start gap-2 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--warning-dim)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--warning)]">
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
          More rows than the consignment still declares. The declared quantity
          is a ceiling, so this is refused with
          SUPPLY_BATCH_QUANTITY_EXCEEDED — dry run first.
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={register.isPending}
          disabled={uids.length === 0 || overCap}
          onClick={() => run(true)}
        >
          Dry run
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={register.isPending}
          disabled={uids.length === 0 || overCap}
          onClick={() => run(false)}
        >
          <Cpu className="h-3.5 w-3.5" />
          Register {formatNumber(uids.length)}
        </Button>
      </div>

      {preview ? <ManifestResult result={preview} /> : null}
    </div>
  );
}

function ManifestResult({ result }: { result: TagManifestResult }) {
  return (
    <Panel>
      <p className="flex items-center gap-2 px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
        {result.dryRun ? "Dry run — nothing written" : "Registered"}
        {result.dryRun ? <Badge tone="neutral">Preview</Badge> : null}
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 pb-3 sm:grid-cols-4">
        <Figure label="Rows" value={result.registered} />
        <Figure label="Received" value={result.batch.rowsReceived} />
        <Figure label="Accepted" value={result.batch.rowsAccepted} />
        <Figure label="Rejected" value={result.batch.rowsRejected} />
      </div>

      {result.duplicates.length > 0 ? (
        <div className="border-t border-[var(--hairline)] px-3 py-2.5">
          <p className="text-[11px] font-medium text-[var(--danger)]">
            {result.duplicates.length} duplicate
            {result.duplicates.length === 1 ? "" : "s"} — the whole manifest is
            refused
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-3)]">
            Two rows claiming the same chip is precisely what a counterfeit
            produces, so a carton containing one duplicate is a carton nobody
            should accept the rest of without looking at it. Rows are named by
            position, never by UID.
          </p>
          <ul className="mt-2 space-y-1">
            {result.duplicates.map((d) => (
              <li key={d.row} className="text-[12px] text-[var(--text-2)]">
                <Mono className="text-[11px]">Row {d.row}</Mono> — {d.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function Reconciliation({
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

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning";
}) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-3)]">{label}</p>
      <p
        className={`tnum mt-0.5 text-[16px] font-medium ${
          tone === "warning" ? "text-[var(--warning)]" : "text-[var(--text-1)]"
        }`}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] text-[var(--text-3)]">{label}</span>
      {children}
    </div>
  );
}

function TabButton({
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
