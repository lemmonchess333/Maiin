import {
  Flag,
  Footprints,
  Gauge,
  Mountain,
  PersonStanding,
  RefreshCw,
  Route,
  Timer,
  TrendingUp,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * A run template's `icon` key, as `RUN_TEMPLATES` stores it, to the glyph
 * every run card draws for it.
 *
 * Home's run card and the run launch card each carried an identical copy
 * of this table, and Train's run card (DS3) needed a third. A run type
 * that gains an icon now gains it everywhere at once.
 */
export const RUN_TEMPLATE_ICONS: Readonly<Record<string, LucideIcon>> = {
  "person-standing": PersonStanding,
  zap: Zap,
  "refresh-cw": RefreshCw,
  wind: Wind,
  route: Route,
  flag: Flag,
  // Run24 (4): the time trial, the plan's benchmark session.
  timer: Timer,
  // Run24 (5): hill repeats, a progression run, repeats at a race's pace.
  mountain: Mountain,
  "trending-up": TrendingUp,
  gauge: Gauge,
};

/** The glyph for a run template's icon key; a plain run's footprints when
 *  the key is missing or unknown. */
export function runTemplateIcon(key?: string | null): LucideIcon {
  return (key && RUN_TEMPLATE_ICONS[key]) || Footprints;
}
