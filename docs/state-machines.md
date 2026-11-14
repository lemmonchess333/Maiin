# State machines in Tropos

An inventory, taken on 10 November 2026 at `66733e9`, of every place where the
app moves through a set of states: which ones are written down as a type or a
graph, and which exist only as a combination of flags, refs and effect order.
The second kind is where a screen gets stuck, a session saves twice or an
account lands on the wrong route, because nothing stops the combination that
should not exist.

Read it before changing one of these flows. Add a row when you add a flow with
more than two states. `stateMachinesDoc.test.ts` fails when a file named here
is gone.

How it was made: a scan of `src/` for state-shaped types, inline unions in
`useState`, reducers and clusters of boolean flags (1,228 files), a read of
the hot files by a second reader with a fresh context, and a read of each
cited line before it was written here. Line numbers are as of the commit
above and will drift; the file and the names are the durable part.

## Written down (explicit)

These have one type or one graph that names the states. Keep new work on them
inside that type.

| Flow                     | Where                                                                                        | States                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GPS run phase            | `src/features/run/runSessionReducer.ts` (`RunPhase`)                                         | waiting, acquiring, countdown, active, paused, finished                                                              |
| Account deletion         | `functions/lib/accountDeletionLedger.js` (`STATUS`, `STATE_GRAPH`)                           | a server graph with terminal states; the client reads it in a reducer (`src/components/settings/AccountSection.tsx`) |
| Push token claim         | `functions/lib/pushTokenOwnership.js` (`CLAIM_STATUS`)                                       | server-owned                                                                                                         |
| Health export receipt    | `firestore.rules` (`healthWorkoutExports`), `src/lib/healthWorkoutExport.ts` (`ExportState`) | attempted, exported, pending-delete; the rules refuse any other move                                                 |
| Run save                 | `src/lib/runGuards.ts` (`SaveStatus`)                                                        | idle, saving, saved, error                                                                                           |
| Follow control           | `src/hooks/useFollowState.ts` (`FollowState`)                                                | following, requested, not-following                                                                                  |
| AI consent               | `src/lib/aiConsent.ts` (`AiConsentStatus`)                                                   | unasked, allowed, off                                                                                                |
| Sign-in screen           | `src/pages/Login.tsx` (`View`, `LoadingAction`)                                              | typed views and one busy action                                                                                      |
| Steps connection         | `src/hooks/useSteps.ts` (`StepsStatus`)                                                      | unavailable, unprompted, connected, ambiguous                                                                        |
| A session document       | `src/hooks/useSessionDoc.ts` (`SessionDocStatus`)                                            | loading, ready, missing, failed                                                                                      |
| Someone's profile        | `src/hooks/useUserProfileData.ts` (`ProfileStatus`)                                          | loading, missing, error, ready                                                                                       |
| Your own profile at boot | `src/lib/auth.tsx` (`ProfileLoad`), since this pass                                          | loading, ready, missing, failed                                                                                      |
| A training block         | `src/features/program/trainingBlock.ts` (`BlockStatus`)                                      | active, completed, abandoned                                                                                         |
| A scheduled run          | `src/features/program/programTypes.ts` (`ScheduledRunStatus`)                                | planned, skipped, race_no_show                                                                                       |
| A lift day               | `src/features/program/liftDayStatus.ts` (`LiftDayStatus`)                                    | today, upcoming, completed, skipped, missed                                                                          |
| A day on Home's week     | `src/components/home/WeekStrip.tsx` (`WeekDayState`)                                         | seven named states                                                                                                   |
| Camera permission        | `src/components/FoodCameraModal.tsx` (`CameraState`)                                         | idle, granted, denied, unavailable                                                                                   |
| Heart rate sensor        | `src/lib/heartRateSensorBridge.ts` (`SensorConnection`, `SensorAuthorization`)               | idle, connecting, connected; Bluetooth not asked, allowed, denied, restricted; native owns the moves                 |
| Heat on a run            | `src/lib/heatAdjustment.ts` (`HeatLevel`), `src/hooks/useHotDay.ts` (`HotDay`)               | none, hot, extreme; then offered, adjusted or swapped                                                                |

`useSessionDoc` and `useUserProfileData` are the pattern to copy: a read has
four outcomes, and "missing" and "failed" are different ones.

## Not written down (implicit), by risk

Each row: where the state lives, the states it really has, a combination the
code can hold that it should not, and what would make it explicit.

### 1. The lift session's finish and save. Risk: a lost or stuck session.

- **Where.** `src/components/WorkoutSession.tsx`: `sessionComplete`,
  `completing`, `saved`, `saveStatus` (three values or undefined),
  `completionPending` as both a ref and state, `savedWorkoutId` (around lines
  582-587 and 924-947), driven from `handleFinish` and the queue's outcome.
- **States.** Logging, complete and unsaved, saving, saved and synced, saved
  and queued, needs attention, resumed with a save pending.
- **Can hold.** `saved` true with `saveStatus === "needs-attention"`; the ref
  and the state copy of `completionPending` disagreeing.
- **Explicit form.** The run side already has it: one `SaveStatus`, with
  "synced" derived from the durable queue (`src/pages/RunSummary.tsx`). The
  lift finish should read its status the same way. Candidate A5 in the
  architecture report.

