"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Tabs across the top of a multi-screen section.
 *
 * These are real routes rather than local state, so a deep link into
 * /finance/payouts lands on payouts and the browser's back button works the
 * way an operator expects. Nested layouts keep the tab strip mounted across
 * the navigation, so switching tabs does not re-render the chrome.
 *
 * A tab whose `visible` is false is not rendered at all, never disabled: the
 * gateway-configuration tab needs a capability most operators do not hold,
 * and a greyed-out tab would advertise a screen they cannot reach.
 */
export interface SubNavItem {
  href: string;
  label: string;
  /** Defaults to true. */
  visible?: boolean;
}

export function SubNav({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname();
  const shown = items.filter((i) => i.visible !== false);

  // The section root (e.g. /finance) is a prefix of every sibling, so it can
  // only match exactly — otherwise it would light up on every tab.
  const activeHref = React.useMemo(() => {
    const exact = shown.find((i) => i.href === pathname);
    if (exact) return exact.href;
    const nested = shown
      .filter((i) => pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0];
    return nested?.href;
  }, [pathname, shown]);

  return (
    <nav
      aria-label="Section"
      className="-mx-1 flex items-center gap-0.5 overflow-x-auto border-b border-[var(--hairline)] pb-px"
    >
      {shown.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap rounded-t-[6px] px-2.5 py-2 text-[12.5px] font-medium transition-colors",
              active
                ? "text-[var(--text-1)] after:absolute after:inset-x-1.5 after:-bottom-px after:h-[2px] after:rounded-full after:bg-[var(--accent)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
