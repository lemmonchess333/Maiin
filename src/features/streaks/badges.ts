export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "consistency" | "lifting" | "running" | "nutrition" | "hybrid";
}

export interface EarnedBadge extends BadgeDef {
  earnedAt: string | null;
}

export const BADGE_DEFINITIONS: BadgeDef[] = [
  // Consistency
  { id: "first_step", name: "First Step", description: "Log your first meal or workout", icon: "👣", category: "consistency" },
  { id: "week_warrior", name: "Week Warrior", description: "7-day streak", icon: "🔥", category: "consistency" },
  { id: "month_master", name: "Month Master", description: "30-day streak", icon: "💎", category: "consistency" },
  { id: "century_club", name: "Century Club", description: "100-day streak", icon: "🏅", category: "consistency" },

  // Lifting
  { id: "first_pr", name: "First PR", description: "Set a personal record", icon: "🏆", category: "lifting" },
  { id: "plate_club", name: "Plate Club", description: "Lift 60kg on any compound", icon: "🏋️", category: "lifting" },
  { id: "two_plate", name: "Two Plate Club", description: "Lift 100kg on any compound", icon: "💪", category: "lifting" },
  { id: "programme_complete", name: "Programme Complete", description: "Finish a full programme cycle", icon: "📋", category: "lifting" },

  // Running
  { id: "first_5k", name: "First 5K", description: "Complete a 5K run", icon: "🏃", category: "running" },
  { id: "10k_club", name: "10K Club", description: "Complete a 10K run", icon: "🎯", category: "running" },
  { id: "half_marathon", name: "Half Marathon", description: "Complete 21.1km", icon: "🥇", category: "running" },
  { id: "speed_demon", name: "Speed Demon", description: "Run a sub-5:00/km pace", icon: "⚡", category: "running" },

  // Nutrition
  { id: "macro_master", name: "Macro Master", description: "Hit all macros within 5% for a day", icon: "🎯", category: "nutrition" },
  { id: "protein_pro", name: "Protein Pro", description: "Hit protein target 7 days in a row", icon: "🥩", category: "nutrition" },
  { id: "hydration_hero", name: "Hydration Hero", description: "Hit water target 7 days in a row", icon: "💧", category: "nutrition" },

  // Hybrid
  { id: "hybrid_athlete", name: "Hybrid Athlete", description: "Log both a lift and run in one week", icon: "🦾", category: "hybrid" },
  { id: "iron_runner", name: "Iron Runner", description: "3 lifts + 3 runs in one week", icon: "🔱", category: "hybrid" },
  { id: "triple_threat", name: "Triple Threat", description: "Hit nutrition, lift, and run targets same day", icon: "⭐", category: "hybrid" },
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
