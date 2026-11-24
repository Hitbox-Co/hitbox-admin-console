"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useArchiveMarket, useCreateMarket, useUpdateMarket } from "@/lib/api/hooks";
import { formatNumber } from "@/lib/format";
import { requiredKeys } from "@/lib/required-fields";
import { Badge, Button, Field, Input, Tooltip } from "@/components/ui/primitives";
import type { AdminMarket, MarketCurrency } from "@/lib/types";

/**
 * Required-ness on CREATE, per admin-write-apis.md §1: `code`, `name` and
 * `currency` are the fields the POST body actually needs; `isActive` /
 * `isDefault` default server-side and `countryCodes` may be empty. On EDIT
 * nothing is required — the docs say so explicitly ("all fields optional") —
 * so this schema is deliberately not reused there.
 */
const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().min(1),
  countryCodes: z.string().optional(),
});
const REQUIRED_CREATE = requiredKeys(createSchema);

/**
 * Create / edit a market.
 *
 * Three invariants from admin-write-apis.md §1 are enforced in the UI as well
 * as the server, because each produces a confusing error otherwise:
 *
 *  - `code` is immutable. It is the stable key saved reports reference, so the
 *    field is read-only on edit rather than sent and silently ignored.
 *  - `countryCodes` REPLACES the stored list; it is never merged. The textarea
 *    therefore always shows the full list, and always submits the full list.
 *  - Exactly one market is default at all times. You cannot clear the flag on
 *    the market that has it — you promote a different one, which moves it
 *    atomically — so the toggle is disabled on the current default.
 */

const CURRENCIES: MarketCurrency[] = ["USD", "INR", "GBP"];

