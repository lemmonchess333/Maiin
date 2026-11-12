/**
 * The words a structured run's steps are drawn in: a step's kind, its
 * colour, and the shape of a stored guided workout.
 *
 * This file held three fixed guided workouts ("Easy 30", "Build Speed",
 * "Hard & Fast") and the audit that kept their table honest. Trim1 call 8
 * (the owner, 11 November 2026: "streamline all") took them out: the plan
 * already writes easy runs, intervals, tempo and long runs with their
 * steps, and the run setup builds intervals by hand, so the three stood
 * beside sessions the app already had. "Build Speed", a run that steps
 * from easy to hard, is the one with no equal in the plan.
 *
 * `GuidedRunWorkout` stays because a run saved or still in flight from
 * one carries the workout on its stored config, and `segmentsFromGuided`
 * (runSegments.ts) still turns it into steps.
 */

import { THEME } from "@/lib/theme";

export type SegmentType =
  | "warmup"
  | "easy"
  | "moderate"
  | "hard"
  | "recovery"
  | "cooldown";

export interface RunSegment {
  type: SegmentType;
  durationSeconds: number;
  label: string;
  instruction: string;
}

export interface GuidedRunWorkout {
  id: string;
  name: string;
  description: string;
  totalMinutes: number;
  difficulty: "easy" | "moderate" | "hard";
  color: string;
  segments: RunSegment[];
}

const SEGMENT_COLORS: Record<SegmentType, string> = {
  warmup: "#e09510",
  easy: "#22b558",
  moderate: "#3b7ee6",
  hard: "#e04040",
  recovery: THEME.brand,
  cooldown: "#06a8c8",
};

export function getSegmentColor(type: SegmentType): string {
  return SEGMENT_COLORS[type];
}
