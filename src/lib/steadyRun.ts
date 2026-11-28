/**
 * Whether a run was meant to hold one pace, which is when a drift in its
 * heart rate says something about the runner (`aerobicDecoupling.ts`).
 * Its own module so the run's page can ask without loading the drift
 * maths. Pure: no React, no Firestore.
 */

/**
 * The run types that hold one pace, the only runs drift is read for:
 * easy, long and free runs, and a run with no type (an import, an older
 * save). Every other type asks for a change of pace (tempo, intervals, a
 * race, the older "fartlek" and "threshold"), and a second half run
 * harder than the first is the session, not drift. A tempo held exactly
 * (10 minutes easy, 20 at pace, 15 easy) read 16.4%: "Noticeable
 * second-half drift" (the 28 November audit, Appendix I). A manual run
 * has no track, and a guided run is steady only when its steps are.
 */
const STEADY_ACTIVITY_TYPES = new Set([
  "",
  "easy",
  "long",
  "freerun",
  "manual",
  "guided",
]);

/** The planned steps that hold an easy pace. A stride, a tempo block, a
 *  rep or the recovery between reps changes it. */
const STEADY_SEGMENT_TYPES = new Set(["warmup", "easy", "cooldown"]);

/** What a run's plan says about its pace: its config as saved. */
export interface RunPacePlan {
  activityType?: string | null;
  /** An interval block (`RunConfig.intervals`). */
  intervals?: unknown;
  /** The session's planned steps (`RunConfig.segments`). */
  segments?: readonly { type?: string | null }[] | null;
  /** A guided workout's steps (`RunConfig.guidedWorkout`). */
  guidedWorkout?: { segments?: readonly { type?: string | null }[] } | null;
}

const lower = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

/**
 * Whether a run was meant to hold one pace, so its drift says something:
 * a steady type, no interval block, and every planned step an easy one.
 * A guided run with no steps to read is not known to be steady.
 */
export function isSteadyRunPlan(plan: RunPacePlan | null | undefined): boolean {
  const type = lower(plan?.activityType);
  if (!STEADY_ACTIVITY_TYPES.has(type)) return false;
  if (plan?.intervals) return false;
  const steps = [
    ...(plan?.segments ?? []),
    ...(plan?.guidedWorkout?.segments ?? []),
  ];
  if (type === "guided" && steps.length === 0) return false;
  return steps.every((step) => STEADY_SEGMENT_TYPES.has(lower(step?.type)));
}
