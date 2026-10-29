"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  CreditCard,
  Factory,
  Globe,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LibraryBig,
  MicVocal,
  Package,
  Palette,
  Repeat,
  Rocket,
  ScrollText,
  Shapes,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Boxes,
  Cpu,
  Gauge,
  PackageCheck,
  Truck,
  Undo2,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_GROUP_ORDER, visibleNav, type NavItem } from "@/lib/authz";
import { Skeleton } from "@/components/ui/primitives";
import { Wordmark } from "@/components/brand";
import { useAuthz } from "./authz-provider";
import {
  useFulfilmentQueue,
  useOpenRefunds,
  usePendingApprovalCount,
  usePendingConsignmentCount,
} from "@/lib/api/hooks";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Globe,
  ShoppingCart,
  Banknote,
  CreditCard,
  Repeat,
  Users,
  Package,
  Palette,
  Factory,
  BadgeCheck,
  Truck,
  Boxes,
  Cpu,
  Gauge,
  PackageCheck,
  TrendingUp,
  Sparkles,
  Image: ImageIcon,
  ShieldCheck,
  ScrollText,
  KeyRound,
  UserCog,
  Rocket,
  Shapes,
  Undo2,
  LibraryBig,
  MicVocal,
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { perms, loading } = useAuthz();

  const items = React.useMemo(() => visibleNav(perms), [perms]);

  // The most specific match wins, so /products/types lights "Drop types"
  // and not "Drops" as well.
  const activeHref = React.useMemo(() => {
    let best: string | null = null;
    for (const item of items) {
      const hit = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (hit && (!best || item.href.length > best.length)) best = item.href;
    }
    return best;
  }, [items, pathname]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of items) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return NAV_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      group: g,
      items: map.get(g)!,
    }));
  }, [items]);

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-[240px] shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--surface-1)]"
    >
      <div className="flex h-[60px] items-center border-b border-[var(--hairline)] px-4 sm:px-5">
        <Link href="/dashboard" className="pressable rounded-[6px]" aria-label="HitBox Collectibles console">
          <Wordmark priority />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-3.5">
        {loading ? (
          <div className="space-y-1.5 px-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          grouped.map(({ group, items: groupItems }) => (
            <div key={group} className="mb-4 last:mb-0">
              <p className="px-2.5 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.07em] text-[var(--text-3)]">
                {group}
              </p>
              <ul className="space-y-px">
                {groupItems.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutDashboard;
                  const active = item.href === activeHref;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex h-8 items-center gap-3 rounded-[6px] px-2.5 text-[13.5px] transition-colors duration-150",
                          active
                            ? "bg-[var(--surface-3)] text-[var(--text-1)]"
                            : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"
                        )}
                      >
                        {/* The accent appears only on the active item */}
                        {active ? (
                          <span
                            className="absolute -left-2.5 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--accent)]"
                            aria-hidden
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active ? "text-[var(--accent-text)]" : "text-[var(--text-3)]"
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                        {item.href === "/returns" ? <OpenRefundsCount /> : null}
                        {item.href === "/packing" ? <ToPackCount /> : null}
                        {item.href === "/supply/consignments" ? <NewConsignmentsCount /> : null}
                        {item.href === "/release-approvals" ? <PendingApprovalsCount /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[var(--hairline)] px-4 py-3">
        <p className="text-[10.5px] leading-relaxed text-[var(--text-3)]">
          Navigation is built from your effective permissions, not your role
          name.
        </p>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Queue counts on nav entries — each rendered only on its own entry,  */
/* which is itself only shown to callers who can open that screen.     */
/* ------------------------------------------------------------------ */

const COUNT_TONE = {
  accent: "bg-[var(--accent)] text-white",
  info: "bg-[var(--info)] text-white",
  warning: "bg-[var(--warning)] text-black",
} as const;

function NavCount({
  n,
  tone,
  label,
  capped,
}: {
  n: number;
  tone: keyof typeof COUNT_TONE;
  /** Read aloud and shown on hover, e.g. "3 orders to pack". */
  label: string;
  /** The source stopped counting early — show "99+" whatever n is. */
  capped?: boolean;
}) {
  if (!n) return null;
  return (
    <span
      className={cn("ml-auto rounded-full px-1.5 text-[10.5px] font-semibold leading-[18px]", COUNT_TONE[tone])}
      aria-label={label}
      title={label}
    >
      {capped || n > 99 ? "99+" : n}
    </span>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Paid orders waiting for a unit — the packing queue's total (re-read every 30 s). */
function ToPackCount() {
  const q = useFulfilmentQueue({ page: 1, limit: 1 });
  const n = q.data?.total ?? 0;
  return <NavCount n={n} tone="accent" label={`${plural(n, "order")} waiting to be packed`} />;
}

/** Consignments still needing an accept / reject decision (UPLOADED or VALIDATED). */
function NewConsignmentsCount() {
  const n = usePendingConsignmentCount().data ?? 0;
  return <NavCount n={n} tone="info" label={`${plural(n, "new consignment")} awaiting a decision`} />;
}

/**
 * Drops waiting for an approve / reject decision — the review queue's
 * default view (PENDING, latest version per drop), narrowed server-side to
 * the reviews the caller can see.
 */
function PendingApprovalsCount() {
  const n = usePendingApprovalCount().data ?? 0;
  return <NavCount n={n} tone="warning" label={`${plural(n, "drop")} waiting for approval`} />;
}

/** Refunds waiting on someone — an initiated refund is seen without anyone looking for it. */
function OpenRefundsCount() {
  const q = useOpenRefunds();
  const n = q.data?.items.length ?? 0;
  return <NavCount n={n} tone="warning" label={`${plural(n, "open refund")}`} capped={q.data?.truncated} />;
}
