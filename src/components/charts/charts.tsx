"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";
import { formatCompact, formatNumber, formatShortDay } from "@/lib/format";
import { CHART_INK, SERIES, sequentialStep } from "./palette";

/* ------------------------------------------------------------------ */
/* Tooltip shell                                                       */
/* ------------------------------------------------------------------ */

function TooltipShell({
  label,
  rows,
}: {
  label: React.ReactNode;
  rows: { color?: string; name: string; value: string }[];
}) {
  return (
    <div className="rounded-[6px] border border-[var(--hairline-strong)] bg-[var(--surface-3)] px-2.5 py-2 shadow-[var(--shadow-2)]">
      <p className="mb-1 text-[11px] text-[var(--text-3)]">{label}</p>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-2)]">
            {r.color ? (
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: r.color }}
                aria-hidden
              />
            ) : null}
            {r.name}
          </span>
          {/* Values wear text tokens, never the series color. */}
          <span className="tnum text-[12px] font-medium text-[var(--text-1)]">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trend — single series, so no legend: the panel title names it       */
/* ------------------------------------------------------------------ */

export function TrendChart({
  data,
  dataKey,
  label,
  height = 180,
  color = SERIES[0],
  formatValue = formatNumber,
}: {
  data: { date: string; [k: string]: string | number }[];
  dataKey: string;
  label: string;
  height?: number;
  color?: string;
  formatValue?: (n: number) => string;
}) {
  const gradientId = React.useId();

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke={CHART_INK.grid}
            strokeDasharray="0"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDay}
            tick={{ fill: CHART_INK.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={{ fill: CHART_INK.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => formatCompact(Number(v))}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.16)", strokeWidth: 1 }}
            content={({ active, payload, label: l }) => {
              if (!active || !payload?.length) return null;
              return (
                <TooltipShell
                  label={formatShortDay(String(l))}
                  rows={[
                    {
                      color,
                      name: label,
                      value: formatValue(Number(payload[0].value)),
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            // >= 8px hit target on hover, hidden until then
            activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ranked bars — magnitude, so one hue stepped light -> dark           */
/* ------------------------------------------------------------------ */

export function RankedBarChart({
  data,
  height = 200,
  valueLabel,
  formatValue = formatNumber,
}: {
  data: { name: string; value: number }[];
  height?: number;
  valueLabel: string;
  formatValue?: (n: number) => string;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 2, right: 12, bottom: 2, left: 0 }}
          barCategoryGap={6}
        >
          <CartesianGrid stroke={CHART_INK.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: CHART_INK.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCompact(Number(v))}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: CHART_INK.text, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={96}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <TooltipShell
                  label={String(label)}
                  rows={[
                    { name: valueLabel, value: formatValue(Number(payload[0].value)) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {sorted.map((_, i) => (
              <Cell key={i} fill={sequentialStep(i, sorted.length)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline bar — part-to-whole with direct labels, not a 7-hue pie    */
/* ------------------------------------------------------------------ */

export interface PipelineSegment {
  label: string;
  value: number;
  color: string;
}

export function PipelineBar({
  segments,
  total,
  className,
}: {
  segments: PipelineSegment[];
  total?: number;
  className?: string;
}) {
  const sum = total ?? segments.reduce((a, s) => a + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);

  if (sum === 0) {
    return (
      <p className={cn("text-[12px] text-[var(--text-3)]", className)}>
        Nothing in this window.
      </p>
    );
  }

  return (
    <div className={className}>
      {/* 2px surface gaps between segments keep adjacent fills separable */}
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
        {visible.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${formatNumber(s.value)}`}
            style={{
              width: `${Math.max((s.value / sum) * 100, 0.8)}%`,
              background: s.color,
            }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>

      {/* Identity is never colour-alone: every segment is directly labelled */}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: s.color }}
                aria-hidden
              />
              <span className="truncate text-[12px] text-[var(--text-2)]">
                {s.label}
              </span>
            </span>
            <span className="tnum shrink-0 text-[12px] font-medium text-[var(--text-1)]">
              {formatNumber(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Meter — a single ratio against a limit                              */
/* ------------------------------------------------------------------ */

export function Meter({
  value,
  max,
  label,
  hint,
  color = SERIES[0],
}: {
  value: number;
  max: number;
  label: string;
  hint?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-[var(--text-2)]">{label}</span>
        <span className="tnum text-[12px] font-medium text-[var(--text-1)]">
          {formatNumber(value)}
          <span className="ml-1 text-[var(--text-3)]">/ {formatNumber(max)}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] text-[var(--text-3)]">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline — context inside a stat tile, no axes                     */
/* ------------------------------------------------------------------ */

export function Sparkline({
  data,
  dataKey,
  color = SERIES[0],
  height = 34,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  color?: string;
  height?: number;
}) {
  const gradientId = React.useId();
  if (data.length === 0) return null;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
