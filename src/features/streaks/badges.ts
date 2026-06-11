import {
  Footprints,
  Sparkles,
  Flame,
  Gem,
  Lock,
  Medal,
  Trophy,
  Sunrise,
  Dumbbell,
  ClipboardCheck,
  Zap,
  Target,
  Map,
  Beef,
  Droplets,
  UtensilsCrossed,
  Scale,
  Crown,
  Star,
  type LucideIcon,
} from "lucide-react";
import { THEME } from "@/lib/theme";

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";

export const TIER_COLORS: Record<BadgeTier, string> = THEME.tier;

/**
 * Map from BadgeDef.lucideIcon (PascalCase string) to the actual lucide
 * component. Centralised so BadgeGrid, BadgeEarnedModal, and any future
 * surface can render the icon by looking up this table instead of doing
 * `{badge.icon}` — which prints the kebab-case string literally ("footprints",
 * "sparkles", etc.). Fall callers back to Trophy if a definition references
 * an icon that isn't in the map.
 */
export const BADGE_ICONS: Record<string, LucideIcon> = {
  Footprints,
  Sparkles,
  Flame,
  Gem,
  Lock,
  Medal,
  Trophy,
  Sunrise,
  Dumbbell,
  ClipboardCheck,
  Zap,
  Target,
  Map,
  Beef,
  Droplets,
  UtensilsCrossed,
  Scale,
  Crown,
  Star,
};

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  lucideIcon: string;
  tier: BadgeTier;
  category: "consistency" | "lifting" | "running" | "nutrition" | "hybrid";
  /** Streak threshold (days). When set, useStreaks awards this badge once currentStreak >= threshold. */
  threshold?: number;
}

export interface EarnedBadge extends BadgeDef {
  earnedAt: string | null;
}

