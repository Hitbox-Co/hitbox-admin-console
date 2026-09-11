"use client";

import * as React from "react";
import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { WordmarkInline } from "@/components/brand";

const LINKS = [
  { href: "#modules", label: "Modules" },
  { href: "#access", label: "Access model" },
  { href: "#platform", label: "Platform" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-200",
        scrolled
          ? "border-b border-[var(--hairline)] bg-[rgba(8,9,10,0.78)] backdrop-blur-xl"
          : "border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-[60px] w-full max-w-[1160px] items-center gap-6 px-5">
        <Link href="/" className="pressable rounded-[6px]" aria-label="HitBox Collectibles">
          <WordmarkInline priority />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-[6px] px-2.5 py-1.5 text-[13px] text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="hidden rounded-[6px] px-2.5 py-1.5 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text-1)] sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="pressable inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--text-1)] px-3 text-[13px] font-medium text-[var(--ground)] transition-colors hover:bg-white"
            >
              Request access
            </Link>
          </Show>

          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="pressable inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[var(--text-1)] px-3 text-[13px] font-medium text-[var(--ground)] transition-colors hover:bg-white"
            >
              Open console
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Show>

          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="pressable rounded-[6px] p-1.5 text-[var(--text-2)] md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          aria-label="Sections"
          className="border-t border-[var(--hairline)] bg-[var(--surface-1)] px-5 py-3 md:hidden"
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-[6px] px-2 py-2 text-[14px] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
            >
              {l.label}
            </a>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
