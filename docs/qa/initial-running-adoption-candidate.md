# Initial running adoption candidate

Inactive backend transaction only. No callable export, activation or live migration.

Explicit `initial-run-walk-v1` confirmation selects 1–3 future dates in the next seven local calendar days. Each generated session is the catalogue's first run/walk session, 29 total minutes including warm-up and cool-down. Dates must be nonconsecutive. Reviewed weekly frequency and duration, clinician limits, current review revision and completed migration all constrain adoption. Any hold blocks the command. Insufficient capacity yields no plan, not a truncated or increased workout.

Only a genuinely empty canonical plan with no race goal is supported. Race goals remain intact and are rejected rather than silently discarded; race-proximity and feasibility policy is still required before race-goal adoption. This is a first-week prescription, not a complete programme or medical clearance. No ongoing progression or next-week scheduling is implied.

The command never reads/copies legacy prescriptions, clears holds, marks activities complete or rewrites history. A transaction creates the fixed private `runningState/initialPlanReceipt` and advances the authority revision with generated sessions. Existing `runningState` rules and account erasure cover this path. Replay returns the prior receipt without restoring later-modified sessions or clearing later holds. Deletion and profile checks precede replay. The current review marker becomes stale after adoption.

Verification: focused deterministic transaction tests cover auth, exact confirmation, capacity, holds, history, dates, revision, replay, deletion and atomic failure. No real emulator concurrency or mounted-client flow has been verified here. Coordinator owns full aggregate gate. Client must preview exact dates and run/walk structure, preserve uncertain submissions for stable replay, and not imply race readiness. Rollout `initialPlanEnabled` remains off/absent by default.

## Accepted scope and outside reports

Adoption now records `acceptedRunWalkStage` on authority and its receipt: version, explicit stage 1, adoption request ID, adopted revision, null race goal and exact session IDs. Null-goal outside reports must match that durable receipt and every accepted session. Later evidence revision bumps are allowed; changed accepted sessions require review. Existing non-null race factual reporting remains compatible but does not gain accepted-stage provenance.

`RunningOutsideTraining` renders only explicit accepted stage-one sessions whose dates have arrived. It uses a real authenticated callable transport, retains a stable command ID for deliberate retries, preserves unknown answers, and refreshes canonical state only after the form validates the durable receipt. It never creates an activity completion or advances a stage. Parent Flow mounting, flags, visual checks, real emulator contention and aggregate verification remain coordinator-owned. Unmounting can still lose an unsaved draft; no background persistence is claimed.
