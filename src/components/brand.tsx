import Image from "next/image";
import mark from "../../public/brand/hitbox-mark.png";
import { cn } from "@/lib/cn";

/**
 * The HitBox Collectibles mark and wordmark.
 *
 * The lockup is fixed: mark on the left, HITBOX set heavy above a wide-tracked
 * COLLECTIBLES, the two lines optically the same width. Every surface uses one
 * of the three variants below rather than re-assembling it, so the proportions
 * stay identical everywhere.
 *
 * The source art is a white isometric cube on transparency, so it is only ever
 * placed on a dark surface. Icons for browser chrome are composited onto the
 * brand ground by `scripts/build-icons.mjs` instead.
 */

export function Mark({
  size = 20,
  className,
  priority,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={mark}
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 select-none", className)}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

/**
 * The two type lines of the lockup.
 *
 * `COLLECTIBLES` is tracked out to sit flush with `HITBOX` above it — the
 * trailing letter-space is trimmed with a negative right margin so the
 * tracking does not push the line optically wider than the word above.
 */
function LockupType({
  size,
  className,
}: {
  size: "sm" | "md" | "lg";
  className?: string;
}) {
  const scale = {
    sm: { top: "text-[15px]", sub: "text-[7.5px]", gap: "mt-[3px]" },
    md: { top: "text-[17px]", sub: "text-[8.5px]", gap: "mt-[3.5px]" },
    lg: { top: "text-[21px]", sub: "text-[10px]", gap: "mt-[4px]" },
  }[size];

  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span
        className={cn(
          "font-extrabold italic uppercase tracking-[-0.02em] text-[var(--text-1)]",
          scale.top
        )}
      >
        HitBox
      </span>
      <span
        className={cn(
          "-mr-[0.28em] font-semibold uppercase tracking-[0.28em] text-[var(--text-3)]",
          scale.sub,
          scale.gap
        )}
      >
        Collectibles
      </span>
    </span>
  );
}

/** Sidebar and other tight rails. */
export function Wordmark({
  className,
  markSize = 32,
  priority,
}: {
  className?: string;
  markSize?: number;
  priority?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <Mark size={markSize} priority={priority} />
      <LockupType size="sm" />
    </span>
  );
}

/** Marketing nav and footer, where the lockup can sit a little larger. */
export function WordmarkInline({
  className,
  markSize = 36,
  priority,
}: {
  className?: string;
  markSize?: number;
  priority?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-3.5", className)}>
      <Mark size={markSize} priority={priority} />
      <LockupType size="md" />
    </span>
  );
}

/** Centred vertical arrangement, for auth and hero surfaces with room. */
export function WordmarkStacked({
  className,
  markSize = 56,
  priority,
}: {
  className?: string;
  markSize?: number;
  priority?: boolean;
}) {
  return (
    <span className={cn("flex flex-col items-center gap-4", className)}>
      <Mark size={markSize} priority={priority} />
      <LockupType size="lg" className="items-center text-center" />
    </span>
  );
}

export const BRAND_NAME = "HitBox Collectibles";
