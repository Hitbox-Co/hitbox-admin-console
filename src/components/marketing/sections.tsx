import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BadgeCheck,
  CircleCheck,
  Fingerprint,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Package,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Mark, WordmarkInline } from "@/components/brand";
import { ConsolePreview } from "./console-preview";
import { HeroAurora } from "./aurora";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-[1160px] px-5", className)}>
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-3)]">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

export function Hero() {
  return (
    <div className="relative overflow-hidden">
      <HeroAurora />

      <Section className="relative pb-40 pt-[128px] sm:pb-52 sm:pt-[144px]">
        <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <Eyebrow>
              <Terminal className="h-3 w-3" aria-hidden />
              Internal operations console
            </Eyebrow>

            <h1 className="max-w-[14ch] text-[38px] font-semibold leading-[1.06] tracking-[-0.035em] text-[var(--text-1)] sm:text-[50px]">
              Run the whole platform from one console.
            </h1>

            <p className="mt-5 max-w-[46ch] text-[15px] leading-[1.65] text-[var(--text-2)]">
              Orders, revenue, drops, provenance, media and access control for
              HitBox Collectibles — in a single surface that shows each operator
              exactly what their role covers, and nothing else.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <Link
                href="/sign-in"
                className="pressable inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--text-1)] px-4 text-[14px] font-medium text-[var(--ground)] transition-colors hover:bg-white"
              >
                Sign in to the console
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/sign-up"
                className="pressable inline-flex h-10 items-center gap-2 rounded-[8px] border border-[var(--hairline-strong)] px-4 text-[14px] text-[var(--text-1)] transition-colors hover:bg-[var(--surface-1)]"
              >
                Request access
              </Link>
            </div>

          </div>

          <ConsolePreview />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modules                                                             */
/* ------------------------------------------------------------------ */

const MODULES = [
  {
    icon: ShoppingCart,
    title: "Orders & refunds",
    body: "The full pipeline from pending payment to delivered, the refund queue, and the secondary market.",
    perm: "order:read",
  },
  {
    icon: Banknote,
    title: "Finance",
    body: "Gross, collected, refunded, cost of goods, gateway fees, royalties and margin — held per currency.",
    perm: "payment-royalty:read",
  },
  {
    icon: Package,
    title: "Drops & supply",
    body: "Every product across nine lifecycle states, live inventory, vendor purchase orders and demand signals.",
    perm: "drop:read",
  },
  {
    icon: BadgeCheck,
    title: "Release approvals",
    body: "The compliance queue — age restriction and odds disclosure surfaced on the row you sign off.",
    perm: "release-approval:read",
  },
  {
    icon: ShieldCheck,
    title: "Provenance",
    body: "Tag claims, clone and tamper cases, and the lifecycle state of every collectible instance.",
    perm: "nfc-tag-claim:read",
  },
  {
    icon: ImageIcon,
    title: "Media",
    body: "The asset registry, with scan gating — nothing is servable until the scanner marks it clean.",
    perm: "assets-documents-upload",
  },
  {
    icon: KeyRound,
    title: "Access control",
    body: "One role editor and one assignment screen, built from the permission catalogue the backend publishes.",
    perm: "employee-role-mgmt:read",
  },
  {
    icon: ScrollText,
    title: "Audit log",
    body: "Who did what, stamped with the role they held at the time — not the roles they hold now.",
    perm: "audit-log:read",
  },
];

export function Modules() {
  return (
    <Section id="modules" className="py-20 sm:py-24">
      <div className="max-w-[52ch]">
        <Eyebrow>What you operate</Eyebrow>
        <h2 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--text-1)] sm:text-[34px]">
          Eight modules, one permission model.
        </h2>
        <p className="mt-4 text-[15px] leading-[1.65] text-[var(--text-2)]">
          Every module appears only for the operators whose role covers it. The
          grant that unlocks each one is written on the card.
        </p>
      </div>

      <div className="mt-11 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map((m) => (
          <article
            key={m.title}
            className="group rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-1)] p-5 transition-colors duration-200 hover:border-[var(--hairline-strong)]"
          >
            <m.icon
              className="h-[17px] w-[17px] text-[var(--accent-text)] transition-transform duration-300 group-hover:-translate-y-0.5"
              aria-hidden
            />
            <h3 className="mt-4 text-[14px] font-semibold tracking-[-0.015em] text-[var(--text-1)]">
              {m.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--text-2)]">
              {m.body}
            </p>
            <code className="mt-4 inline-block rounded-[4px] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent-text)]">
              {m.perm}
            </code>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Access model                                                        */
/* ------------------------------------------------------------------ */

export function AccessModel() {
  return (
    <Section id="access" className="py-20 sm:py-24">
      <div className="overflow-hidden rounded-[18px] border border-[var(--hairline)] bg-[var(--surface-1)]">
        <div className="grid lg:grid-cols-[1fr_0.8fr]">
          <div className="p-8 sm:p-11">
            <Eyebrow>Access model</Eyebrow>
            <h2 className="max-w-[22ch] text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--text-1)] sm:text-[31px]">
              There are no per-role screens.
            </h2>
            <p className="mt-5 max-w-[50ch] text-[15px] leading-[1.7] text-[var(--text-2)]">
              Every operator opens the same console and the platform decides
              what comes back. An order manager sees the refund queue without
              ever seeing the refunded amount; a brand admin sees their own
              royalties but never platform margin.
            </p>
            <p className="mt-4 max-w-[50ch] text-[15px] leading-[1.7] text-[var(--text-2)]">
              A section you are not cleared for is{" "}
              <span className="text-[var(--text-1)]">absent</span> from the
              response — never zeroed — and the console says so out loud rather
              than showing you a convincing nought.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {[
                "HitBox staff",
                "Brand partners",
                "Artists",
                "Support",
                "Compliance",
                "Finance",
              ].map((t) => (
                <span
                  key={t}
                  className="rounded-[6px] border border-[var(--hairline)] px-2.5 py-1 text-[12px] text-[var(--text-2)]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* What one narrow role can and cannot reach */}
          <div className="border-t border-[var(--hairline)] bg-[var(--surface-2)] p-8 sm:p-10 lg:border-l lg:border-t-0">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-3)]">
              An artist role sees
            </p>
            <ul className="space-y-2">
              {[
                ["Their drops", true],
                ["Their collectibles", true],
                ["Their artist record", true],
                ["Their media", true],
                ["Platform revenue", false],
                ["Other brands' orders", false],
                ["Buyer profiles", false],
              ].map(([label, allowed]) => (
                <li
                  key={label as string}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[8px] border px-3 py-2 text-[13px]",
                    allowed
                      ? "border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--text-1)]"
                      : "border-dashed border-[var(--hairline-strong)] text-[var(--text-3)]"
                  )}
                >
                  {label as string}
                  {allowed ? (
                    <CircleCheck
                      className="h-3.5 w-3.5 shrink-0 text-[var(--positive)]"
                      aria-hidden
                    />
                  ) : (
                    <Lock className="h-3 w-3 shrink-0" aria-hidden />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Platform guarantees                                                 */
/* ------------------------------------------------------------------ */

const GUARANTEES = [
  {
    icon: Lock,
    title: "Withheld, never zeroed",
    body: "A figure you may not see is missing from the payload, and the console marks it locked. Nought means nought.",
  },
  {
    icon: Banknote,
    title: "Money is never summed",
    body: "There is no FX rate in the platform, so no screen ever adds two currencies together. Each stands on its own.",
  },
  {
    icon: Fingerprint,
    title: "Audit keeps its context",
    body: "Every event stores the role its actor held at the time, so a revoked approval still reads as what it was.",
  },
];

export function Guarantees() {
  return (
    <Section id="platform" className="pb-20 sm:pb-24">
      <div className="grid gap-3 md:grid-cols-3">
        {GUARANTEES.map((g) => (
          <div
            key={g.title}
            className="rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-1)] p-5"
          >
            <g.icon className="h-[17px] w-[17px] text-[var(--accent-text)]" aria-hidden />
            <h3 className="mt-4 text-[14px] font-semibold tracking-[-0.015em] text-[var(--text-1)]">
              {g.title}
            </h3>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--text-2)]">
              {g.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Close                                                               */
/* ------------------------------------------------------------------ */

export function CallToAction() {
  return (
    <Section className="pb-24 sm:pb-28">
      <div className="relative overflow-hidden rounded-[18px] border border-[var(--hairline)] bg-[var(--surface-1)] px-8 py-14 text-center sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 120% at 50% 0%, rgba(94,106,210,0.13), transparent 65%)",
          }}
        />
        <div className="relative">
          <Mark size={40} className="mx-auto opacity-90" />
          <h2 className="mx-auto mt-6 max-w-[22ch] text-[27px] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--text-1)] sm:text-[32px]">
            Sign in to pick up the queue.
          </h2>
          <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-[1.65] text-[var(--text-2)]">
            Your console is assembled from the roles you hold — no setup, no
            configuration, nothing to switch on.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            <Link
              href="/sign-in"
              className="pressable inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--text-1)] px-5 text-[14px] font-medium text-[var(--ground)] transition-colors hover:bg-white"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-up"
              className="pressable inline-flex h-10 items-center gap-2 rounded-[8px] border border-[var(--hairline-strong)] px-5 text-[14px] text-[var(--text-1)] transition-colors hover:bg-[var(--surface-2)]"
            >
              Request access
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

export function Footer() {
  return (
    <footer className="border-t border-[var(--hairline)]">
      <Section className="flex flex-wrap items-center justify-between gap-5 py-8">
        <WordmarkInline />
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Footer">
          {[
            ["#modules", "Modules"],
            ["#access", "Access model"],
            ["#platform", "Platform"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
            >
              {label}
            </a>
          ))}
          <Link
            href="/sign-in"
            className="text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            Sign in
          </Link>
        </nav>
        <p className="text-[11px] text-[var(--text-3)]">
          Internal tool · © {new Date().getFullYear()} HitBox Collectibles
        </p>
      </Section>
    </footer>
  );
}
