# Designer first release — 7 September 2026

Implements the approved lead-designer handoff’s first release, based on main
`a1ea34731bb3f716a96947f72e85f3d33625f60f`.

## Decisions

- Five named chapters contain seven screens: aim; lift frequency and running;
  equipment/experience and limitations; body inputs; review. Stable internal
  step IDs remain unchanged. Old preview step 6 resumes at review 7. An old
  equipment draft resumes through running so the reordered flow cannot skip it.
- Fresh goals, running intent and limitations require an explicit selection.
  Frequency and experience are labelled starting suggestions. Existing v2
  drafts remain readable; confirmation flags, editable name, stone display and
  return-to-review state are additive, validated and scoped to the uid.
- The early week is labelled Draft. Day taps inspect the schedule shape;
  named lifts remain ordered by the split. Day editing and zero-lift setup
  remain outside this release.
- `buildOnboardingPlan` preserves the previous template matching and filtering
  path and calls the existing builder. Review and commit consume that same
  result. Free running has zero scheduled run slots. A race without a date
  resolves to free running; a typed past date blocks commitment. Nutrition
  starts at maintenance for every training goal.
- Review edits return directly to review; changing the public name does not
  regenerate the plan. Only plan inputs invalidate the preview. A single-flight
  save guard prevents repeated taps, existing transient retries reuse the same
  payload, and failures preserve the draft with an inline retry message.
- The scale and direct typing change setup state only. Unit switches preserve
  canonical kg/cm. Stone uses pounds for precision, while the existing profile
  preference continues to store kg/lb. New controls have 44 px targets.
- Home: week context, training, energy/water/weight, review, compact performance,
  then the existing education lane. Food: compact energy/Details, composer and
  slot, usual meal, diary. Nutrition calculations and logging/Undo are retained.

The larger onboarding question heading uses the existing `text-h1` token,
recorded in DESIGN_GUIDE. Palette, fonts and sport coding stay consistent.
The new flow removes the old Stepper and two review-only formatters that no
longer have callers; it introduces no artwork or animation sequence.

## Verification and evidence

Baseline capture: source `a1ea347`, scratch capture commit `338ddfb`, frames at
`77de70bb18e12fd76917170c82abf96db0975299` on the app-screenshots channel.
Matched onboarding and Food frames are used for before/after review. The Home
capture is explicitly checked after its session finishes loading and badge
reveals are dismissed; a skeleton or overlay is not accepted as a final frame.

Unit coverage checks explicit choices and reloads, review editing, exact
preview/payload identity, single-flight save and retry, run mode/count parity,
maintenance targets, typed metric validation and unit precision. Emulator
captures cover race-runway advice, free running, weight entry, review edits,
failed-save recovery, and usual-meal offline logging with Undo.

Full verification results and final capture links are recorded in the PR.
Local test attempts that contacted the public Firestore endpoint were rejected
by automatic approval review. Test-only verification uses dummy Firebase
configuration and local emulator routing; no production data is needed.

These are browser/emulator checks, not a physical iPhone test or a user study.
