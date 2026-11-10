# Whole-app pass — 10 November 2026

The owner asked for one pass over everything: study the apps on Mobbin for
what makes them easy and hard to put down and add it to the design rules,
review the architecture with Matt Pocock's `improve-codebase-architecture`,
look for inefficiencies and security holes, and find every implicit state
machine. "Make the best decision" for the person using the app, the person
changing it and the agent reading it, "without breaking anything".

This is the record: what shipped, what was found and left, what only the
owner can do, and the numbers the next pass starts from. It ran in a cloud
session at `66733e9`, alone, without the workflow fan-out
`app-improvement-prompt.md` expects, so it is narrower than that prompt's
five workstreams.

## What this session could not do

- **Rules tests.** The Firestore emulator's jar is on a host the sandbox
  refuses (`storage.googleapis.com`), so `npm run test:rules` could not run.
  `firestore.rules` and `storage.rules` were read and not changed.
- **Captures.** No emulator means no capture rig, so no visual change was
  made. The one screen added (`ProfileUnavailable`) reuses the wording and
  layout of the Watch-cleanup notice beside it in `App.tsx` and is covered
  by unit tests only. It has not been seen on a device.
- **Devices and consoles.** Nothing here was run on an iPhone or checked in
  a console.

## Baseline, measured before the first edit

On a clean `main` at `66733e9`: `npx tsc -b` 0 errors; `npm run lint` 0
problems at `--max-warnings 0`; `npm run check:cycles` no cycles; `npm run
test` 1,485 files and 17,323 tests passed, 15 files and 585 tests skipped,
none failed, in 1,848 s on two cores. `npm audit --omit=dev`: 0 advisories
at the root and 0 in `functions/`.

## Fixed

Each is one commit with its own tests, and each test was run against the old
code to see it fail.

| Change                                                                                                                                       | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Proof                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Sign-in: a profile that cannot be read is not a missing one** (`src/lib/auth.tsx`, `src/App.tsx`, `src/components/ProfileUnavailable.tsx`) | The provider cleared the profile whenever its server read failed, and a signed-in account with no profile is sent to setup. Every token refresh re-reads the profile, so one failed read mid-session replaced the app with setup, and finishing setup replaces the programme (`completeOnboarding` sets `programState/current`). A failed read now keeps the copy already shown; with none, `profileLoad` is `"failed"` and the app offers Try again and Sign out. | 7 provider tests, 6 for the screen. With the old catch back, 6 of the 7 fail, the token-refresh case among them. |
| **Offline queue: retry on return to the app** (`src/lib/flushOnAppResume.ts`, `src/App.tsx`)                                                 | Queued writes, weights and programme commands were flushed at sign-in and on `online` only. A flush that failed while connected waited for the next write or a restart.                                                                                                                                                                                                                                                                                            | 5 tests; 3 fail with the gap check removed.                                                                      |
| **Run timer: pause and resume act once** (`src/hooks/useRunTimer.ts`)                                                                        | A second `pause` banked the same seconds again and a `resume` while running dropped unbanked time. One call site guarded itself; four pauses and two resumes in `Run.tsx` did not.                                                                                                                                                                                                                                                                                 | 5 tests, all failing on the old hook. The run page's three suites pass unchanged (96 tests).                     |
| **Blocks: one read of the block list** (`src/hooks/useBlockedUsers.ts`)                                                                      | Every consumer that mounted before the first read settled started its own. The hook has 21 call sites, some one per row.                                                                                                                                                                                                                                                                                                                                           | 1 test: one read for four consumers; four on the old hook.                                                       |
| **Lift session: one read of last time's sessions** (`src/components/WorkoutSession.tsx`)                                                     | The 50 newest workouts were fetched again on every swap, add and remove.                                                                                                                                                                                                                                                                                                                                                                                           | 1 test: reads unchanged by a swap; doubled (2 to 4) on the old code. The eight session suites pass (170 tests).  |
| **An inventory of state machines, kept true** (`docs/state-machines.md`, `stateMachinesDoc.test.ts`)                                         | Nothing listed which flows have their states written down and which are a pile of flags.                                                                                                                                                                                                                                                                                                                                                                           | The test fails on a path that does not exist or a named type that has left its file.                             |
| **Design rules 45 to 55** (`docs/design-rules-2026-11/rules-engagement.md`, DESIGN_GUIDE §14n)                                               | The sixth research pass. On its own branch, with DS5 as its own lock PR.                                                                                                                                                                                                                                                                                                                                                                                           | Counts and cited screens in the file.                                                                            |

