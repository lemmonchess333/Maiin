export type MovementPattern =
  | "squat"
  | "hinge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "isolation"
  | "core";

export type MovementCategory =
  | "primary"
  | "secondary"
  | "accessory";

export type ExerciseMeta = {
  id: string;
  name: string;
  pattern: MovementPattern;
  category: MovementCategory;
  fatigueScore: number;
};

export type LiftPerformance = {
  exerciseId: string;
  currentE1RM: number;
  bestE1RM: number;
  trend: number;
};

export type WeeklyPrescription = {
  week: number;
  intensityMultiplier: number;
  volumeModifier: number;
  deload: boolean;
};

export type Mesocycle = {
  id: string;
  startDate: number;
  currentWeek: number;
  totalWeeks: number;
  deloadWeek: number;
  primaryLifts: string[];
  secondaryLifts: string[];
};
