"use client";

import * as React from "react";
import { CalendarRange } from "lucide-react";
import type { Period } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { Button, Input, Segmented } from "@/components/ui/primitives";

export interface PeriodState {
  period: Period;
  from?: string;
  to?: string;
}

const PRESETS: { value: Period; label: string }[] = [
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "year", label: "12 months" },
];

/** One row of filters, above the charts. */
export function FilterBar({
  value,
  onChange,
  children,
  rangeLabel,
}: {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
  children?: React.ReactNode;
  rangeLabel?: { from: string; to: string };
}) {
  const [customOpen, setCustomOpen] = React.useState(value.period === "custom");
  const [draft, setDraft] = React.useState({
    from: value.from ?? "",
    to: value.to ?? "",
  });
  const [error, setError] = React.useState<string | null>(null);

  const applyCustom = () => {
    if (!draft.from || !draft.to) {
      setError("Both dates are required.");
      return;
    }
    if (Date.parse(draft.from) >= Date.parse(draft.to)) {
      setError("The start date must come before the end date.");
      return;
    }
    setError(null);
    onChange({ period: "custom", from: draft.from, to: draft.to });
  };

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={value.period === "custom" ? ("custom" as Period) : value.period}
          onChange={(p) => {
            setCustomOpen(false);
            setError(null);
            onChange({ period: p });
          }}
          options={PRESETS}
        />

        <Button
          variant={value.period === "custom" ? "outline" : "ghost"}
          size="sm"
          onClick={() => setCustomOpen((o) => !o)}
          aria-expanded={customOpen}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {value.period === "custom" && value.from && value.to
            ? `${formatDate(value.from)} – ${formatDate(value.to)}`
            : "Custom range"}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      </div>

      {customOpen ? (
        <div className="flex flex-wrap items-end gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] p-3">
          <label className="space-y-1">
            <span className="block text-[11px] text-[var(--text-3)]">From</span>
            <Input
              type="date"
              value={draft.from}
              invalid={!!error}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              className="w-[150px]"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] text-[var(--text-3)]">To</span>
            <Input
              type="date"
              value={draft.to}
              invalid={!!error}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className="w-[150px]"
            />
          </label>
          <Button variant="primary" size="md" onClick={applyCustom}>
            Apply
          </Button>
          <p className="basis-full text-[11px] text-[var(--text-3)]">
            {error ? (
              <span className="text-[var(--danger)]">{error}</span>
            ) : (
              "The range is half-open: on or after the start date, strictly before the end date."
            )}
          </p>
        </div>
      ) : null}

      {rangeLabel ? (
        <p className="text-[11px] text-[var(--text-3)]">
          Showing {formatDate(rangeLabel.from)} → {formatDate(rangeLabel.to)}
        </p>
      ) : null}
    </div>
  );
}
