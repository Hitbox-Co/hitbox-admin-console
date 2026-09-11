import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The hero bloom.
 *
 * Modelled on the aurora skiper-ui.com runs behind its hero — an electric
 * mass rising from the bottom edge, organic and slowly morphing. Theirs is a
 * looping MP4 served from their CDN; this is the same effect rebuilt from
 * layered radial gradients, so it ships no video, works at any viewport, and
 * is ours to change.
 *
 * Two details do the heavy lifting:
 *
 *  - the blobs are `screen` blended, so where they overlap the colour adds up
 *    and blows out to a near-white cyan core, which is what makes the
 *    reference read as *light* rather than as a painted shape;
 *  - the gradients hold full opacity well past their centre before falling
 *    off, so there is a solid mass rather than a haze.
 *
 * Geometry is in per-cent of the hero box, not viewport units, so the bloom
 * keeps its proportions whatever the section's height works out to be.
 *
 * The palette runs from the brand accent through azure to cyan rather than
 * copying their pure blue, so the bloom still reads as HitBox.
 *
 * Only `transform` animates, which keeps the work on the compositor. The
 * global `prefers-reduced-motion` rule in globals.css freezes it outright.
 */

interface Blob {
  style: React.CSSProperties;
  animation: string;
}

const BLOBS: Blob[] = [
  {
    // Indigo anchor on the left — the brand accent in the mix.
    style: {
      left: "-20%",
      bottom: "-30%",
      width: "86%",
      height: "92%",
      background:
        "radial-gradient(closest-side, rgba(94,106,210,1) 0%, rgba(94,106,210,0.86) 38%, rgba(94,106,210,0) 72%)",
    },
    animation: "aurora-a 26s ease-in-out infinite",
  },
  {
    // The azure body — the largest share of the mass.
    style: {
      left: "2%",
      bottom: "-36%",
      width: "80%",
      height: "96%",
      background:
        "radial-gradient(closest-side, rgba(37,150,255,1) 0%, rgba(37,150,255,0.9) 40%, rgba(37,150,255,0) 74%)",
    },
    animation: "aurora-b 31s ease-in-out infinite -6s",
  },
  {
    // Cyan core. Kept tight; `screen` pushes the overlap toward white.
    style: {
      left: "20%",
      bottom: "-28%",
      width: "52%",
      height: "70%",
      background:
        "radial-gradient(closest-side, rgba(96,226,255,1) 0%, rgba(96,226,255,0.85) 36%, rgba(96,226,255,0) 70%)",
    },
    animation: "aurora-c 22s ease-in-out infinite -11s",
  },
  {
    // Right-hand falloff, cooler so the eye still settles left.
    style: {
      right: "-18%",
      bottom: "-32%",
      width: "78%",
      height: "88%",
      background:
        "radial-gradient(closest-side, rgba(45,150,255,1) 0%, rgba(45,150,255,0.82) 40%, rgba(45,150,255,0) 74%)",
    },
    animation: "aurora-d 35s ease-in-out infinite -3s",
  },
];

export function HeroAurora({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/*
        The bloom lives in a bottom-anchored band of its own rather than the
        whole hero. A hero is far taller on a phone, where the columns stack,
        and geometry measured against the whole box would stretch the bloom
        into a faint wash there while staying compact on a desktop. The band
        caps out, so the effect reads the same at every width.

        `isolate` keeps the screen blending inside this stack.
      */}
      <div className="absolute inset-x-0 bottom-0 isolate h-[min(76%,620px)]">
        {BLOBS.map((b, i) => (
          <span
            key={i}
            className="absolute block rounded-[50%] mix-blend-screen will-change-transform motion-reduce:!animate-none"
            style={{ ...b.style, animation: b.animation, filter: "blur(44px)" }}
          />
        ))}

        {/* The hot base: where the mass meets the bottom edge it is brightest. */}
        <span
          className="absolute inset-x-[-16%] bottom-[-12%] h-[62%] mix-blend-screen"
          style={{
            background:
              "radial-gradient(115% 100% at 50% 100%, rgba(155,242,255,0.95) 0%, rgba(70,180,255,0.78) 32%, rgba(40,120,240,0.4) 58%, rgba(40,120,240,0.12) 78%, transparent 92%)",
            filter: "blur(36px)",
          }}
        />

        {/*
          Scrim, inside the band so it tracks it. The content sits over this,
          and a bloom this bright would eat it — so the band is near-opaque at
          its top edge and clears completely toward the bottom, leaving the
          bloom at full strength across the base of the section.
        */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, var(--ground) 0%, rgba(8,9,10,0.95) 20%, rgba(8,9,10,0.74) 38%, rgba(8,9,10,0.3) 58%, rgba(8,9,10,0.03) 76%, rgba(8,9,10,0) 90%)",
          }}
        />
      </div>

      {/* Hairline grid, only in the dark upper half. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "linear-gradient(to bottom, black 0%, black 32%, transparent 58%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 32%, transparent 58%)",
        }}
      />

      {/* A narrow dark hem, so the bloom ends on the page rather than at it. */}
      <div
        className="absolute inset-x-0 bottom-0 h-10"
        style={{ background: "linear-gradient(to top, var(--ground), transparent)" }}
      />
    </div>
  );
}
