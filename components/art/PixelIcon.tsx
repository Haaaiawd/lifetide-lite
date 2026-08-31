// Small 1-bit pixel art decorations that inherit currentColor.
// Uses pixelarticons (MIT) — see tmp/art-assets-research.md for alternatives.

import {
  CircleQuestion,
  Cloud,
  Comment,
  Compass,
  Flag,
  Heart,
  Home,
  Map,
  MapPin,
  Ship,
  Sparkle,
  Sparkles,
  TreePine,
  Upload,
  User,
  Users,
} from "pixelarticons/react";

const ICONS = {
  circleQuestion: CircleQuestion,
  cloud: Cloud,
  comment: Comment,
  compass: Compass,
  flag: Flag,
  heart: Heart,
  home: Home,
  map: Map,
  mapPin: MapPin,
  ship: Ship,
  sparkle: Sparkle,
  sparkles: Sparkles,
  treePine: TreePine,
  upload: Upload,
  user: User,
  users: Users,
};

export type PixelIconName = keyof typeof ICONS;

export interface PixelIconProps {
  name: PixelIconName;
  size?: number;
  className?: string;
}

export function PixelIcon({ name, size = 24, className }: PixelIconProps) {
  const Icon = ICONS[name];
  if (!Icon) return null;
  return <Icon width={size} height={size} className={className} aria-hidden="true" />;
}

// Convenience alias for the "person" use-case in A+B plan.
export { PixelIcon as PixelPerson };
