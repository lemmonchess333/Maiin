/**
 * Shared types used across multiple modules to prevent
 * silent breakage from typos in string literals.
 */

/** User's training goal — used in auth profile, TDEE, macros */
export type Goal = "cut" | "lean bulk" | "recomp";

/** Training phase — used in plateau detection, adaptive macros */
export type Phase = "lean bulk" | "cut" | "recomp" | "strength peak";

/** Day type for scheduling & nutrition adjustments */
export type DayType = "lift" | "run" | "both" | "rest";
