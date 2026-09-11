import * as React from "react";
import {
  Banknote,
  KeyRound,
  LayoutDashboard,
  Lock,
  Package,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { Mark } from "@/components/brand";

/**
 * A miniature of the real console, assembled from the same tokens the
 * console itself uses rather than a screenshot — so it never goes stale and
 * stays crisp at any density.
 *
 * It deliberately shows the product's signature behaviour: one panel is
 * locked, because the signed-in role would not be cleared to see it.
 */

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: ShoppingCart, label: "Orders" },
  { icon: Banknote, label: "Finance" },
  { icon: Package, label: "Products" },
  { icon: ShieldCheck, label: "Provenance" },
  { icon: KeyRound, label: "Roles" },
];

/** A fixed, hand-picked series so the sparkline reads as real data. */
const SPARK = [14, 19, 16, 24, 21, 29, 26, 33, 30, 38, 35, 44, 41, 52];

function Spark() {
  const max = Math.max(...SPARK);
  const min = Math.min(...SPARK);
  const points = SPARK.map((v, i) => {
    const x = (i / (SPARK.length - 1)) * 100;
    const y = 100 - ((v - min) / (max - min)) * 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-9 w-full"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ConsolePreview() {
  return (
    <div className="relative w-full">
      <div
        aria-hidden
        className="absolute -inset-x-10 -inset-y-12 rounded-[36px]"
        style={{
          background:
            "radial-gradient(55% 55% at 50% 25%, rgba(94,106,210,0.15), transparent 72%)",
        }}
      />

      <div className="relative overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-1)] shadow-[var(--shadow-3)]">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-3 py-2">
          <span className="flex gap-1.5" aria-hidden>
            {["#3a3b42", "#3a3b42", "#3a3b42"].map((c, i) => (
              <span
                key={i}
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: c }}
              />
            ))}
          </span>
          <span className="mx-auto rounded-[4px] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[9px] text-[var(--text-3)]">
            admin.hitbox.com/dashboard
          </span>
        </div>

        <div className="flex">
          {/* Rail */}
          <div className="hidden w-[128px] shrink-0 border-r border-[var(--hairline)] py-2.5 sm:block">
            <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
              <Mark size={13} />
              <span className="text-[9px] font-extrabold uppercase tracking-[-0.01em] text-[var(--text-1)]">
                HitBox
              </span>
            </div>
            <ul className="space-y-[1px] px-1.5">
              {NAV.map((n) => (
                <li
                  key={n.label}
                  className={`flex items-center gap-1.5 rounded-[4px] px-1.5 py-[5px] text-[9.5px] ${
                    n.active
                      ? "bg-[var(--surface-3)] text-[var(--text-1)]"
                      : "text-[var(--text-3)]"
                  }`}
                >
                  <n.icon
                    className={`h-2.5 w-2.5 ${n.active ? "text-[var(--accent-text)]" : ""}`}
                  />
                  {n.label}
                </li>
              ))}
            </ul>
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[var(--text-1)]">
                Dashboard
              </span>
              <span className="rounded-[4px] border border-[var(--hairline)] px-1.5 py-[2px] text-[8px] text-[var(--text-3)]">
                30 days
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-2">
                <p className="text-[8px] text-[var(--text-3)]">Orders</p>
                <p className="tnum mt-0.5 text-[13px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-1)]">
                  18,420
                </p>
                <p className="mt-1 text-[7.5px] text-[var(--positive)]">+8.1%</p>
              </div>
              <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-2">
                <p className="text-[8px] text-[var(--text-3)]">Gross revenue</p>
                <p className="tnum mt-0.5 text-[13px] font-semibold leading-none tracking-[-0.02em] text-[var(--text-1)]">
                  $84.2K
                </p>
                <p className="mt-1 text-[7.5px] text-[var(--text-3)]">+2 currencies</p>
              </div>
              {/* The signature behaviour: withheld, not zeroed. */}
              <div className="flex flex-col justify-center rounded-[8px] border border-dashed border-[var(--hairline-strong)] p-2">
                <Lock className="h-2.5 w-2.5 text-[var(--text-3)]" aria-hidden />
                <p className="mt-1 text-[8px] leading-tight text-[var(--text-3)]">
                  Profit not visible to your role
                </p>
              </div>
            </div>

            <div className="mt-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] p-2">
              <p className="mb-1 text-[8px] text-[var(--text-3)]">Orders placed</p>
              <Spark />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1.5">
                <p className="text-[8px] text-[var(--text-3)]">Refunds to action</p>
                <p className="tnum mt-0.5 text-[11px] font-semibold text-[var(--text-1)]">
                  42
                </p>
              </div>
              <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1.5">
                <p className="text-[8px] text-[var(--text-3)]">Open cases</p>
                <p className="tnum mt-0.5 text-[11px] font-semibold text-[var(--warning)]">
                  12
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
