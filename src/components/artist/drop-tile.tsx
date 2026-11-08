"use client";

import { cn } from "@/lib/cn";

/**
 * A drop has no image of its own on these routes, so each one gets a
 * monogram on a gradient picked from its id — stable, distinct, and it
 * reads as artwork rather than a blank box.
 */
const GRADIENTS = [
  "from-[#6d5dfc] to-[#c86dd7]",
  "from-[#ff8a5c] to-[#ea4c89]",
  "from-[#2dd4bf] to-[#3b82f6]",
  "from-[#f59e0b] to-[#ef4444]",
  "from-[#22c55e] to-[#0ea5e9]",
  "from-[#a855f7] to-[#6366f1]",
  "from-[#f472b6] to-[#fb923c]",
  "from-[#14b8a6] to-[#84cc16]",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function DropMonogram({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const initials = name
    .replace(/[—–-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br font-semibold tracking-tight text-white/95 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]",
        GRADIENTS[hash(id) % GRADIENTS.length],
        className
      )}
    >
      {initials || "•"}
    </span>
  );
}
