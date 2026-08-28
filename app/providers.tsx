"use client";

import { ReactNode } from "react";
import { MotionConfig } from "motion/react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
