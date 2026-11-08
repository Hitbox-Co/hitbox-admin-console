"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCreateRoyaltyRule } from "@/lib/api/hooks";
import { ArtistPicker, DropPicker, OrganizationPicker } from "./entity-pickers";
import { Button, Field, Input, Panel, Segmented } from "@/components/ui/primitives";
import { totalPercentage } from "./rule-helpers";
import type {
  PayoutFrequency,
  RoyaltyBasis,
  RoyaltyRuleInput,
  RoyaltySplit,
} from "@/lib/types";

/**
 * Creating a rule.
 *
 * Three refusals in the create DTO shape this whole form, and each is checked
 * here so the operator finds out before the round trip rather than after:
 *
 *  1. A rule must be scoped to a product, collection, artist or organization.
 *     A rule scoped to nothing would be the platform-wide default, which is a
 *     real thing to want but not one to create by forgetting a field.
 *  2. Either a percentage or at least one split — not neither.
 *  3. Splits totalling more than 100% are refused outright. The cost of that
 *     typo is money paid out that the platform never took in, so it is worth
 *     refusing twice.
 *
 * There is no edit screen anywhere in this module, deliberately: what is
 * entered here is what prices real accruals, and it cannot be quietly fixed
 * later. That is the reason the form is this insistent.
 */

type ScopeKind = "artistId" | "organizationId" | "collectionId" | "productId";

const SCOPE_LABEL: Record<ScopeKind, string> = {
  artistId: "Artist",
  organizationId: "Organization",
  collectionId: "Collection",
  productId: "Drop",
};

const FREQUENCIES: PayoutFrequency[] = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"];

/**
 * The DTO's percentage is a regex AND a refinement: `/^\d{1,3}(\.\d{1,3})?$/`
 * plus `Number(value) <= 100`. The regex alone admits "150" — three digits,
 * well formed — so checking only the shape would send a rule the server
 * refuses with a 422 the form could have caught. Both halves live here.
 */
const PERCENT = /^\d{1,3}(\.\d{1,3})?$/;

