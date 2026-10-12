/**
 * Shared run-flow types. Lifted out of `src/components/run/RunSetupModal.tsx`
 * so non-component modules (the upcoming `runGuards.ts` in particular)
 * can import the type without pulling in a UI component.
 *
 * `RunSetupModal.tsx` continues to re-export `ActivityType` for any
 * existing import sites that referenced it from there.
 *
 * `'manual'` is set programmatically when the user taps "Track without
 * GPS" on the run-acquiring screen — it routes through TreadmillMode's
 * manual-distance entry but is semantically distinct: the user was
 * outdoors and intended a real run, GPS just didn't lock. Keeping it
 * separate from the treadmill lets History / RunDetail label the run
 * honestly instead of saying "Treadmill" for an outdoor recording.
 * The modal's ACTIVITY_TYPES list deliberately omits `'manual'` —
 * users don't pick it directly.
 *
 * The treadmill is not a type (Pgm8): it is where a run happened
 * (`RunPlace`), so a planned run done on one keeps the plan's type.
 * Runs saved before that carry `activityType: "treadmill"`, which
 * `isTreadmillRun` (`runGuards.ts`) still reads as a treadmill run.
 */
export type ActivityType =
  | "easy"
  | "tempo"
  | "intervals"
  | "long"
  | "race"
  | "manual"
  | "freerun"
  | "guided";

/**
 * Where a run happened, when it was not out on the GPS: on a treadmill,
 * with the distance typed in from the machine at the end (Pgm8). Set by
 * the setup's "On a treadmill" switch on the run's config, and saved on
 * the run as `place` (null for a run that was not on one).
 */
export type RunPlace = "treadmill";
