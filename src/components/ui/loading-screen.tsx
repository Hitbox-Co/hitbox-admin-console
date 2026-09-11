"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Mark } from "@/components/brand";

/**
 * Full-surface loading screen.
 *
 * Stands in for `@skiper-ui/skiper10`, which lives behind a Pro licence —
 * `pnpm dlx shadcn add @skiper-ui/skiper10` answers 401 without a key. Once
 * `SKIPER_UI_LICENSE_KEY` is set in `.env.local`, run that command and swap
 * the body of this component for theirs; every caller imports
 * `<LoadingScreen />` from here, so nothing else has to change.
 *
 * The motion is deliberately slow and low-contrast: a loading screen that
 * flickers reads as a fault, and an operator sees this several times a day.
 */
export function LoadingScreen({
  label = "Loading",
  hint,
  className,
  inline,
}: {
  label?: string;
  hint?: string;
  className?: string;
  /** Fill the parent rather than the viewport. */
  inline?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative flex flex-col items-center justify-center gap-5 overflow-hidden bg-[var(--ground)]",
        inline ? "h-full w-full" : "h-dvh w-full",
        className
      )}
    >
      <div className="ambient" aria-hidden />

      <div className="relative flex items-center justify-center">
        {/* Two rings, counter-rotating slowly. No spinner whine. */}
        <span
          aria-hidden
          className="absolute h-[76px] w-[76px] rounded-full border border-[var(--hairline-strong)] border-t-[var(--accent)] motion-safe:animate-[spin_2.4s_linear_infinite]"
        />
        <span
          aria-hidden
          className="absolute h-[58px] w-[58px] rounded-full border border-[var(--hairline)] border-b-[var(--accent-text)] motion-safe:animate-[spin_3.2s_linear_infinite_reverse]"
        />
        <span className="relative flex h-10 w-10 items-center justify-center motion-safe:animate-[mark-pulse_2.4s_var(--ease-in-out)_infinite]">
          <Mark size={28} priority />
        </span>
      </div>

      <div className="relative text-center">
        <p className="text-[13px] font-medium tracking-[-0.01em] text-[var(--text-2)]">
          {label}
        </p>
        {hint ? (
          <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-[var(--text-3)]">
            {hint}
          </p>
        ) : null}
      </div>

      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * The bootstrap screen shown while the caller's permissions are resolving.
 *
 * Nothing in the console can render before `/authz/me` answers — the
 * navigation itself is derived from it — so this is the one place a
 * full-screen wait is honest rather than lazy.
 */
export function AuthzBootstrapScreen() {
  return (
    <LoadingScreen
      label="Resolving your permissions"
      hint="The console is assembled from what your role actually covers."
    />
  );
}
