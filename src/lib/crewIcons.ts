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
};
