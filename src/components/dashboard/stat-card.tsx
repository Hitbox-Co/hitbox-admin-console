"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatGrowth } from "@/lib/format";
import { Panel, Tooltip } from "@/components/ui/primitives";
import { Sparkline } from "@/components/charts/charts";

/**
 * A stat tile: the right form for a single headline number, rather than a
 * one-bar bar chart. Value + optional delta + optional sparkline context.
 */
export function StatCard({
  label,
  value,
  growth,
  hint,
  trend,
  trendKey,
  accent,
  className,
}: {
  label: string;
  /** Pre-rendered so money can keep its per-currency treatment. */
  value: React.ReactNode;
  growth?: number | null;
  hint?: React.ReactNode;
  trend?: Record<string, string | number>[];
  trendKey?: string;
  accent?: string;
  className?: string;
}) {
  const showGrowth = growth !== undefined;
  const g = formatGrowth(growth);

  return (
    <Panel className={cn("relative overflow-hidden p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium text-[var(--text-3)]">{label}</p>
        {showGrowth ? <GrowthPill growth={growth} /> : null}
      </div>

      <div className="mt-2 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[var(--text-1)] tnum">
        {value}
      </div>

      {hint ? (
        <p className="mt-1.5 text-[12px] text-[var(--text-3)]">{hint}</p>
      ) : null}

      {trend && trendKey && trend.length > 1 ? (
        <div className="-mx-1 mt-3">
          <Sparkline data={trend} dataKey={trendKey} color={accent} />
        </div>
      ) : null}

      {showGrowth && !g.known ? null : null}
    </Panel>
  );
}

/**
 * `null` growth means there was no previous window to compare against.
 * That is not 0% and must never render as "0%".
 */
export function GrowthPill({ growth }: { growth: number | null | undefined }) {
  const g = formatGrowth(growth);

  if (!g.known) {
    return (
      <Tooltip content="There was no previous period to compare against — this is not 0% growth.">
        <span className="inline-flex cursor-help items-center gap-1 rounded-[6px] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-3)]">
          <Minus className="h-3 w-3" aria-hidden />
          No baseline
        </span>
      </Tooltip>
    );
  }

  const Icon = g.tone === "danger" ? ArrowDownRight : ArrowUpRight;
  const tones = {
    positive: "bg-[var(--positive-dim)] text-[var(--positive)]",
    danger: "bg-[var(--danger-dim)] text-[var(--danger)]",
    neutral: "bg-[rgba(255,255,255,0.06)] text-[var(--text-2)]",
  };

  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium",
        tones[g.tone]
      )}
    >
      {g.tone !== "neutral" ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {g.text}
    </span>
  );
}
