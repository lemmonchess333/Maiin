# Words on every screen: amount, length, choice and mechanics

10 November 2026. The owner asked for the grammar, language, typography, word choice, word length and word amount of every screen to be gone over and set beside Mobbin, to find the right amount and the right words. This is the measurement, what it changed and what is left. It sits under the house voice and the DS4 word rules (`CODING_STANDARDS.md`, `docs/design-rules-2026-11/rules-words.md`), which already fix how a line is written. Those were measured from 322 lines in 16 apps and are not re-derived here.

## How it was measured

- **Every string the app can show.** A script walked the TypeScript syntax tree of the 1,227 source files outside tests and pulled JSX text, label-like props, toasts and the copy held in objects and return values: 9,686 strings. 3,196 are content libraries (exercise how-to text, form cues, shoe and race names, spoken run cues) and 216 are the legal pages. The 6,274 left are the app's own voice, and the numbers below are about those.
- **What is on a screen at once.** The emulator rig cannot run where this was done, so rendered screens come from the owner's two TestFlight recordings of 10 November (ten screens, full resolution) and his Opal recording (four screens). Words were counted two ways: by eye on three Tropos screens and every reference screen, and by OCR on all of them. OCR found 60 to 71% of the by-eye count on the two screens checked, so an OCR-only figure is marked as a floor.
- **Mobbin.** Nine reference screens counted by eye for this pass (Cal AI, BitePal, Nike Training Club, Hevy, Google Health), on top of DS4's 82. A count is every word and every figure in the first viewport below the status bar, tab bar included.

The sample for words per screen is small (13 reference screens). It is enough to say which Tropos screens sit outside the range, not to set a rule to the word.

## What the numbers say

### 1. The lines are short. There are too many of them.

| measure                        | Tropos      | reference (DS4, 16 apps) |
| ------------------------------ | ----------- | ------------------------ |
| sentence length, median words  | 7 (n=1,685) | 9 (n=118)                |
| sentences over 15 words        | 6% (100)    | 8% (9 of 118)            |
| button, median words           | 2 (n=528)   | 2 (n=68)                 |
| heading, median words          | 2 (n=422)   | 3 (n=47)                 |
| sentence carries a number      | 14%         | 26%                      |
| sentence ends in "!"           | 0           | 20%                      |
| mean word length, characters   | 4.7         | not measured             |
| words of 12 characters or more | 0.7%        | not measured             |

Line by line Tropos is already shorter than the apps it is measured against, and plainer: the commonest long words are "unavailable" (22), "notifications" (21), "automatically" (12) and "subscription" (12), and two of those are names of things. The one line-level gap DS4 found is still open: half as many sentences carry a number.

Words on screen tell the other half:

| screen        | Tropos, first viewport              | reference, first viewport                         |
| ------------- | ----------------------------------- | ------------------------------------------------- |
| Home          | 56                                  | Cal AI 46 · NTC 30 · BitePal 22 · Opal 32 or more |
| Train         | 89                                  | Nike Training Club activity 40                    |
| Live workout  | 51 (66 with the weight prompt open) | Hevy 37                                           |
| Food          | 31 or more                          | BitePal diary 60 · Google Health food detail 39   |
| Finish        | 13 or more                          | Cal AI "Your workout burned" 8 · Opal streak 12   |
| Weekly review | 50 or more                          |                                                   |
| Start a run   | 39 or more                          |                                                   |
| Run setup     | 43 or more                          |                                                   |
| Social        | 44 or more                          |                                                   |
| Analytics     | 47 or more                          |                                                   |

"or more" is an OCR floor. Everyday reference screens run from 22 to 60 with a median of 39. Home is inside that range, the live workout is at its top, and Train is half as much again as the largest reference. Since the lines are short, the extra is lines, which is DS4's layout finding seen from the words: more blocks per screen, not longer sentences.