export const BADGE_DEFINITIONS: BadgeDef[] = [
  // Consistency
  {
    id: "first_step",
    name: "First Step",
    description: "Log your first meal or workout",
    icon: "footprints",
    lucideIcon: "Footprints",
    tier: "bronze",
    category: "consistency",
    threshold: 1,
  },
  {
    id: "three_day",
    name: "Getting Started",
    description: "3-day streak",
    icon: "sparkles",
    lucideIcon: "Sparkles",
    tier: "bronze",
    category: "consistency",
    threshold: 3,
  },
  {
    id: "week_warrior",
    name: "Week Warrior",
    description: "7-day streak",
    icon: "flame",
    lucideIcon: "Flame",
    tier: "silver",
    category: "consistency",
    threshold: 7,
  },
  {
    id: "two_week",
    name: "Two Week Wonder",
    description: "14-day streak",
    icon: "flame",
    lucideIcon: "Flame",
    tier: "silver",
    category: "consistency",
    threshold: 14,
  },
  {
    id: "month_master",
    name: "Month Master",
    description: "30-day streak",
    icon: "gem",
    lucideIcon: "Gem",
    tier: "gold",
    category: "consistency",
    threshold: 30,
  },
  {
    id: "two_month",
    name: "Unbroken",
    description: "60-day streak",
    icon: "lock",
    lucideIcon: "Lock",
    tier: "gold",
    category: "consistency",
    threshold: 60,
  },
  {
    id: "century_club",
    name: "Century Club",
    description: "100-day streak",
    icon: "medal",
    lucideIcon: "Medal",
    tier: "platinum",
    category: "consistency",
    threshold: 100,
  },
  {
    id: "year_long",
    name: "Year of Tropos",
    description: "365-day streak",
    icon: "trophy",
    lucideIcon: "Trophy",
    tier: "platinum",
    category: "consistency",
    threshold: 365,
  },
  {
    id: "early_bird",
    name: "Early Bird",
    description: "Log before 7am for 5 days",
    icon: "sunrise",
    lucideIcon: "Sunrise",
    tier: "bronze",
    category: "consistency",
  },

  // Lifting
  {
    id: "first_pr",
    name: "First PR",
    description: "Set a personal record",
    icon: "trophy",
    lucideIcon: "Trophy",
    tier: "bronze",
    category: "lifting",
  },
  {
    id: "plate_club",
    name: "Plate Club",
    description: "Lift 60 kg on any compound",
    icon: "dumbbell",
    lucideIcon: "Dumbbell",
    tier: "silver",
    category: "lifting",
  },
  {
    id: "two_plate",
    name: "Two Plate Club",
    description: "Lift 100 kg on any compound",
    icon: "dumbbell",
    lucideIcon: "Dumbbell",
    tier: "gold",
    category: "lifting",
  },
  {
    id: "three_plate",
    name: "Three Plate Club",
    description: "Lift 140 kg on any compound",
    icon: "flame",
    lucideIcon: "Flame",
    tier: "platinum",
    category: "lifting",
  },
  {
    id: "programme_complete",
    name: "Programme Complete",
    description: "Finish a full programme cycle",
    icon: "clipboard-check",
    lucideIcon: "ClipboardCheck",
    tier: "silver",
    category: "lifting",
  },
  {
    id: "tonnage_100",
    name: "100-Tonne Club",
    description: "Move 100 tonnes total volume",
    icon: "zap",
    lucideIcon: "Zap",
    tier: "gold",
    category: "lifting",
  },

  // Running
  {
    id: "first_5k",
    name: "First 5K",
    description: "Complete a 5K run",
    icon: "footprints",
    lucideIcon: "Footprints",
    tier: "bronze",
    category: "running",
  },
  {
    id: "10k_club",
    name: "10K Club",
    description: "Complete a 10K run",
    icon: "target",
    lucideIcon: "Target",
    tier: "silver",
    category: "running",
  },
  {
    id: "half_marathon",
    name: "Half Marathon",
    description: "Complete 21.1 km",
    icon: "medal",
    lucideIcon: "Medal",
    tier: "gold",
    category: "running",
  },
  {
    id: "marathon",
    name: "Marathoner",
    description: "Complete 42.2 km",
    icon: "medal",
    lucideIcon: "Medal",
    tier: "platinum",
    category: "running",
  },
  {
    id: "speed_demon",
    name: "Speed Demon",
    description: "Run a sub-5:00/km pace",
    icon: "zap",
    lucideIcon: "Zap",
    tier: "silver",
    category: "running",
  },
  {
    id: "century_km",
    name: "100 km Total",
    description: "Run 100 km lifetime distance",
    icon: "map",
    lucideIcon: "Map",
    tier: "gold",
    category: "running",
  },

  // Nutrition
  {
    id: "macro_master",
    name: "Macro Master",
    description: "Hit all macros within 5% for a day",
    icon: "target",
    lucideIcon: "Target",
    tier: "silver",
    category: "nutrition",
  },
  {
    id: "protein_pro",
    name: "Protein Pro",
    description: "Hit protein target 7 days in a row",
    icon: "beef",
    lucideIcon: "Beef",
    tier: "gold",
    category: "nutrition",
  },
  {
    id: "hydration_hero",
    name: "Hydration Hero",
    description: "Hit water target 7 days in a row",
    icon: "droplets",
    lucideIcon: "Droplets",
    tier: "silver",
    category: "nutrition",
  },
  {
    id: "meal_prep_master",
    name: "Meal Prep Master",
    description: "Log all meals for 14 days straight",
    icon: "utensils-crossed",
    lucideIcon: "UtensilsCrossed",
    tier: "gold",
    category: "nutrition",
  },

  // Hybrid
  {
    id: "hybrid_athlete",
    name: "Hybrid Athlete",
    description: "Log both a lift and run in one week",
    icon: "sparkles",
    lucideIcon: "Sparkles",
    tier: "bronze",
    category: "hybrid",
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "5 lifts + 5 runs in 14 days",
    icon: "scale",
    lucideIcon: "Scale",
    tier: "silver",
    category: "hybrid",
  },
  {
    id: "iron_runner",
    name: "Iron Runner",
    description: "3 lifts + 3 runs in one week",
    icon: "crown",
    lucideIcon: "Crown",
    tier: "silver",
    category: "hybrid",
  },
  {
    id: "triple_threat",
    name: "Triple Threat",
    description: "Hit nutrition, lift, and run targets same day",
    icon: "star",
    lucideIcon: "Star",
    tier: "gold",
    category: "hybrid",
  },
  {
    id: "ultimate_athlete",
    name: "Ultimate Athlete",
    description: "Earn 15 badges",
    icon: "trophy",
    lucideIcon: "Trophy",
    tier: "platinum",
    category: "hybrid",
  },
];

export const CATEGORY_LABELS: Record<BadgeDef["category"], string> = {
  consistency: "Consistency",
  lifting: "Lifting",
  running: "Running",
  nutrition: "Nutrition",
  hybrid: "Hybrid",
};

export function initBadges(): EarnedBadge[] {
  return BADGE_DEFINITIONS.map((b) => ({ ...b, earnedAt: null }));
}
