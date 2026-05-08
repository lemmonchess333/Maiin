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
 * separate from `'treadmill'` lets History / RunDetail label the run
 * honestly instead of saying "Treadmill" for an outdoor recording.
 * The modal's ACTIVITY_TYPES list deliberately omits `'manual'` —
 * users don't pick it directly.
 */
export type ActivityType = 'easy' | 'tempo' | 'intervals' | 'long' | 'race' | 'treadmill' | 'manual' | 'freerun' | 'guided';
