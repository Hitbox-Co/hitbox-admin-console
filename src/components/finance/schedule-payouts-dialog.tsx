"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Eye, Play, SkipForward, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useSchedulePayouts } from "@/lib/api/hooks";
import { formatCurrency, formatNumber, humanize, shortId } from "@/lib/format";
import {
  Badge,
  Button,
  Field,
  Input,
  Mono,
  Panel,
} from "@/components/ui/primitives";
import { FINANCE_CURRENCIES, type FinanceCurrency, type SchedulePayoutsResult } from "@/lib/types";

/**
 * The threshold sweep, with the dry run made unavoidable.
 *
 * `POST /admin/finance/payouts/schedule` with no body batches EVERY payee at
 * their own rule's threshold. That is the intended behaviour and it is also
 * the kind of button that should never be a single click, so this dialog
 * previews first: the same call with `dryRun: true` computes the batches and
 * writes nothing, and the commit button only appears once the operator has
 * seen what it would do.
 *
 * `skipped` is rendered as prominently as `scheduled`. "Nothing was paid" and
 * "seven payees were skipped, each for a stated reason" are very different
 * facts, and the second one is the one that gets asked about.
 */
export function SchedulePayoutsDialog({ onClose }: { onClose: () => void }) {
  const schedule = useSchedulePayouts();

  const [artistId, setArtistId] = React.useState("");
  const [organizationId, setOrganizationId] = React.useState("");
  const [currency, setCurrency] = React.useState<FinanceCurrency | "">("");
  const [thresholdOverride, setThresholdOverride] = React.useState("");
  /**
   * The preview, and the filters it was computed for.
   *
   * Kept together in one state value rather than invalidated by an effect:
   * an effect that nulls the preview whenever the filters change runs a
   * render LATE, which leaves one frame where a stale batch is on screen
   * above a live "Schedule 7 batches" button. Comparing the two here means
   * the preview is either current or not shown, with no window in between.
   */
  const [preview, setPreview] = React.useState<{
    result: SchedulePayoutsResult;
    forFilters: string;
  } | null>(null);

  const payload = React.useMemo(
    () => ({
      artistId: artistId.trim() || undefined,
      organizationId: organizationId.trim() || undefined,
      currency: currency || undefined,
      thresholdOverride: thresholdOverride.trim() || undefined,
    }),
    [artistId, organizationId, currency, thresholdOverride]
  );

  const filterKey = JSON.stringify(payload);
  const current = preview?.forFilters === filterKey ? preview.result : null;

  const thresholdInvalid =
    thresholdOverride.trim() !== "" && !/^\d{1,10}(\.\d{1,2})?$/.test(thresholdOverride.trim());

  const run = (dryRun: boolean) => {
    if (thresholdInvalid) return;
    schedule.mutate(
      { ...payload, dryRun },
      {
        onSuccess: (result) => {
          if (dryRun) {
            setPreview({ result, forFilters: filterKey });
            return;
          }
          toast.success(
            result.scheduled.length
              ? `Scheduled ${result.scheduled.length} ${result.scheduled.length === 1 ? "batch" : "batches"}.`
              : "Nothing was eligible — no batch was created."
          );
          onClose();
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.friendly : "Could not run the sweep."
          ),
      }
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-content fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                Run a payout sweep
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-3)]">
                Batches every payee whose accrued balance has reached their own
                threshold. Leave the filters empty to sweep everyone.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Artist id" htmlFor="sweep-artist" hint="Optional.">
                <Input
                  id="sweep-artist"
                  value={artistId}
                  onChange={(e) => setArtistId(e.target.value)}
                  placeholder="uuid"
                />
              </Field>
              <Field label="Organization id" htmlFor="sweep-org" hint="Optional.">
                <Input
                  id="sweep-org"
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  placeholder="uuid"
                />
              </Field>
              <Field label="Currency" htmlFor="sweep-currency" hint="Optional.">
                <select
                  id="sweep-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as FinanceCurrency | "")}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                >
                  <option value="">Every currency</option>
                  {FINANCE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Threshold override"
                htmlFor="sweep-threshold"
                error={thresholdInvalid ? "Use an amount like 100.00." : undefined}
                hint="Pays a balance that has not reached its bar. Never a default — leave empty to honour each payee's negotiated threshold."
              >
                <Input
                  id="sweep-threshold"
                  value={thresholdOverride}
                  invalid={thresholdInvalid}
                  onChange={(e) => setThresholdOverride(e.target.value)}
                  placeholder="100.00"
                  inputMode="decimal"
                />
              </Field>
            </div>

            {current ? <Preview result={current} /> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              loading={schedule.isPending && !current}
              disabled={thresholdInvalid}
              onClick={() => run(true)}
            >
              <Eye className="h-3.5 w-3.5" />
              {current ? "Preview again" : "Preview"}
            </Button>

            {current ? (
              <Button
                variant="primary"
                size="sm"
                loading={schedule.isPending}
                disabled={!current.scheduled.length}
                onClick={() => run(false)}
              >
                <Play className="h-3.5 w-3.5" />
                Schedule {current.scheduled.length}{" "}
                {current.scheduled.length === 1 ? "batch" : "batches"}
              </Button>
            ) : (
              <p className="text-[11px] text-[var(--text-3)]">
                Preview first — the dry run writes nothing.
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Preview({ result }: { result: SchedulePayoutsResult }) {
  const total = result.scheduled.length + result.skipped.length;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
        <Badge tone={result.scheduled.length ? "positive" : "neutral"} dot>
          {result.scheduled.length} to schedule
        </Badge>
        {result.skipped.length ? (
          <Badge tone="warning" dot>
            {result.skipped.length} skipped
          </Badge>
        ) : null}
        <span className="ml-auto text-[11px] text-[var(--text-3)]">
          {total === 0 ? "No payee had a positive balance" : "Dry run — nothing written"}
        </span>
      </div>

      {result.scheduled.length ? (
        <ul className="divide-y divide-[var(--hairline)]">
          {result.scheduled.map((p, i) => (
            <li
              key={`${p.id}-${i}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[12.5px] text-[var(--text-1)]">
                  {p.payee.name ?? humanize(p.payee.type)}
                </p>
                <p className="text-[11px] text-[var(--text-3)]">
                  {formatNumber(p.entryCount)}{" "}
                  {p.entryCount === 1 ? "entry" : "entries"}
                </p>
              </div>
              <span className="tnum shrink-0 text-[12.5px] font-medium text-[var(--text-1)]">
                {formatCurrency(p.amount, p.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {result.skipped.length ? (
        <div className="border-t border-[var(--hairline)]">
          <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
            <SkipForward className="h-3 w-3" aria-hidden />
            Skipped
          </p>
          <ul className="divide-y divide-[var(--hairline)]">
            {result.skipped.map((s, i) => (
              <li key={`${s.payeeId}-${i}`} className="px-3 py-2">
                <Mono className="text-[10px]" title={s.payeeId}>
                  {shortId(s.payeeId)}
                </Mono>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-2)]">
                  {s.reason}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
