import noRace from "@/assets/plan/plan-no-race.webp";
import starter from "@/assets/plan/plan-starter.webp";
import race from "@/assets/plan/plan-race.webp";
import fiveK from "@/assets/plan/plan-5k.webp";
import tenK from "@/assets/plan/plan-10k.webp";
import half from "@/assets/plan/plan-half.webp";
import marathon from "@/assets/plan/plan-marathon.webp";
import type { RaceDistance } from "./raceGoalPlanner";

/**
 * The photographs on Run plan's goal and distance cards (DESIGN_GUIDE §14m
 * rule 26), cut small for a card (640 x 356). Where each comes from is
 * in `src/assets/plan/README.md` and its manifest. "Training for a race"
 * shows the race's own place when the goal is bound to one; this is its
 * picture otherwise.
 */
export const PLAN_GOAL_PHOTOS = {
  freeform: noRace,
  starter,
  race_prep: race,
  // Run24 (3): a plan with no race date, built towards 5K and 10K.
  rolling: tenK,
} as const;

export const PLAN_DISTANCE_PHOTOS: Record<RaceDistance, string> = {
  "5k": fiveK,
  "10k": tenK,
  half,
  marathon,
};