## Security: what was read, and one finding

Read at the line: every `match` block under `users/{uid}`, the feed, kudos,
comments, follow, follow-request, block, report, notification, scan-usage,
config and deletion collections in `firestore.rules`; `storage.rules`; the
three invite callables; the native deep-link handler; every HTML sink and
every navigation driven by outside input in `src/`. A script checked each of
the 105 exports in `functions/index.js` for an auth reference; the ones it
flagged delegate to a library or are unauthenticated by design and say so.
This was a sample, not an audit of every line, and the earlier audits in
`docs/audits/` were not repeated.

**Open: anyone signed in can list anyone's followers and following.**
`following/{uid}/users/{targetUid}` and `followers/{uid}/users/{followerUid}`
both read `allow read: if request.auth != null` (`firestore.rules`, the
Following / Followers block), and `firestore.followRequests.rules.test.ts`
has a third account reading someone else's edge and succeeding. The plan
file's call is "follower lists are your own only ... their lists are theirs",
and the app only shows your own, but a client that asks for another
account's list gets it: who follows them, whom they follow, when, and whether
through an invite. That holds for an account that approves its followers and
for one that has blocked the reader.

It cannot be closed with a rule alone. A profile's two counts are count
aggregations over those collections (`getFollowerCount`, `getFollowingCount`
in `src/lib/socialApi.ts`), and Firestore authorises a count as a list. So:

1. The server keeps `followerCount` and `followingCount` on
   `users/{uid}/public/profile`, recounted on each follow edge written or
   deleted (a count aggregation, never an increment, as `raceCohorts.js`
   does), and the rules refuse a client write of either.
2. The app reads the counts from the public profile, falling back to the
   aggregation while a profile has none.
3. An operator backfill.
4. Only then: `allow read` on both collections narrows to the two people on
   the edge, with rules tests for a stranger, a blocked account and each
   party.

Steps 1 and 4 need the emulator and a deploy, so this pass wrote the plan
and no code. It is open question 2.