export function MarketDrawer({
  market,
  onClose,
}: {
  /** Undefined creates; a market edits it. */
  market?: AdminMarket;
  onClose: () => void;
}) {
  const isEdit = !!market;
  const create = useCreateMarket();
  const update = useUpdateMarket(market?.id ?? "");
  const archive = useArchiveMarket();

  const [code, setCode] = React.useState(market?.code ?? "");
  const [name, setName] = React.useState(market?.name ?? "");
  const [currency, setCurrency] = React.useState<MarketCurrency>(
    (market?.currency as MarketCurrency) ?? "USD"
  );
  const [isActive, setIsActive] = React.useState(market?.isActive ?? true);
  const [isDefault, setIsDefault] = React.useState(market?.isDefault ?? false);
  const [countries, setCountries] = React.useState(
    (market?.countryCodes ?? []).join(", ")
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const busy = create.isPending || update.isPending || archive.isPending;

  const parsedCountries = React.useMemo(
    () =>
      countries
        .split(/[\s,]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean),
    [countries]
  );

  const onApiError = (err: unknown) => {
    if (!(err instanceof ApiError)) {
      toast.error("Could not save the market.");
      return;
    }
    // The server names the offending countries / the blocking price count.
    const details = err.details as
      | { countryCodes?: string[]; productPrices?: number }
      | null;

    if (err.code === "MARKETS_COUNTRY_TAKEN" && details?.countryCodes?.length) {
      setErrors({
        countryCodes: `Already mapped to another market: ${details.countryCodes.join(", ")}`,
      });
    } else if (err.code === "MARKETS_CODE_TAKEN") {
      setErrors({ code: "That code is already in use." });
    } else if (err.code === "MARKETS_IN_USE") {
      toast.error(
        `Still referenced by ${formatNumber(details?.productPrices ?? 0)} product prices — repoint them first.`
      );
      return;
    }
    toast.error(err.friendly);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!isEdit && !/^[A-Za-z0-9]{2,12}$/.test(code.trim())) {
      next.code = "2–12 letters or digits.";
    }
    if (!name.trim()) next.name = "A name is required.";
    const bad = parsedCountries.filter((c) => !/^[A-Z]{2}$/.test(c));
    if (bad.length) next.countryCodes = `Not ISO 3166-1 alpha-2: ${bad.join(", ")}`;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !validate()) return;

    const done = (verb: string) => () => {
      toast.success(`Market ${verb}`);
      onClose();
    };

    if (isEdit) {
      update.mutate(
        {
          name: name.trim(),
          currency,
          isActive,
          // Only ever promote. Demoting the current default is refused with
          // MARKETS_DEFAULT_REQUIRED, so we never send `false` for it.
          ...(isDefault && !market!.isDefault ? { isDefault: true } : {}),
          countryCodes: parsedCountries,
        },
        { onSuccess: done("updated"), onError: onApiError }
      );
    } else {
      create.mutate(
        {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          currency,
          isActive,
          isDefault,
          countryCodes: parsedCountries,
        },
        { onSuccess: done("created"), onError: onApiError }
      );
    }
  };

  const archivable = isEdit && !market!.isDefault && !market!.archivedAt;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="rx-overlay fixed inset-0 z-50 bg-[rgba(0,0,0,0.5)]" />
        <Dialog.Content className="rx-drawer fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[520px] flex-col border-l border-[var(--hairline-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--text-1)]">
                {isEdit ? market!.name : "New market"}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-[var(--text-3)]">
                {isEdit
                  ? "A market is the pricing region a buyer shops in."
                  : "Drops carry one price per market; orders record the market they were placed in."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <Field
                label="Code"
                htmlFor="market-code"
                error={errors.code}
                // Required on create only; disabled (and so unmarked) on edit
                // — code is immutable once a market exists.
                required={REQUIRED_CREATE.has("code") && !isEdit}
                hint={
                  isEdit
                    ? "Immutable — saved reports reference it. Create a new market instead of renaming."
                    : "2–12 characters, upper-cased and unique."
                }
              >
                <Input
                  id="market-code"
                  value={code}
                  disabled={isEdit}
                  invalid={!!errors.code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="AE"
                />
              </Field>

              <Field
                label="Name"
                htmlFor="market-name"
                error={errors.name}
                required={REQUIRED_CREATE.has("name")}
              >
                <Input
                  id="market-name"
                  value={name}
                  invalid={!!errors.name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="United Arab Emirates"
                />
              </Field>

              <Field
                label="Currency"
                htmlFor="market-currency"
                required={REQUIRED_CREATE.has("currency")}
              >
                <select
                  id="market-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as MarketCurrency)}
                  className="h-8 w-full rounded-[6px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text-1)] transition-colors hover:border-[var(--hairline-strong)]"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Country codes"
                htmlFor="market-countries"
                error={errors.countryCodes}
                hint="ISO 3166-1 alpha-2, comma separated. This replaces the whole list — send every country you want mapped."
              >
                <Input
                  id="market-countries"
                  value={countries}
                  invalid={!!errors.countryCodes}
                  onChange={(e) => setCountries(e.target.value)}
                  placeholder="AE, OM"
                />
              </Field>

              <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-2)]">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                />
                Active
              </label>

              <Tooltip
                content={
                  market?.isDefault
                    ? "This is already the default. Promote another market to move it — the flag cannot simply be cleared."
                    : "Promoting demotes the current default in the same transaction."
                }
              >
                <label className="flex w-fit items-center gap-2 text-[12.5px] text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    disabled={market?.isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  Default market
                </label>
              </Tooltip>

              {isEdit ? (
                <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-3)]">
                  In use by{" "}
                  <span className="text-[var(--text-1)]">
                    {formatNumber(market!.usage.productPrices)}
                  </span>{" "}
                  product prices and{" "}
                  <span className="text-[var(--text-1)]">
                    {formatNumber(market!.usage.orders)}
                  </span>{" "}
                  orders.
                  {market!.usage.productPrices > 0 ? (
                    <span className="mt-1 flex items-start gap-1.5 text-[var(--warning)]">
                      <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                      Archiving is refused while product prices reference it.
                    </span>
                  ) : null}
                  {market!.archivedAt ? (
                    <Badge tone="neutral" className="mt-1.5">
                      Archived
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--hairline)] px-4 py-3">
              <Button type="submit" variant="primary" size="sm" loading={busy}>
                {isEdit ? "Save changes" : "Create market"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>

              {archivable ? (
                <Tooltip content="Soft archive. The row survives because orders must always be able to name their market.">
                  <span className="ml-auto">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      loading={archive.isPending}
                      onClick={() =>
                        archive.mutate(market!.id, {
                          onSuccess: () => {
                            toast.success("Market archived");
                            onClose();
                          },
                          onError: onApiError,
                        })
                      }
                    >
                      Archive
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
