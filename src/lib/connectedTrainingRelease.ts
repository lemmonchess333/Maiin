/**
 * Keep the Watch run and Apple Health workout-write path closed until the
 * paired-device command, HealthKit duplication, and signing gates pass.
 * A release build must explicitly set VITE_CONNECTED_TRAINING_ENABLED=true.
 */
export const CONNECTED_TRAINING_RELEASED =
  import.meta.env.VITE_CONNECTED_TRAINING_ENABLED === "true";
