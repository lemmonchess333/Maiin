# Running prescription client gate: INACTIVE staging

This is a fail-closed seam, not an activation or a completed authority reader.
`RUNNING_PRESCRIPTION_GATE_ENABLED` is a source constant `false`; the shared
controller has **no production transport**. Existing behavior remains in place.
No cloud endpoint, enrollment, export, account mutation or deployment is added.

## Contract and staged behavior

An injected authenticated server transport accepts
`{expectedUid,supportedSchemaVersions:[1]}` and returns an untrusted response with
`status` (`ready`, `held`, `not_enrolled`, `unavailable`), `accountId`,
`checkedAtMs`, and, where applicable, `schemaVersion`, `revision`, and `authority`.
The controller checks the response envelope, account/schema/revision consistency,
held-session redaction, and freshness. This is not a full canonical-session
validator. Cache snapshots are not an authorized transport implementation.

Every enabled state refuses legacy prescriptions. A `ready` authority remains
separate from legacy `ProgramState` and is **not rendered or launched**. There is
no authority-to-`ScheduledRunDay` adapter and no negotiated legacy fallback.
`not_enrolled`, missing/malformed/unsupported authority, unavailable transport,
errors and offline reads all stay closed. Authentication session identity and
request generations suppress old-account, older refresh, and A-to-B-to-A replies.
Going offline, reconnecting, foregrounding and invalidation discard success.
Cached success expires at one minute and is never saved to browser storage.

## Inactive bundle boundary

The hard source flag lives in `runningPrescriptionFeature.ts`. The lightweight
contract/projection stays synchronous; `useRunningPrescriptionGate` selects a
no-effect inactive hook at module load. Enabled builds lazily import
`runningPrescriptionGateRuntime.ts`, which constructs the controller from
`runningPrescriptionGateController.ts` without a production transport. Pending
or failed chunk loading returns unavailable access, never legacy permission.
Account/offline context is read again after loading before negotiation begins.
The inactive build does not request the runtime or retain the projection body.

## Actual source wiring

- `useProgram` applies the render projection after its existing normalization and
  prescription repair. It covers the cache-first paint and subsequent mirror
  values used by Programme, TrainingPlan, RunSummary and settings consumers.
- `useHomeProgram` has its own Firestore snapshot reader. It applies the same
  projection after its independent shaping path, covering Home, WeekStrip,
  DayPeekCard and the session card's programme input.
- The projection removes forward legacy `runDays`, `runPlan` and the fell-behind
  prompt. Explicit completed, manual-completed, skipped and no-show run-day rows
  remain as history. Planned/unknown rows are never treated as history just
  because their date elapsed. Ease/deload snapshots retain their metadata and
  resolved rows, but omit forward prescriptions; deload lifting fields remain.
  Saved runs, manual completions, lifting workouts and week history are untouched.
  The raw state inside the controller is not replaced by this projection.
- `Run` independently checks the gate, so a URL `template`, `type` or
  `scheduledRunId` cannot restore a prescription. `start=1` becomes a visible
  choice rather than automatic exercise. The restricted setup has no template,
  saved-preference, pace, guided or interval picker.
- Voluntary GPS, manual-distance and treadmill recording remain available with
  no target or plan claim. The start boundary checks that configuration.
  `resume=1` cannot auto-resume a cached prescribed session. Its chooser offers
  explicit continuation without coaching; recorded progress is kept while
  targets, segments and the old plan claim are removed. Session guidance, pace
  display and audio cues are suppressed while the gate is closed.

Legacy generation/maintenance and programme-command writes are deliberately not
frozen. They remain non-authoritative for an enrolled account and must never be
copied into authority as trusted prescriptions. Freezing combined programme
transactions would also break lifting. A future API should keep render views
separate from writable models; do not feed a projected object into `saveProgram`.

## Remaining release blockers and reader gaps

1. No production authenticated negotiation adapter, deployed callable, canonical
   subscription, authority rendering/launch adapter or activation exists.
   Before enabling prescriptions, use a server-confirmed canonical subscription
   with revision invalidation and offline/cache/error fail-closed behavior.
   A one-time `ready` response or the expiry timer is not ongoing authority.
2. `RunPlanSettings` independently builds a preview from profile and draft inputs.
   This patch also skips that generator and its configurePlan apply action when
   enabled, and suppresses generated preview/pace advice while retaining editable
   race, baseline and availability draft fields and Programme navigation. Saving
   any run-plan draft still uses the legacy generator, so it remains disabled
   until an authoritative configuration command is connected.
3. `useWeeklyReview`, `useWeekPulse`, and `useTrainingFuelData` directly read legacy
   programme state. Their history/count/food uses are intentionally unchanged.
   They need a separate authority-consumer audit before any global migration
   claim. A run-day completed only by a separately loaded saved-run claim is not
   inferred complete by this projection; that saved activity remains in history
   and needs explicit reader joining before a canonical plan-history migration.
   Profile-derived race/starter suggestions and cached in-flight titles are not
   proof of a server-approved prescription.
4. Onboarding previews, notifications, Watch/Health integrations, stale service
   worker bundles and other installed clients have not been proved authority
   safe by this patch. No minimum-version inventory or remote kill-switch
   guarantee is claimed. An unmodified old binary with cached/offline data cannot
   be remotely controlled by this new client gate or Firestore rules.
5. No browser, emulator, live-account, multi-device or full aggregate verification
   was performed here. The integrator owns full verification after cherry-pick.

## Focused proof

The pure controller tests cover inactive identity/no transport, pending/missing
transport, malformed/unknown/stale envelopes, holds, no legacy fallback, expiry,
account/session changes, delayed A-to-B-to-A replies, disconnect/reconnect and
failed refresh. Mounted hook tests exercise auth, online/offline and delayed
account-switch responses. Actual reader tests hold the server read open while
cached prescriptions arrive in `useProgram`, and deliver a cached snapshot to
Home's separate hook. Real Run page tests cover all shortcut families, blocked
auto-resume, and voluntary treadmill recording through save with no plan claim.
The settings test also proves the legacy generator is never called while gated,
its apply button cannot dispatch, and race draft edits/navigation still work.
Existing writer and Run/navigation/recording/launch tests cover inactive behavior.
This is not a universal client or old-binary safety proof.
