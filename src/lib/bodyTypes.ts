/**
 * Neutral body-diagram type home (2026-07-11 audit batch 3).
 *
 * bodyRig.ts (geometry + rig engine) and bodySideData.ts (side-view
 * piece data) each need GroupName, and previously imported it from each
 * other's counterpart — a two-file cycle. Both now depend on this
 * dependency-free module; bodyRig re-exports for existing importers.
 */
export type GroupName =
  | "head"
  | "torso"
  | "pelvis"
  | "upperArmL"
  | "upperArmR"
  | "foreArmL"
  | "foreArmR"
  | "handL"
  | "handR"
  | "thighL"
  | "thighR"
  | "shankL"
  | "shankR";
