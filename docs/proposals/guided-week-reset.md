# Guided week reset

**Status:** Implemented on `feat/guided-week-reset`, 2026-10-30. Release visual QA pending.

## Decision

Connect the private Weekly Review check-in to the existing Train plan workspace. When a person says the plan felt too heavy or too light, offer a guided way to make the current week fit. Their answer never changes a prescription on its own. They choose a change, review its actual scope, confirm it, and can then return to Today.

The two supported changes have different contracts:

- **Move a run this week** moves one eligible dated run instance through the existing validated move command. The editor already previews the from/to dates, spacing warnings and whether the command is queued.
- **Change usual weekly layout** edits the recurring Lift / Run / Both / Rest pattern. It is not a one-week override. The guided entry adds a review step showing before/after counts, changed weekdays and the effect on the lift programme and future scheduled runs before the existing save/rebuild path runs.

Lifting remains rotation ordered. A named lift is never pinned to a date just to fill a calendar. No adjustment silently changes historical sessions, race dates, nutrition targets or another account's plan. The person can keep the plan and go to Today without a write.

## Journey

1. The Weekly Review remains useful without answering its optional check-in. An answered training check-in routes to **Your plan**. A heavy or light answer opens its guided reset state; a good-fit answer opens the ordinary agenda. Food and weigh-in focuses keep their existing destinations.
2. The reset state shows the current Monday–Sunday week and two distinct actions. It explains that a run move applies only this week, while the usual layout repeats in future weeks. It uses the current plan and saved-activity readiness gates; loading, missing or stale data never produces a fake editable week.
3. The run path uses `MoveRunSheet` and `moveRunDay` unchanged. A success returns to the reset state with the actual applied or waiting-to-sync result. A declined or failed command leaves the draft in the editor.
4. The recurring-layout path takes a fresh profile snapshot when opened. The person edits day types, then sees a review step with the exact day changes and lift/run count difference. The existing rebuild confirmation still appears when the lift-day count changes to a nonzero value. A changed profile while editing blocks confirmation and asks the person to reopen the editor. Dismissing a dirty guided draft asks before discarding it.
5. After a confirmed change, **Go to Today** closes the loop. If the command is queued, the copy says it is waiting to sync. Keeping the week also returns to Today. Back from the plan returns to Review when entered from there; direct links fall back to Train.

## Evidence and limits

Mobbin's [Runna workout rearrangement](https://mobbin.com/flows/f2e8cefd-7023-4eca-98d4-8538b763808f) spans eight captured iOS screens, and [Garmin workout rescheduling](https://mobbin.com/flows/76de61e1-98ff-4990-9c67-dbb269d1f32b) spans six. They show source selection, date choice and an explicit save. They do not imply that Tropos should date-pin its lift rotation or copy their calendar.

Tropos already has the weekly recap, the check-in, a one-off run move and a recurring-layout editor. The missing product connection is the decision and consequence across those surfaces. A safe guided path can reuse their canonical commands without inventing a second scheduling model.

## Bundle size

The guided review adds 3.8 kB to the lazy `ScheduleLayoutSheet` chunk and the plan handoff adds 4.5 kB to the lazy `TrainingPlan` chunk. The dist-size baseline rises only for those two chunks. The cold-start preload set and its total budget stay unchanged.

## Acceptance

- Heavy/light training answers reach the reset; good fit reaches the normal plan; food and weigh-in focuses still reach their own areas. The answer itself makes no plan write.
- A run move previews and saves only one eligible run in the current week. The reset reports queued work as pending, never applied. An invalidated move remains editable and is not called successful.
- A recurring-layout change previews changed weekdays and accurate lift/run counts before saving. A lift-count change to a nonzero value still requires rebuild confirmation. A stale profile, active session, pending finish or unavailable plan blocks the guided save.
- Cancelling a dirty guided draft asks before discarding it. A second open reads current profile values. The person can skip directly to Today without a mutation.
- Light and dark themes, small phones, 200% text, keyboard/screen-reader focus, reduced motion and 44px touch targets receive release review.

## Measurement

Count reset views, which path was chosen, confirmed versus queued changes, and keep-plan exits. Compare later saved lift/run activity and repeat plan edits by reviewed week. These events describe behavior; a single check-in does not prove which plan dose would work better.
