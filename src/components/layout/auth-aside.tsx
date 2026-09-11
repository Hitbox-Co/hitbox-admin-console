import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WordmarkStacked } from "@/components/brand";

/**
 * The surround for the sign-in and sign-up forms.
 *
 * This and the landing page are the only two surfaces allowed an ambient
 * gradient mesh — a hero treatment, held under 8% opacity, never on a
 * working screen.
 */
export function AuthAside({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="ambient" aria-hidden />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 75%)",
        }}
      />

      <Link
        href="/"
        className="pressable absolute left-5 top-5 z-10 flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to site
      </Link>

      <div className="relative z-10 flex w-full max-w-[380px] flex-col">
        <div className="mb-7 flex flex-col items-center text-center">
          <WordmarkStacked markSize={44} priority />
          <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            {title}
          </h1>
          <p className="mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-[var(--text-3)]">
            {subtitle}
          </p>
        </div>

        <div className="rounded-[16px] border border-[var(--hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-2)]">
          {children}
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--text-3)]">
          Credentials are handled by Clerk and never stored by this console.
          Your HitBox Collectibles record is a local projection of that account.
        </p>
      </div>
    </div>
  );
}
