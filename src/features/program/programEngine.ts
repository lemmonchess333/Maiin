import {
  WeeklyPrescription,
  LiftPerformance,
} from "./programTypes";

export function calculateE1RM(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

export function generateWeek(week: number): WeeklyPrescription {
  if (week === 4) {
    return {
      week,
      intensityMultiplier: 0.85,
      volumeModifier: 0.7,
      deload: true,
    };
  }

  return {
    week,
    intensityMultiplier: 1 + week * 0.025,
    volumeModifier: 1,
    deload: false,
  };
}

export function adjustForPerformance(
  base: WeeklyPrescription,
  primaryTrend: number,
  fatigueScore: number
): WeeklyPrescription {
  let intensity = base.intensityMultiplier;
  let volume = base.volumeModifier;

  if (primaryTrend > 0 && fatigueScore < 20) {
    intensity += 0.01;
  }

  if (primaryTrend <= 0) {
    volume += 0.1;
  }

  if (fatigueScore > 20) {
    volume -= 0.15;
  }

  return {
    ...base,
    intensityMultiplier: intensity,
    volumeModifier: volume,
  };
}