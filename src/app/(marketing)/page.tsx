import type { Metadata } from "next";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { ArrowRight, LogIn } from "lucide-react";
import { WordmarkStacked } from "@/components/brand";

export const metadata: Metadata = {
  title: { absolute: "HitBox Collectibles — Operations Console" },
  description:
    "Internal operations console for HitBox Collectibles — orders, finance, drops, provenance and access control.",
};

export default function HomePage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
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

      <div className="relative z-10 flex w-full max-w-[380px] flex-col items-center text-center animate-fade-rise">
        <div className="mb-8 flex flex-col items-center">
          <WordmarkStacked markSize={52} priority />
          <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            Operations Console
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-3)] max-w-[300px]">
            Orders, finance, drops, provenance and access control for HitBox operations.
          </p>
        </div>

        <div className="w-full">
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="pressable inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--text-1)] px-5 text-[14px] font-medium text-[var(--ground)] shadow-[var(--shadow-2)] transition-colors hover:bg-white"
            >
              <LogIn className="h-4 w-4" />
              Sign in to the console
            </Link>
          </Show>

          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="pressable inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] px-5 text-[14px] font-medium text-white shadow-[var(--shadow-2)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              Open console
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Show>
        </div>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-[var(--text-3)]">
          HitBox Collectibles Internal System &bull; Restricted Access
        </p>
      </div>
    </div>
  );
}

