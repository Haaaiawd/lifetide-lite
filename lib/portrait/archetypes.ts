// Persona archetype matching — maps 5-dimension trait scales
// to one of 6 pixel-art character portraits.

import type { TraitDimension, TraitScale } from "@/lib/portrait/types";

export type ArchetypeId = "watcher" | "explorer" | "connector" | "pioneer" | "artisan" | "ranger";

export type Archetype = {
  id: ArchetypeId;
  name: string;
  tagline: string;
  image: string;
  bg: string;
  vector: Record<TraitDimension, number>;
};

export const ARCHETYPES: Archetype[] = [
  {
    id: "watcher",
    name: "守望者",
    tagline: "安静稳重，在自己领域里深扎",
    image: "/portraits/watcher.png",
    bg: "#3D4A6B",
    vector: { energy_mode: 1, structure_pref: 4, novelty_seeking: 1, decision_speed: 2, emotional_range: 1 },
  },
  {
    id: "explorer",
    name: "探索者",
    tagline: "安静但好奇，一个人走得很远",
    image: "/portraits/explorer.png",
    bg: "#2A6A6A",
    vector: { energy_mode: 1, structure_pref: 2, novelty_seeking: 5, decision_speed: 3, emotional_range: 2 },
  },
  {
    id: "connector",
    name: "联结者",
    tagline: "温暖稳定，在关系网里扎根",
    image: "/portraits/connector.png",
    bg: "#C97B2F",
    vector: { energy_mode: 5, structure_pref: 3, novelty_seeking: 2, decision_speed: 3, emotional_range: 5 },
  },
  {
    id: "pioneer",
    name: "开拓者",
    tagline: "外向爱冒险，带着人往前冲",
    image: "/portraits/pioneer.png",
    bg: "#D4A843",
    vector: { energy_mode: 5, structure_pref: 2, novelty_seeking: 5, decision_speed: 4, emotional_range: 5 },
  },
  {
    id: "artisan",
    name: "匠人",
    tagline: "精密专注，打磨细节",
    image: "/portraits/artisan.png",
    bg: "#6B5B8A",
    vector: { energy_mode: 2, structure_pref: 5, novelty_seeking: 2, decision_speed: 1, emotional_range: 2 },
  },
  {
    id: "ranger",
    name: "游侠",
    tagline: "灵活果断，走哪算哪",
    image: "/portraits/ranger.png",
    bg: "#B86A4A",
    vector: { energy_mode: 3, structure_pref: 1, novelty_seeking: 4, decision_speed: 5, emotional_range: 4 },
  },
];

const DIMENSIONS: TraitDimension[] = [
  "energy_mode",
  "structure_pref",
  "novelty_seeking",
  "decision_speed",
  "emotional_range",
];

export function matchArchetype(scales: TraitScale[]): Archetype {
  const userVector = {} as Record<TraitDimension, number>;
  for (const s of scales) {
    userVector[s.dimension] = s.level;
  }

  let best: Archetype = ARCHETYPES[0];
  let bestDist = Infinity;

  for (const archetype of ARCHETYPES) {
    let dist = 0;
    for (const dim of DIMENSIONS) {
      const diff = (userVector[dim] ?? 3) - archetype.vector[dim];
      dist += diff * diff;
    }
    dist = Math.sqrt(dist);
    if (dist < bestDist) {
      bestDist = dist;
      best = archetype;
    }
  }

  return best;
}
