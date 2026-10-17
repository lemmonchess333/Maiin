import type { RunTemplate } from "./workoutTemplates";
import { RUN_POSE_CUTOUTS, type RunPose } from "./runPoses.data";

export type { RunPose };

/**
 * The runner a run card draws, as the lift card draws the session's lead
 * lift. A run done fast (tempo, intervals, a race) gets the long, driving
 * stride; every other run, a free run included, gets the easy one. The
 * poses and why there are two: docs/exercise-art/RUN_CARD_RUNNER_BRIEF.md.
 */
export function runPoseFor(type: RunTemplate["type"] | undefined): RunPose {
  return type === "tempo" || type === "intervals" || type === "race"
    ? "run-fast"
    : "run-easy";
}

/** The pose's cut-out URL under the app's base path. */
export function runPoseUrl(pose: RunPose): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/${RUN_POSE_CUTOUTS[pose].src}`;
}
