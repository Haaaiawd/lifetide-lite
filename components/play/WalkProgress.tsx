"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import Image from "next/image";

/**
 * Brutalist walking progress bar: thick ink border, hard offset shadow,
 * high-contrast fill. The pixel traveler walks on top of the bar and
 * follows the leading edge of the fill.
 */
export function WalkProgress({
  progress,
  accentColor = "var(--cobalt)",
  className,
}: {
  progress: number;
  accentColor?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 4);
    }, 180);
    return () => clearInterval(interval);
  }, [reduce]);

  return (
    <div className={`relative w-full ${className ?? ""}`} style={{ height: "104px" }}>
      {/* Track — thick bordered slab with a hard shadow */}
      <div className="absolute bottom-4 left-0 right-0 h-8 border-[3px] border-ink bg-paper-raised shadow-md">
        {/* Filled progress — chunky high-contrast block with a hard cap */}
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${clamped * 100}%`,
            backgroundColor: accentColor,
            borderRight: clamped > 0 ? "3px solid var(--ink)" : undefined,
          }}
        />
      </div>

      {/* Traveler — walks on top of the bar at the leading edge of the fill */}
      <div
        className="absolute z-10"
        style={{
          left: `calc(${clamped * 100}% - ${clamped * 36}px)`,
          bottom: "44px",
          width: "36px",
          height: "64px",
          transition: "left 0.3s ease-out",
        }}
      >
        <Image
          src={`/sprites/new/traveler-frame-${frame}.png`}
          alt=""
          width={36}
          height={64}
          className="h-16 w-9"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </div>
  );
}