### 2. What runs beside the run phase reducer. Risk: a wrong duration, GPS left on.

- **Where.** `src/pages/Run.tsx`: `autoPaused`, the timer's `isRunning`, GPS
  tracking and hold, `watchPhaseRef`, `finishedRef`, `resumedRef`, `arrival`
  (deciding, starting, done), 26 `useState` and 28 effects around one reducer.
- **Can hold.** The reducer in `active` with the timer stopped; the Watch's
  phase differing from the reducer's (synced by hand at six sites).
- **This pass.** `useRunTimer`'s `pause` and `resume` no longer act twice, so
  a second pause cannot bank the same seconds again whatever the caller does.
- **Explicit form.** The reducer's own header says its side effects move
  behind it in a follow-up. Candidate A3.

### 3. A queued write. Risk: a record that never syncs.

- **Where.** `src/lib/offlineQueue.ts` (`QueuedWrite`): `durable`, `encoded`,
  `merge`, `failed`, `refused`, optional `workoutCompletion` and `docId`.
- **Can hold.** `refused` without `failed`; `workoutCompletion` without
  `durable`; `durable` without `docId`.
- **This pass.** The queues now also retry when the app comes back to the
  foreground. Before, a flush that failed while the phone stayed online waited
  for the next write, the next sign-in or a tap on the banner.
- **Explicit form.** A union of entry kinds (best-effort, durable document,
  workout completion) in place of five optional flags.

### 4. Setup's steps. Risk: a stuck last step.

- **Where.** `src/pages/Onboarding.tsx`: `step` (sparse ids shared by five
  tables), `returnToReview`, `saving`, a `pending` ref, six `*Confirmed`
  flags, 49 `useState` in all.
- **Can hold.** A step that is not in the current flow after the activity
  changes; `saving` and the `pending` ref disagreeing.
- **Explicit form.** One reducer over `OnboardingDraft` and a pure module for
  validity and the payload. Candidate A4.

### 5. A food scan. Risk: a stale verdict or a meal logged twice.

- **Where.** `src/components/FoodAnalyzer.tsx` (about 14 flags: `scanLocked`,
  `scanFailure`, `capturedBase64`, `barcodeLoading`, `barcodeError`,
  `saving`, `saved`, a pending-save confirmation) with
  `src/hooks/useFoodAnalysis.ts` and `src/components/FoodCameraModal.tsx`.
- **States.** Camera open, captured, analysing, result being edited,
  confirming a warning, saving, saved, failed (by kind), barcode looking up,
  barcode not found.
- **Can hold.** `saving` and `saved` both true; a barcode error beside a
  barcode result.
- **Explicit form.** One `ScanStage` union held by a reducer; the flags become
  fields of the stage that needs them.

### 6. Checkout and who RevenueCat thinks you are. Risk: money.

- **Where.** `src/lib/purchaseProvider.ts`, `src/lib/revenuecat.ts` (a module
  boolean `configured`), `src/hooks/useRevenueCatIdentity.ts` (a ref and timed
  retries), `src/hooks/useProCheckout.ts` (`loading`, `error`).
- **Can hold.** A purchase sheet opening while RevenueCat is still anonymous;
  a completed purchase without the entitlement reported as "failed".
- **Explicit form.** A purchase outcome union (bought, cancelled, bought and
  not yet entitled, failed) and an identity check before the sheet opens.
  This changes behaviour on the money path, so it is an owner call. Candidate
  A7.

### 7. Email verification. Risk: low.

- **Where.** `src/hooks/useEmailVerificationGate.ts`: each caller holds its own
  `check`, beside `user.emailVerified` (changed in place by `reload`) and the
  token's claim.
- **Explicit form.** One shared store for the check, as `awaitingVerification`
  already is for the count.

### 8. The programme's readiness. Risk: a corrupted plan (it has happened).

- **Where.** `src/features/program/useProgram.ts`: `loading`, `mirrorReady`,
  `loadFailed` projected to `readiness`, and a `programState` that is
  normalised after a load and raw after a mirror tick with no type telling
  them apart.
- **Explicit form.** A read model exposing `stored` and `view` from one
  subscription. Candidate A6.

### 9. Crowded screens. Risk: low; they are slow to change safely.

`src/pages/Food.tsx` (40 `useState`, 15 of them booleans),
`src/components/social/CirclesSection.tsx` (26 and 10),
`src/pages/Program.tsx` (23 and 8), `src/components/social/ActivityCard.tsx`
(13 and 7). Mostly independent open-or-closed flags for sheets, not one
machine. ADR-0001 holds: do not split a page for its length. Where two flags
can never both be true (two sheets over one screen), one union of "which sheet
is open" removes the combination.

## What this pass changed

- **Your own profile at boot** was implicit and is now explicit. `profile ===
null` used to mean both "this account has no profile yet" and "the profile
  could not be read", and the second sent a signed-in person with weeks of
  training to setup, where finishing it replaces their programme
  (`completeOnboarding` sets `programState/current`). A failed read now keeps
  the copy the device already has, or shows a retry screen when it has none.
- **The run timer** refuses a second pause and a resume while running.
- **Queued writes** retry on return to the foreground.