function badPercentage(value: string): boolean {
  const v = value.trim();
  if (!PERCENT.test(v)) return true;
  return Number(v) > 100;
}

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export function RoyaltyRuleForm({ onClose }: { onClose: () => void }) {
  const create = useCreateRoyaltyRule();

  const [scopeKind, setScopeKind] = React.useState<ScopeKind>("artistId");
  const [scopeId, setScopeId] = React.useState("");
  const [basis, setBasis] = React.useState<RoyaltyBasis>("NET_PROFIT");
  const [mode, setMode] = React.useState<"single" | "splits">("single");
  const [percentage, setPercentage] = React.useState("");
  const [splits, setSplits] = React.useState<RoyaltySplit[]>([
    { payeeType: "ARTIST", artistId: "", percentage: "" },
  ]);
  const [payoutThreshold, setPayoutThreshold] = React.useState("");
  const [frequency, setFrequency] = React.useState<PayoutFrequency>("MONTHLY");
  const [effectiveFrom, setEffectiveFrom] = React.useState("");

  const splitTotal = totalPercentage(splits);
  const splitsOver = mode === "splits" && splitTotal > 100;

  const percentageInvalid =
    mode === "single" && percentage.trim() !== "" && badPercentage(percentage);
  const thresholdInvalid =
    payoutThreshold.trim() !== "" && !MONEY.test(payoutThreshold.trim());

  /** Every split needs a payee id and a percentage, or the server drops it. */
  const splitsComplete =
    mode !== "splits" ||
    (splits.length > 0 &&
      splits.every(
        (s) =>
          String(s.percentage).trim() !== "" &&
          !badPercentage(String(s.percentage)) &&
          (s.payeeType === "ARTIST"
            ? (s.artistId ?? "").trim() !== ""
            : (s.organizationId ?? "").trim() !== "")
      ));

  const valid =
    scopeId.trim() !== "" &&
    !thresholdInvalid &&
    !splitsOver &&
    splitsComplete &&
    (mode === "single"
      ? percentage.trim() !== "" && !percentageInvalid
      : splits.length > 0);

  const submit = () => {
    if (!valid) return;

    const payload: RoyaltyRuleInput = {
      [scopeKind]: scopeId.trim(),
      basis,
      splitType: mode === "splits" ? "MULTI" : "SINGLE",
      ...(mode === "single"
        ? { percentage: percentage.trim() }
        : {
            splits: splits.map((s) => ({
              payeeType: s.payeeType,
              ...(s.payeeType === "ARTIST"
                ? { artistId: (s.artistId ?? "").trim() }
                : { organizationId: (s.organizationId ?? "").trim() }),
              percentage: String(s.percentage).trim(),
            })),
          }),
      ...(payoutThreshold.trim() ? { payoutThreshold: payoutThreshold.trim() } : {}),
      payoutFrequency: frequency,
      ...(effectiveFrom
        ? { effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`).toISOString() }
        : {}),
    } as RoyaltyRuleInput;

    create.mutate(payload, {
      onSuccess: () => {
        toast.success("Rule created. It prices accruals from its effective date.");
        onClose();
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.friendly : "Could not create the rule."
        ),
    });
  };

  const setSplit = (index: number, patch: Partial<RoyaltySplit>) =>
    setSplits((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[600px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                New royalty rule
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-3)]">
                These terms cannot be edited afterwards — a change means closing
                this rule and creating its successor.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {/* Scope */}
            <section className="space-y-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                What it applies to
              </p>
              <Segmented
                value={scopeKind}
                onChange={(v) => {
                  setScopeKind(v);
                  // An artist's id is not a drop's id — never carry it over.
                  setScopeId("");
                }}
                size="sm"
                options={(Object.keys(SCOPE_LABEL) as ScopeKind[]).map((k) => ({
                  value: k,
                  label: SCOPE_LABEL[k],
                }))}
              />
              <Field
                label={SCOPE_LABEL[scopeKind]}
                htmlFor="rule-scope-id"
                required
                hint={
                  scopeKind === "collectionId"
                    ? "There is no collection directory endpoint yet, so a collection is entered by id."
                    : "A rule must be scoped to something. The API refuses one scoped to nothing at all."
                }
              >
                {scopeKind === "artistId" ? (
                  <ArtistPicker id="rule-scope-id" value={scopeId || undefined} onChange={(v) => setScopeId(v ?? "")} />
                ) : scopeKind === "organizationId" ? (
                  <OrganizationPicker id="rule-scope-id" value={scopeId || undefined} onChange={(v) => setScopeId(v ?? "")} />
                ) : scopeKind === "productId" ? (
                  <DropPicker id="rule-scope-id" value={scopeId || undefined} onChange={(v) => setScopeId(v ?? "")} />
                ) : (
                  <Input
                    id="rule-scope-id"
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                    placeholder="Collection id"
                  />
                )}
              </Field>
            </section>

            {/* Terms */}
            <section className="space-y-2.5 border-t border-[var(--hairline)] pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                Terms
              </p>

              <Field
                label="Basis"
                hint={
                  basis === "NET_PROFIT"
                    ? "The share is taken from gross revenue less the cost of goods."
                    : "The share is taken from gross revenue; the cost of goods is not deducted first."
                }
              >
                <Segmented
                  value={basis}
                  onChange={(v) => setBasis(v)}
                  size="sm"
                  options={[
                    { value: "NET_PROFIT" as RoyaltyBasis, label: "Net profit" },
                    { value: "GROSS_REVENUE" as RoyaltyBasis, label: "Gross revenue" },
                  ]}
                />
              </Field>

              <Field label="Structure">
                <Segmented
                  value={mode}
                  onChange={(v) => setMode(v)}
                  size="sm"
                  options={[
                    { value: "single" as const, label: "One payee" },
                    { value: "splits" as const, label: "Multi-party" },
                  ]}
                />
              </Field>

              {mode === "single" ? (
                <Field
                  label="Percentage"
                  htmlFor="rule-percentage"
                  required
                  error={
                    percentageInvalid
                      ? "Use a number from 0 to 100, like 15 or 12.5."
                      : undefined
                  }
                  hint="15 means 15%."
                >
                  <Input
                    id="rule-percentage"
                    value={percentage}
                    invalid={percentageInvalid}
                    onChange={(e) => setPercentage(e.target.value)}
                    placeholder="15"
                    inputMode="decimal"
                  />
                </Field>
              ) : (
                <SplitEditor
                  splits={splits}
                  total={splitTotal}
                  over={splitsOver}
                  onChange={setSplit}
                  onAdd={() =>
                    setSplits((rows) => [
                      ...rows,
                      { payeeType: "ARTIST", artistId: "", percentage: "" },
                    ])
                  }
                  onRemove={(i) =>
                    setSplits((rows) => rows.filter((_, index) => index !== i))
                  }
                />
              )}
            </section>

            {/* Payout terms */}
            <section className="space-y-2.5 border-t border-[var(--hairline)] pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                Payout terms
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Payout threshold"
                  htmlFor="rule-threshold"
                  error={thresholdInvalid ? "Use an amount like 500.00." : undefined}
                  hint="Left empty, the platform default of 500.00 applies. This is a term the payee negotiated."
                >
                  <Input
                    id="rule-threshold"
                    value={payoutThreshold}
                    invalid={thresholdInvalid}
                    onChange={(e) => setPayoutThreshold(e.target.value)}
                    placeholder="500.00"
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Cadence" htmlFor="rule-frequency">
                  <select
                    id="rule-frequency"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as PayoutFrequency)}
                    className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {f.charAt(0) + f.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label="Effective from"
                htmlFor="rule-from"
                hint="Left empty, the rule takes effect immediately. It never prices an accrual that happened before this date."
              >
                <Input
                  id="rule-from"
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </Field>
            </section>
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              variant="primary"
              size="sm"
              loading={create.isPending}
              disabled={!valid}
              onClick={submit}
            >
              Create rule
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {splitsOver ? (
              <span className="ml-auto text-[11px] text-[var(--danger)]">
                Splits total {splitTotal}%
              </span>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SplitEditor({
  splits,
  total,
  over,
  onChange,
  onAdd,
  onRemove,
}: {
  splits: RoyaltySplit[];
  total: number;
  over: boolean;
  onChange: (index: number, patch: Partial<RoyaltySplit>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--hairline)] px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
          Payees
        </p>
        <p
          className={
            over
              ? "tnum text-[12px] font-medium text-[var(--danger)]"
              : "tnum text-[12px] text-[var(--text-2)]"
          }
        >
          {total}% total
        </p>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        {splits.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="shrink-0">
              <span className="sr-only">Payee type</span>
              <select
                value={s.payeeType}
                onChange={(e) =>
                  onChange(i, {
                    payeeType: e.target.value as RoyaltySplit["payeeType"],
                    artistId: "",
                    organizationId: "",
                  })
                }
                className="h-8 rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
              >
                <option value="ARTIST">Artist</option>
                <option value="ORGANIZATION">Organization</option>
              </select>
            </label>

            {s.payeeType === "ARTIST" ? (
              <ArtistPicker
                aria-label="Artist payee"
                className="min-w-0 flex-1"
                value={s.artistId || undefined}
                onChange={(v) => onChange(i, { artistId: v ?? "" })}
              />
            ) : (
              <OrganizationPicker
                aria-label="Organization payee"
                className="min-w-0 flex-1"
                value={s.organizationId || undefined}
                onChange={(v) => onChange(i, { organizationId: v ?? "" })}
              />
            )}

            <Input
              aria-label="Percentage"
              value={String(s.percentage)}
              onChange={(e) => onChange(i, { percentage: e.target.value })}
              placeholder="10"
              inputMode="decimal"
              className="w-[74px] shrink-0"
            />

            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove payee"
              disabled={splits.length === 1}
              onClick={() => onRemove(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add payee
        </Button>

        {over ? (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--danger)]">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            These shares total more than the revenue they divide. The API refuses
            this, and it is right to — the cost of the typo is money paid out that
            the platform never took in.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
