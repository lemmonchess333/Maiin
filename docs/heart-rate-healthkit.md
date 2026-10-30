# Heart rate and Apple Health workout export

**Implementation status, 30 October 2026:** The phone-led Apple Watch run path is implemented behind `VITE_CONNECTED_TRAINING_ENABLED=true` and a separate native iOS Release flag. Both are off by default until paired-device and HealthKit verification is complete. The product contract and acceptance matrix are in [the connected training proposal](proposals/connected-training.md).

## Live heart rate

- The web app still shows the static five-zone preview from `profile.maxHeartRate` or the age estimate. Browsers do not stream heart rate in this app.
- With Watch runs enabled, the native Watch app reads heart rate during an active phone run. `WatchRun.heartRateSample` carries a session ID, stable sample ID, sample time, and bpm. `heartRateSource.ts` accepts only samples for the current run; `useHeartRate` displays a reading only while it is fresh. No sample means no invented zero or permission verdict.
- The native WatchRun coordinator persists a bounded raw sample backlog in Application Support with iOS file protection. `heartRateSession.ts` keeps only moving-interval timestamps in WebView local storage and merges the protected native backlog at review. Raw beats are cleared on save or discard and are never sent to Firestore or analytics.
- `summarizeHeartRate` weights readings by time within moving intervals, caps each reading at 15 seconds, and excludes pauses and disconnected gaps. The saved summary records average and maximum bpm, coverage, source, the max-HR value used, and actual zone seconds when max HR is known. Average and maximum remain available when it is unknown. A zone chart must stay hidden below 50% moving-time coverage.

## Apple Health write-back

Saving workouts to Apple Health is a separate, default-off choice. The iPhone's `WatchRun` plugin contains the native `HKWorkout` writer; the installed `capacitor-health` package remains the steps reader. The writer exports no GPS route.

`healthWorkoutExport.ts` stages a local intent before an eligible outdoor GPS run enters the phone's durable save queue. The intent alone cannot write a workout: the worker waits for that exact run on the server and checks current server consent. Each explicit opt-in has a consent ID; an intent captured while Settings is loading also requires server proof that opt-in preceded Save. The native writer uses the Tropos run ID and a stable payload revision, and it must verify an existing app-owned workout before reporting success. Deletions stay pending when HealthKit access is unavailable, including if a later build disables new exports. The Settings screen shows pending updates and a retry action. Third-party Health workouts do not grant Tropos plan, streak, challenge, or performance credit under [ADR-0007](adr/0007-healthkit-reconciliation.md).

The exported workout starts at the actual recording start, after GPS acquisition or countdown, and ends when recording stopped. Its duration uses the phone's active timer, excluding pauses. Both values must be present in the server-confirmed run; older documents without an actual recording start do not export by inference from the Start tap or save time. The payload revision and native fingerprint include active duration so a changed duration cannot be mistaken for an already current workout.

The current run detail screen does not edit a saved run's workout time, distance, or energy. A future edit path must stage a durable correction intent before replacing an app-owned Health sample. `deleteLoggedSession` stages a durable Health deletion intent before deleting a run and retries native cleanup after the server confirms that deletion.

## Release gate

The default-off flag remains until a paired iPhone and Watch test proves heart-rate delivery and acknowledged controls with the phone locked, reliable review after process death, and one Health workout and activity-ring contribution when write-back is on. Test write-back off as well: a Watch heart-rate session must leave no saved Health workout. An uninstall/reinstall with an opaque HealthKit read grant can make absence of an old workout impossible to prove; keep export off until that duplicate-prevention case is resolved on devices. Run deletion from web or another device also needs a server tombstone or bounded reconciliation path so the iPhone can remove a previously exported workout. The native target and embedded Watch app must pass signing and installation checks. See [iOS release checks](ios-release.md).
