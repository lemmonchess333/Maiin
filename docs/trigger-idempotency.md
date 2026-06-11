# Firestore trigger idempotency — standing invariant

> **Audit status (D12, 2026-06-11):** all six `onCreate` Firestore triggers in
> `functions/index.js` were audited and confirmed idempotent against
> at-least-once + concurrent delivery. **No gaps were found** — this document
> records the verification and the pattern every _new_ trigger must follow.

## Why this matters

Cloud Functions Firestore triggers are **at-least-once** and **concurrent**:

- The same `onCreate`/`onWrite` can re-fire (retry after a transient failure, or
  Firestore's own redelivery). A handler that does a naïve
  read-`+1`-write **double-counts** on the second delivery.
- Two triggers for the same parent can run **in parallel**. Two naïve
  read-modify-writes read the same `currentValue`, both `+1`, and the second
  write **clobbers** the first (lost update).

`syncChallengeProgress` was fixed **twice** for exactly these two failure
modes — once for the lost-update race (`23369ef`), once for the
double-count-on-retry (`dc3e4a6`). That history is why this is a standing
invariant, not a one-off review note.

## The required pattern for any read-modify-write in a trigger

A trigger that mutates shared state (a counter, an aggregate, a streak) must be
idempotent by **one** of these mechanisms:

1. **Transaction + per-source `applied/<sourceId>` marker.** Do the
   read-modify-write inside `runTransaction`; read a marker doc keyed by the
   _driving activity's id_ in the same transaction and bail if it exists. The
   transaction guards the concurrent lost-update; the marker guards the
   redelivery double-count. Use a **subcollection doc** for the marker (not a map
   field) so it stays bounded for long-running challenges (no 1 MB doc-growth
   footgun).
2. **Recompute-and-set (not increment).** Derive the value from the live source
   of truth and `set` it. A redelivery sets the same observed value instead of
   adding again. Naturally convergent under concurrency — the last writer
   observes the final state.
3. **Deterministic doc id.** When fanning out one source into N derived docs,
   key each derived doc by the source id so a redelivery overwrites the same doc
   instead of appending a duplicate.
4. **MIN/MAX-idempotent.** If the write is `MIN`/`MAX`/`set-to-observed`, a
   replay is a no-op by construction — no marker needed.
5. **Re-read-and-bail guard.** When the trigger _consumes_ the doc that fired it
   (e.g. deletes it), re-read it inside the transaction and bail when it's
   already gone — a redelivery then can't double-apply the side effects.

## The six triggers and how each is covered

| Trigger                         | Mechanism                                                                                                                                                                        | Where                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `onChallengeParticipantCreated` | **Recompute-and-set** — `recomputeParticipantCount` reads `participants.count()` aggregation and `set`s it; redelivery converges                                                 | `index.js:3707`                            |
| `onChallengeParticipantDeleted` | Same `recomputeParticipantCount`                                                                                                                                                 | `index.js:3742`                            |
| `onWorkoutCreated`              | **Transaction + `applied/<sourceId>` marker** (`syncChallengeProgress`); **recompute-idempotent** performance rollup (cooldown-gated); **MAX-idempotent** `applyPartnerActivity` | `index.js:3752`                            |
| `onRunCreated`                  | Same as above + **MIN-idempotent** `syncFastestEffortProgress` (keeps the faster time; replay is a no-op)                                                                        | `index.js:3868`                            |
| `onActivityCreated`             | **Deterministic doc id** fan-out (`fanoutActivityToFeeds`, feed item id = activityId)                                                                                            | `index.js:4580`, `lib/socialFanout.js:151` |
| `onCommentCreated`              | **Re-read-and-bail transaction** — re-reads the comment inside the txn, returns when already gone, so the `commentCount` decrement + audit write can't double-apply              | `index.js:4684`                            |

### Notes per mechanism

- **`syncChallengeProgress`** (`index.js:3546`) — the canonical
  transaction + marker. Marker is `participants/{uid}/applied/{sourceId}`,
  written in the same transaction as the increment. A missing `sourceId` falls
  back to a deterministic key (`<metric>_legacy_nosrc`) so it never silently
  disables the guard.
- **`recomputeParticipantCount`** (`index.js:3707`) — `.count()` aggregation
  keeps it O(1) reads regardless of participant volume; `NOT_FOUND` on a missing
  parent is treated as benign.
- **`fanoutActivityToFeeds`** (`lib/socialFanout.js:151`) — feeds are
  server-only writes, so no reader depends on the previous auto-generated id;
  overwrite-on-replay is safe.
- **`applyPartnerActivity`** (`lib/partnerStreakPersist.js`) — partner-streak
  state is MAX-idempotent with a changed-guard skip; a same-day re-log is a
  no-op write (see the Soc7 QA notes in `CLAUDE.md`).

## Checklist for a NEW trigger

Before adding any `onCreate`/`onWrite` that mutates shared state:

- [ ] Does it do a read-modify-write on a counter/aggregate/streak? If **no**
      (pure side-effect-free read, or write to a doc keyed by the source id),
      you're done — note which.
- [ ] If **yes**, pick a mechanism above and apply it: transaction + marker,
      recompute-and-set, deterministic id, MIN/MAX, or re-read-and-bail.
- [ ] If using a marker, key it by the **driving activity id** and store it as a
      **subcollection doc** in the same transaction.
- [ ] Declare a `maxInstances` cap (`TRIGGER_CAP`) — mandatory on every trigger
      (CLAUDE.md deploy gotchas).
- [ ] Add a comment naming the redelivery + concurrency reasoning, matching the
      existing triggers, so the next reviewer can confirm at a glance.
