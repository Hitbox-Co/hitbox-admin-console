"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Banknote,
  CreditCard,
  Globe,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Package,
  Palette,
  Repeat,
  Rocket,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Boxes,
  Cpu,
  Gauge,
  PackageCheck,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_GROUP_ORDER, visibleNav, type NavItem } from "@/lib/authz";
import { Skeleton } from "@/components/ui/primitives";
import { Wordmark } from "@/components/brand";
import { useAuthz } from "./authz-provider";

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
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { perms, loading } = useAuthz();

  const items = React.useMemo(() => visibleNav(perms), [perms]);

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
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
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
