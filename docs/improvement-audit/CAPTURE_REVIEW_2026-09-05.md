# Review of the supplied Visual capture artifact

## Evidence and scope

Reviewed all 16 PNGs in the owner's `visual-capture 2.zip`: eight surfaces in
light and dark themes. ZIP entries are dated 2026-09-05, 08:07–08:12. The artifact
contains no source SHA, logs or interaction report, so its exact code revision
is not established. Findings below were traced to the current local source.

These are full-page Chromium screenshots at a phone-sized viewport, generated
against synthetic fixtures. They establish visible states, not successful use
of every control, native-device performance, authorization or backend behavior.
The archive remains unmodified. No browser walkthrough was performed locally.

## Surface-by-surface review

| Supplied pair | Observed in light/dark | Assessment and next check |
| --- | --- | --- |
| `01-home` | Light Home is obscured by the badge-seal dialog; dark Home exposes the performance card: 92, “Backing off”, “Loads high — ease this week”. Both show energy, hydration, weight and weekly-review entry. | Do not treat light Home as an unobstructed pass. The dialog is a distinct state worth retaining and testing separately. Compare the performance verdict with Analytics (fixed below). |
| `02-food` | Both themes show 410 calories left, matching 1,790/2,200 on Home; macro cards, composer, meal categories and four diary entries are visible. | Placeholder meal pictures come from the seed. Photo quality/retention cannot be assessed from them. The fixed nav overlaps the composer in the full-page image; a viewport/scroll sequence is needed before calling it a usability defect. |
| `03-train` | Both themes show Lift selected, a deload suggestion, the next Pull session, five exercise rows and weekly volume. | Recovery messaging agrees with Home. Run tab, exercise form, active workout, substitution, short-session and skip flows are absent. These captures provide no exercise-art approval. |
| `04-social` | Both themes show the Feed tab, spaces, weekly trajectory and the low-follow-count prompt. | Together, actual feed posts, joining, publishing, blocking and public/private account behavior are not covered. Follow counts and placeholder spaces are fixture data. |
| `05-analytics` | Both themes show 92/“Peak” in green, “Strong week — your training is on track”, and a deload warning on the same page. Multiple long-form chart sections follow. | Confirmed contradictory verdict; fixed below. Long-page captures are insufficient for legibility at native size or chart tapping. Check PRs, Badges, range switching and sparse data separately. |
| `06-settings-profile` | Both themes show name, body metrics, unselected gender/age options and “Your why”. | Source supplies accessible names; empty selections are supported and not evidence that a saved choice vanished. Subtitle mentions photo, but this route contains no photo editor: record as a copy/navigation follow-up. Saving/failure/keyboard states are untested. |
| `07-settings-nutrition` | Both themes show a calculated target of 2,500 and a drift warning, while Home/Food use 2,200. The manual override field is partly behind the fixed nav in the full-page shot. | The seed sets a stored 2,200 target; Settings calculates against the current body. This does not alone justify changing calorie formulas. Source inspection of the override exposed a reproducible typing/persistence defect (fixed below). |
| `08-settings-privacy` | Both themes show Public default visibility, Ask for run/workout sharing, AI analysis, route clipping, privacy zones and blocked-user entry. | “Ask” is selected rather than silent auto-posting. This image cannot establish actual access enforcement or GPS privacy. Review these controls with two disposable accounts and inspect the resulting shared route. |

## Confirmed fixes in this batch

### UI-001 — Analytics celebrated a week the app advised easing

`PerformanceTab` derived its band and color from the numeric score even when
the resolved load band was overreach or the engine recommended a deload.
`getPlainLanguageSummary` independently praised the same score. Home already
had a shared recovery override through `getVerbState`.

Analytics now uses that same override for the gauge label and warning palette;
its headline/body also respect it. Baseline establishment still takes priority.
The number, calculation and stored recommendation are unchanged. The tooltip
no longer implies that a higher score always means better progression.

