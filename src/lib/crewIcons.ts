/**
 * Shared icon map for crew rendering. Mirrored on the Social page's
 * crews list and the per-crew page header so a given crew renders
 * with the same glyph in both places. Add to this map whenever a
 * new icon name is offered in the Create Crew modal.
 */

import type React from "react";
import {
  Dumbbell,
  Footprints,
  Zap,
  Target,
  Flame,
  Salad,
  PersonStanding,
  Medal,
  Sunrise,
  Star,
} from "lucide-react";

export const CREW_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  dumbbell: Dumbbell,
  footprints: Footprints,
  zap: Zap,
  target: Target,
  flame: Flame,
  salad: Salad,
  person: PersonStanding,
  medal: Medal,
  sunrise: Sunrise,
  /* "star" is the seed icon for General Fitness in useCrews.ts but
     was missing here, so the crew row was falling through to the
     emoji fallback and rendering the literal text "star". */
  star: Star,
};
