"use client";

import { motion, useReducedMotion } from "motion/react";

export function HeroMark() {
  const reduce = useReducedMotion();

  return (
    <div className="relative h-48 w-full md:h-64" aria-hidden="true">
      <div className="absolute inset-0 flex items-end justify-center pb-2">
        {[
          { n: "01", label: "稳定", rotate: -14, x: -84, y: 4, z: 20 },
          { n: "02", label: "探索", rotate: 0, x: 0, y: -10, cobalt: true, z: 30 },
          { n: "03", label: "混合", rotate: 14, x: 84, y: 4, z: 20 },
        ].map((card, i) => (
          <motion.div
            key={card.n}
            initial={reduce ? { opacity: 1, x: card.x, y: card.y, rotate: card.rotate } : { opacity: 0, x: card.x, y: card.y + 24, rotate: card.rotate }}
            animate={{ opacity: 1, x: card.x, y: card.y, rotate: card.rotate }}
            transition={{
              delay: 0.15 + i * 0.08,
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={`
              absolute flex h-[120px] w-[84px] flex-col justify-between border-2 border-ink p-3 shadow-md
              md:h-[144px] md:w-[100px]
              ${card.cobalt ? "bg-cobalt text-paper-raised" : "bg-paper-raised text-ink"}
            `}
            style={{
              zIndex: card.z,
            }}
          >
            <span className={`font-mono text-xs ${card.cobalt ? "text-paper/80" : "text-cobalt"}`}>
              {card.n}
            </span>
            <span className={`font-serif text-sm ${card.cobalt ? "text-paper-raised" : "text-ink"}`}>
              {card.label}
            </span>
            <div className={`h-1 w-8 ${card.cobalt ? "bg-paper-raised" : "bg-cobalt"}`} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
