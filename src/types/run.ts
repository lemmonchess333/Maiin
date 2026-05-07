/**
 * Shared run-flow types. Lifted out of `src/components/run/RunSetupModal.tsx`
 * so non-component modules (the upcoming `runGuards.ts` in particular)
 * can import the type without pulling in a UI component.
 *
 * `RunSetupModal.tsx` continues to re-export `ActivityType` for any
 * existing import sites that referenced it from there.
 */
export type ActivityType = 'easy' | 'tempo' | 'intervals' | 'long' | 'race' | 'treadmill' | 'freerun' | 'guided';
