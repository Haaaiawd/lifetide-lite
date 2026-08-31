// Pixel-style speech bubble for the landing mascot.
// Uses an inline SVG with crisp edges to keep the 1-bit blocky look.

import { ReactNode } from "react";

export function PixelSpeechBubble({
  children,
  width = 160,
  height = 80,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width, height }}
    >
      <svg
        viewBox="0 0 80 40"
        className="absolute inset-0 h-full w-full [shape-rendering:crispEdges]"
        aria-hidden="true"
      >
        <path
          d="M8 4 h64 v24 h-48 v4 l-4 4 l-4 4 v-12 H8 z"
          className="fill-paper-raised stroke-ink"
          strokeWidth={2}
          strokeLinejoin="miter"
        />
      </svg>
      <div className="relative z-10 max-w-[80%] px-2 text-center text-sm leading-tight">
        {children}
      </div>
    </div>
  );
}