**Noted, not a finding.** A run post's map and a post's photos are `get`-able
by any signed-in account that holds the path (`storage.rules`, by design: "a
photo is reached from its post's URL"). The path carries the post's id, which
only someone who could once read the post has. So a follower who is later
removed or blocked keeps access to the files they already had paths to.

## Architecture: seven candidates

From the `improve-codebase-architecture` walk, in the `codebase-design`
vocabulary. The report with before-and-after diagrams was handed to the
owner; nothing here was built, because the skill's next step is a
conversation about which one.

| #   | Deepening                                                                                                                                                                                                                                                                                                                                                   | Strength                                               | Size |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---- |
| A1  | **Planned run facts.** One `src/lib` module answers "what is this run day" (effective template, pace target, zone band, purpose). Today four surfaces assemble the same eight-field argument, two blocks are copied verbatim between `DayActionSheet.tsx` and `ProgrammeRunSection.tsx`, and "which template does this day run" is written inline 29 times. | Strong                                                 | S    |
| A2  | **Lift session records, derived.** `prMap`, `prResults`, `firedPRs` and `volumeBest` are a function of the set logs that `sessionRecords.ts` already computes; they are stored four ways and written by three paths that validate differently.                                                                                                              | Strong; changes what is saved where the paths disagree | S/M  |
| A3  | **The run lifecycle's effects behind its reducer.** 13 dispatch sites each pair a phase change with timer, GPS, wake-lock and Watch calls by hand. Its step zero shipped in this pass (the timer).                                                                                                                                                          | Worth exploring                                        | L    |
| A4  | **Setup answers as one module.** 49 `useState` reassembled into `OnboardingDraft`; the payload is built inside `handleFinish`.                                                                                                                                                                                                                              | Worth exploring                                        | M    |
| A5  | **One save status for both finish screens.** The run derives "synced" from the queue; the lift holds seven pieces.                                                                                                                                                                                                                                          | Worth exploring                                        | M    |
| A6  | **A programme read model** exposing `stored` and `view`. Four readers normalise four ways. Read side only; ADR-0011's command seam does not move.                                                                                                                                                                                                           | Worth exploring                                        | M/L  |
| A7  | **Checkout owns the RevenueCat identity.** A behaviour change on the money path: see open question 3.                                                                                                                                                                                                                                                       | Owner call                                             | S    |

Start with A1: pure, display only, no stored documents, pinned by three
screen suites, about 250 lines.

## Inefficiencies read and left

- **History reads whole collections on every visit.**
  `useLifetimeMealStats` reads every meal document for two counts and
  `useLifetimeRunStats` every run, route points included; both are mounted
  ungated at `History.tsx:586-587`. The day count also decides whether the
  Food view shows its section, so it cannot simply be gated to the overview.
  Open question 4.
- **The programme loader is keyed on the profile object.**
  `useProgram.ts`'s load effect depends on `profile`, which `updateProfile`
  replaces at 42 call sites, and each run re-reads and re-subscribes. Read,
  not measured.
- **`Run` and `RunSummary` mount the whole of `useProgram`** to read two or
  three fields.

## Declined

- **Splitting `functions/index.js`.** The standing hold is in
  `functions/__tests__/triggerMetadata.test.js`.
- **Gating the lifetime reads to the overview.** It would hide the Food
  section for a person whose only food is older than the range.
- **Making `start` refuse a start while running** in `useRunTimer`. No call
  site needs it and a restart may rely on it.
- **Any change to `firestore.rules`.** No emulator here; an untested rule is
  worse than a documented gap.
- **A streak sheet change.** Rule 46 recommends one, and it starts as a
  mockup with captures.

## Operator checklist

- Read `ProfileUnavailable` on an iPhone in both themes, and at 2x text.
  Force it: airplane mode before first launch on a build with no cached
  profile.
- Finish a lift with no signal, background the app, reconnect, return: the
  session should leave "queued" within a few seconds without a new write.
- On a run, tap Pause during an auto-pause and check the duration does not
  jump.
- The standing ones are unchanged: App Check enforcement, the Cloud budget
  alert, GitHub secret scanning.

## Open questions (five, each with what was measured)

1. **Should the streak count weeks?** All 5 training apps with a streak do
   (adidas Running, Hevy, Ladder, Strava, Tonal); the 9 that count days are
   habit, language, food and wearable apps. Tropos counts days and forgives
   by the week (Streak1). Keeping it costs nothing. Changing it touches the
   chip, the sheet, the flame tiers, the nudges and 30 badges.
2. **Close the follow lists, or record them as public?** Closing is the four
   steps above: two server changes, a backfill and a rules change, with older
   builds showing "counts unavailable" on other people's profiles until they
   update. Recording them as public is one sentence in the plan file that
   reverses "their lists are theirs".
3. **What should a purchase that Apple took but RevenueCat has not yet
   entitled say?** Today `rcPurchase` returns failure with no message
   (`revenuecat.ts`, the `!isProActive` return), the app shows "Purchase
   failed. Try again." and skips the entitlement sync
   (`purchaseProvider.ts`), and `revenuecatPurchase.test.ts` pins that. The
   alternative is a fourth outcome, "bought, confirming", that runs the sync
   and says Pro will unlock shortly.
4. **Lifetime totals: read everything, or keep a count?** Two whole-collection
   reads per History visit today. A server-kept `mealCount`, `daysLogged`,
   `runCount` and `runMetres` would make them four numbers on one document,
   at the price of two more trigger writes per log and a backfill.
5. **Which deepening first?** A1 is recommended. A2 is worth more and changes
   what is saved.

## New baseline

On the combined tree of this pass's commits, `npm run verify` passes: lint
0 problems, the verifier tests, the two form-art checks, no cycles, the
build, dist size (6,709.6 kB against a baseline of 6,681.2 kB, inside its
tolerance) and the unit suite: 1,488 files and 17,386 tests passed, 15 files
and 585 tests skipped, none failed. That is 63 tests and 3 files more than
the baseline above. Everything else is as measured there.

Run the suite in a real clone. In a git worktree whose `node_modules` is a
symlink, six map suites (`RunMap*`, `RoutePlannerSheet`) cannot load: Vite
refuses MapLibre's worker file because it resolves outside the project root
("Denied ID"). That is the sandbox, not the code, and it cost this pass a
second run to tell apart.