Reference screens counted: [Cal AI home](https://mobbin.com/screens/f0507a66-6524-46d6-a6a8-8b8f16057705), [BitePal home](https://mobbin.com/screens/46a02ecf-d18a-4847-bb3c-6ba18e1b52bc), [Nike Training Club home](https://mobbin.com/screens/7abc6053-b1e1-41bd-8e09-16398a93ee70), [Hevy live workout](https://mobbin.com/screens/fa1b4fe1-5d63-4e97-ac9a-ccdf41b86d7c), [Hevy measurements form](https://mobbin.com/screens/f8428b6d-a0b3-4e0c-af53-cd6a3500f87a), [BitePal diary](https://mobbin.com/screens/01d5a821-9f2b-46d7-a7ee-8e3ee508c032), [Google Health food detail](https://mobbin.com/screens/312762de-bb6a-45c3-a184-6d8d26841910), [Cal AI workout logged](https://mobbin.com/screens/788bdfe4-e18b-4e2a-a4eb-cbd781d2658a), [Nike Training Club activity](https://mobbin.com/screens/534bd877-7760-4911-82f9-7089c92743e1).

### 2. A budget per kind of screen

| kind of screen                                  | aim     | ceiling                  | counts as                                                 |
| ----------------------------------------------- | ------- | ------------------------ | --------------------------------------------------------- |
| everyday (Home, Train, Food, Social, Analytics) | 45      | 60                       | words and figures in the first viewport, tab bar included |
| logging (live workout, run, food entry)         | 40      | 55                       | the same, less what the person typed                      |
| finish, reward, streak                          | 12      | 20                       | the same                                                  |
| a line of body text                             | 9 words | 15                       | per sentence (DS4)                                        |
| a button                                        | 2 words | 3, and 20 characters     | (DS4)                                                     |
| a heading                                       | 3 words | 4 on a hero, 6 elsewhere | (DS4)                                                     |

The aim is the reference median rounded up; the ceiling is the largest everyday reference screen. A screen over its ceiling loses a line before it loses a word.

### 3. Mechanics: the app mostly agrees with itself, and the strays are few

| what                    | majority                                         | strays found                                       | this pass                         |
| ----------------------- | ------------------------------------------------ | -------------------------------------------------- | --------------------------------- |
| spelling                | programme 43, analyse 3, kilometres, cancelled 8 | program 2, analyzing 3, fiber 1                    | fixed, held at zero               |
| ellipsis                | "…" 55                                           | "..." 9                                            | fixed, held at zero               |
| an error's voice        | "Couldn't … Try again." (385 contractions)       | "… failed" 12, "Failed to …" 6, "We couldn't …" 8  | fixed, held at zero               |
| contractions            | 385                                              | 41 uncontracted ("could not", "cannot", "is not")  | 14 fixed, 27 left                 |
| generic praise          | none                                             | "Nice work." 2                                     | removed, held at zero             |
| case                    | sentence case                                    | "Sign Up" 1                                        | fixed                             |
| words joined by a slash | "and"                                            | "workouts/runs", "fitness/fatigue", "start/end"    | fixed                             |
| "e.g."                  | "e.g. Home"                                      | "e.g., Nike" 2                                     | fixed                             |
| system words            | plain                                            | "Invalid email or password", "currently scheduled" | fixed                             |
| apostrophe              | straight 441                                     | curly 24                                           | owner call 1: ’, held at zero     |
| em dash                 | none wanted                                      | 163 lines in 84 files                              | 1 removed, 162 left; owner call 2 |
| "tap" in an instruction | a verb alone                                     | 33                                                 | listed, not changed               |
| "No … yet" as a heading | DS4 rule 8 forbids it                            | 18                                                 | listed, not changed               |
| "we" doing something    | "you"                                            | 19 left ("We'll send a link")                      | listed, not changed               |

`src/lib/__tests__/copyMechanics.test.ts` holds the fixed rows at zero.

### 4. Word choice: four names compete

| the thing   | what the app calls it                                                 | count                                                                         |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| a record    | PR 13 · new best 9 · personal record 3 · personal best 1              | owner call 3                                                                  |
| energy      | calories 39 · kcal on Food and the run screen · cal in the units rule | owner call 4                                                                  |
| whose it is | your 725 · my 31 ("My pantry", "Keep my current plan")                | owner call 5                                                                  |
| a lift      | session 192 · lift 105 · workout 87                                   | not a fault: session covers a run or a lift, a workout is one lift (GLOSSARY) |

"Sign in" (19) and "sign out" (10) have no rival. "Delete" (63), "remove" (51) and "discard" (16) keep three meanings: gone for good, off a list, unsaved.

## What this pass changed

59 strings in 32 files, none changing what a line means:

- **Spelling:** "Setting up your programme…", "Back to programme", "Analysing food", "Fibre".
- **Ellipsis:** nine "..." became "…"; "Getting accurate signal..." became "Getting an accurate signal…".
- **Errors say what couldn't be done:** "Barcode lookup failed." is "Couldn't look up that barcode."; "Purchase failed. Try again." is "Couldn't complete the purchase. Try again."; "Failed to restore purchases." is "Couldn't restore your purchases."; "Failed to save run. Tap Retry below." is "Couldn't save this run. Try again below."; eight "We couldn't …" lost the "We"; fourteen "could not", "cannot" and "is not" are contracted ("This can't be undone.").
- **Praise:** "Maintenance calories set." and "Circle wrapped." lost "Nice work."
- **First use:** "No performance weeks yet. Log workouts/runs and your weekly index will appear here." is "Log a workout or a run and your first weekly score appears here." (DS4 rules 5 and 8).
- **Plain words:** "Wrong email or password"; "No reminder is scheduled."; "Hide where a route starts and ends near saved locations"; "Every workout and run feeds one curve of fitness and fatigue. Log a few sessions and the trend appears."
- **Case:** "Sign up".

## Owner calls

1. **Apostrophes: curly everywhere.** 441 strings use a straight ' and 24 a curly ’. iOS's own apps set the curly one, and at hero sizes the straight one shows. It is a mechanical change to about 440 strings and the tests that quote them, so it wants its own PR. Recommended: yes. **Done:** 682 strings in 225 files now write ’, with the 179 test files and specs that quote them, and `copyMechanics.test.ts` holds a straight one at zero. The first measure, 441, came from a narrower scan that left out thrown messages, which people also see, and most of the legal pages. Left straight: 95 strings in eight content libraries (51 in the exercise library, 15 spoken run cues, 11 in the Space definitions), where a name such as "Farmer's Carry" is saved in people's history under that spelling, and the server's own text.
2. **Em dashes: take the rest out.** 162 lines in 84 files still carry one; the ratchet (`emDashCopy.test.ts`) only stops the count growing. The densest are `liftDayLabel.ts` (13), `runSessionExplainer.ts` (11), the weather tips (6) and the day and week sheets on Train (10). Each becomes a full stop, a colon or a middot. Recommended: yes, in three PRs by area.
3. **One name for a record.** "New best" on the finish screen and Home, "PR" on Analytics ("Running PRs", "First PR"), "Personal bests by reps" on an exercise. Recommended: "best" everywhere ("New best", "Running bests", "Bests by reps"), since the rest of the app is British and says so in words rather than initials.
4. **kcal or cal.** Food and the run screen say "kcal"; the units rule in `CLAUDE.md` gives "2,633 cal". Recommended: kcal, the unit on a British food label, and correct the rule.
5. **"My" on a page title.** "My pantry" beside "Your data" and "Your plan". A button may speak as the person ("Keep my current plan"); a title should not. Recommended: "Your pantry".
6. **Train's first viewport, 89 against a ceiling of 60.** Three lines could go without losing anything that is not one tap away: the plan line's "Base · 6 days/week" (it is on Your plan), and each exercise row's "Last: 60 kg × 10, 10" (the hero already compares with last time, and the row opens to it). That is about 20 fewer.
7. **The weight prompt in a workout.** "85 kg? Your best at these reps is 60 kg." fires on the app's own target, as the recording showed. The words are fine; the trigger is not. It belongs with the waits and collisions list.

## Left for later, counted

- 27 uncontracted phrases, most in longer explanations on Train and Settings.
- 31 "tap" instructions; a verb alone is the rule ("Log weight", not "Tap to log weight").
- 18 "No … yet" lines, 9 of them headings.
- 19 lines where "we" does something.
- 100 sentences over 15 words: Train 21, Home 17, the run screens 15.
- The content libraries (3,196 strings) and the server's notification text were measured for length only and not changed.
- The legal pages were left alone: 68 of the Privacy Policy's sentences run over 15 words, which is what a policy is.

## Every route

Strings are the distinct lines a route can show across all its states, the page and the components it draws. Sentence figures are words. The last four columns count lines still carrying the pattern.

| page                                   | route                            | strings | median | p90 | over 15 | longest | uncontracted | em dash | tap | "No … yet" |
| -------------------------------------- | -------------------------------- | ------- | ------ | --- | ------- | ------- | ------------ | ------- | --- | ---------- |
| `Home.tsx`                             | /                                | 480     | 8      | 15  | 17      | 27      | 1            | 34      | 10  | 1          |
| `Food.tsx`                             | /food                            | 428     | 7      | 13  | 7       | 21      | 2            | 22      | 4   | 0          |
| `History.tsx`                          | /history                         | 355     | 7      | 16  | 7       | 22      | 4            | 9       | 0   | 3          |
| `TrainingHistory.tsx`                  | /history/sessions                | 40      | 7.5    | 11  | 0       | 12      | 1            | 0       | 0   | 1          |
| `ExerciseHistory.tsx`                  | /history/exercise/:name          | 81      | 7      | 11  | 0       | 11      | 3            | 0       | 0   | 1          |
| `Program.tsx`                          | /program                         | 766     | 7      | 14  | 21      | 28      | 10           | 53      | 6   | 1          |
| `TrainingPlan.tsx`                     | /program/plan                    | 195     | 7      | 11  | 1       | 17      | 6            | 0       | 1   | 0          |
| `Routine.tsx`                          | /routine/:routineId              | 252     | 8      | 13  | 5       | 21      | 3            | 18      | 4   | 1          |
| `EmptyWorkout.tsx`                     | /empty-workout                   | 247     | 8      | 13  | 5       | 21      | 3            | 18      | 4   | 1          |
| `WorkoutDetail.tsx`                    | /workout/:workoutId              | 128     | 6      | 12  | 1       | 23      | 0            | 7       | 1   | 1          |
| `Run.tsx`                              | /run                             | 450     | 6      | 14  | 15      | 21      | 2            | 54      | 5   | 0          |
| `RunSummary.tsx`                       | /run-summary                     | 268     | 6      | 12  | 1       | 17      | 2            | 6       | 1   | 1          |
| `RunDetail.tsx`                        | /run/:runId                      | 114     | 7      | 12  | 1       | 23      | 0            | 1       | 0   | 0          |
| `WeeklyReview.tsx`                     | /review                          | 107     | 7      | 13  | 1       | 16      | 0            | 7       | 0   | 0          |
| `Social.tsx`                           | /social                          | 398     | 6      | 11  | 4       | 24      | 0            | 18      | 1   | 3          |
| `Space.tsx`                            | /space/:spaceId                  | 123     | 6      | 12  | 0       | 13      | 0            | 4       | 1   | 2          |
| `SpacePost.tsx`                        | /space/:spaceId/post/:postId     | 81      | 6      | 12  | 0       | 12      | 0            | 3       | 1   | 1          |
| `UserProfile.tsx`                      | /user/:uid                       | 185     | 6      | 10  | 0       | 13      | 0            | 15      | 0   | 3          |
| `FollowList.tsx`                       | /followers, /following           | 29      | 6      | 11  | 0       | 11      | 0            | 0       | 0   | 1          |
| `League.tsx`                           | /league                          | 27      | 11     | 20  | 4       | 21      | 0            | 0       | 0   | 0          |
| `ActivityPost.tsx`                     | /activity/:activityId            | 158     | 6      | 12  | 1       | 17      | 0            | 18      | 1   | 2          |
| `Upgrade.tsx`                          | /upgrade                         | 104     | 8      | 17  | 3       | 20      | 0            | 2       | 0   | 0          |
| `SettingsIndex.tsx`                    | /settings                        | 55      | 8      | 12  | 0       | 12      | 0            | 1       | 0   | 0          |
| `settings/SettingsProfile.tsx`         | /settings/profile                | 42      | 6      | 11  | 0       | 12      | 0            | 1       | 1   | 0          |
| `settings/SettingsAccount.tsx`         | /settings/account                | 89      | 7      | 16  | 5       | 20      | 1            | 4       | 2   | 0          |
| `settings/SettingsTraining.tsx`        | /settings/training               | 136     | 7      | 11  | 1       | 19      | 3            | 2       | 1   | 0          |
| `settings/SettingsLiftPlan.tsx`        | /settings/lift-plan              | 141     | 7      | 11  | 1       | 19      | 3            | 3       | 1   | 0          |
| `settings/SettingsRunPlan.tsx`         | /settings/run-plan               | 189     | 8      | 14  | 5       | 21      | 4            | 2       | 0   | 0          |
| `settings/SettingsWorkoutPrefs.tsx`    | /settings/workout-prefs          | 13      | 6      | 8   | 0       | 8       | 0            | 0       | 0   | 0          |
| `settings/SettingsNutrition.tsx`       | /settings/nutrition              | 58      | 7.5    | 17  | 3       | 18      | 0            | 3       | 0   | 0          |
| `settings/SettingsPantry.tsx`          | /settings/pantry                 | 34      | 6      | 15  | 0       | 15      | 0            | 0       | 0   | 0          |
| `settings/SettingsData.tsx`            | /settings/data                   | 17      | 6      | 12  | 0       | 12      | 0            | 0       | 0   | 0          |
| `settings/SettingsRecentlyDeleted.tsx` | /settings/recently-deleted-meals | 18      | 7.5    | 11  | 0       | 11      | 0            | 0       | 0   | 0          |
| `settings/SettingsHealth.tsx`          | /settings/health                 | 51      | 8      | 12  | 1       | 19      | 3            | 0       | 0   | 2          |
| `settings/SettingsShoes.tsx`           | /settings/shoes                  | 44      | 6      | 9   | 0       | 9       | 0            | 1       | 0   | 2          |
| `settings/SettingsNotifications.tsx`   | /settings/notifications          | 97      | 7      | 15  | 2       | 21      | 1            | 13      | 1   | 1          |
| `settings/SettingsPrivacy.tsx`         | /settings/privacy                | 62      | 7.5    | 16  | 2       | 20      | 1            | 0       | 0   | 0          |
| `settings/SettingsUnitsAppearance.tsx` | /settings/units-appearance       | 27      | 6      | 8   | 0       | 8       | 0            | 0       | 0   | 0          |
| `settings/SettingsSubscription.tsx`    | /settings/subscription           | 19      | 6      | 8   | 0       | 8       | 0            | 1       | 0   | 0          |
| `settings/SettingsSupportLegal.tsx`    | /settings/support-legal          | 15      | 0      | 0   | 0       | 0       | 0            | 2       | 0   | 0          |
| `AdminModeration.tsx`                  | /admin/moderation                | 36      | 5      | 8   | 0       | 12      | 1            | 0       | 0   | 0          |
| `Diagnostics.tsx`                      | /diagnostics                     | 30      | 5      | 8   | 0       | 8       | 0            | 0       | 0   | 0          |
| `Onboarding.tsx`                       | * (fallback)                     | 259     | 7      | 12  | 4       | 24      | 0            | 13      | 5   | 0          |
| `Login.tsx`                            | * (fallback)                     | 59      | 8      | 14  | 2       | 18      | 0            | 0       | 2   | 0          |
| `PrivacyPolicy.tsx`                    | /privacy                         | 147     | 16     | 32  | 68      | 55      | 15           | 4       | 0   | 0          |
| `TermsOfService.tsx`                   | /terms                           | 49      | 11.5   | 24  | 12      | 32      | 4            | 0       | 0   | 0          |
| `Support.tsx`                          | /support                         | 19      | 7.5    | 21  | 1       | 21      | 0            | 2       | 0   | 0          |