Five new regression assertions failed before the implementation: three real
component cases and two summary cases. Existing early-read, settled-score and
delta cases remain covered. Tests use fake subscriptions and stub chart
telemetry; no Firebase data is required.

### UI-002 — manual calorie entry snapped back while typing

`NutritionSection` controlled the input with `profile.customCalorieTarget`, but
only updated that profile through a delayed write. Each keystroke could therefore
revert to the saved value. The timer also survived section unmounting.

The field now owns an immediate local draft and saves on blur, matching the
profile fields. A note explains when it saves. An old save response cannot erase
a newer draft, and account changes remount the editor. Removing the timer removes
its deferred post-unmount write. The reset control uses the existing button
primitive and the field uses the shared input/numeral styling.

Tracing the reset also found that `undefined` is stripped by guarded Firestore
merges, so it cannot clear a stored override. Reset now writes the existing
zero/no-override value and atomically includes calorie/protein/carbohydrate/fat
targets from the shared goal-weight recipe. The field displays a cleared
override as blank. Its calculated-target hint uses the formula result, not the
currently overridden target. The existing below-floor warning remains; this
change does not introduce a new minimum calorie policy.

Five new editor regression cases failed before implementation. Added checks cover
typing, clearing, reset, failed saves, stale responses, account switches, target
mirror consistency and preservation of below-floor overrides. These are component
and pure-recipe checks, not proof of live persistence after reload.

### QA-001 — screenshot capture lacked its own destination guard and provenance

The workflow passed emulator variables, but `visual-capture.mjs` itself trusted
its environment before creating an Admin SDK client and changing a user's theme.
It now refuses to proceed unless the opt-in flag, exact `demo-tropos` project and
local Auth/Firestore ports are present. It never initializes a different project.
Fifteen pure guard tests cover accepted/missing/malformed/remote destinations and
the guard's call-site placement.

Future runs also write a manifest with source SHA/run ID when supplied by CI,
capture status, actual URLs, filenames and open-dialog counts. They capture a
normal viewport image as well as the original full-page image. A sign-in timeout
is no longer silently swallowed. Open dialogs are flagged, not hidden or counted
as unobstructed screen passes. This is still a limited route-capture harness;
loaded-data readiness and complete interaction coverage remain separate work.

The modified capture harness has been syntax-checked and its pure guard tested.
It has **not** been executed against a browser/emulator in this environment or
pushed to GitHub. New screenshots are still required to review the changed UI.

## Important capture interpretation

The navigation is `position: fixed; bottom: 0`; the screenshot script requests
`fullPage: true` from an 852px-high viewport. The resulting tall image includes
content below that viewport while retaining the nav near its original screen
position. Seeing the nav halfway down the image is therefore not proof that it
floats halfway down a real phone screen. The source already reserves page-bottom
padding. Actual overlap, scroll reachability and frosted-bar contrast need normal
viewport captures and interaction; no speculative shell CSS change was made.

## Remaining improvement priorities

1. Obtain after-captures from the testing branch, with the new manifest. Review
   the changed gauge, editor and reset in both themes at actual viewport size.
2. Add an unobstructed Home capture and separate badge-dialog checks. Add focused
   Run, active-workout and exercise-guide captures, rather than calling the eight
   route pairs whole-app coverage.
3. Make the relationship between stored and recalculated nutrition targets
   clearer. Verify the recalculation flow and reload before altering formulas.
4. Evaluate faster workout logging, equipment-aware substitutions and progression
   explanations against existing behavior in interactive sessions. These are
   investigation directions, not verified missing features.
5. Test privacy/access boundaries and offline account changes with disposable
   accounts in an approved isolated runtime. Screenshots are not a security audit.
6. Resume the separately tracked 152-exercise artwork migration with one approved
   six-frame pilot; no new artwork was generated in this screenshot-review batch.

## Verification status

Post-change results are recorded in WORK_LOG.md. The previously rejected full
test run has not been retried. Local browser/emulator limitations still apply.
An unrelated change to `src/features/challenges/useChallenges.ts` appeared during
this work; it was preserved and is not part of this batch's authored changes.
