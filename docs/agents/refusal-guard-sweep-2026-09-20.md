# Refusal-guard sweep, re-run with the emulators up (2026-09-20)

A previous sweep disabled each refusal guard in `functions/` in turn and re-ran
the covering tests. It reported **483 survivors**, and two real findings came
out of it. The survivor list itself was not trustworthy, because the sweep ran
**without the Firestore emulator**: the files under `functions/__tests__/integration/`
`describe.skip` when `FIRESTORE_EMULATOR_HOST` is unset, so any guard whose only
coverage lived there read as a survivor.

This document is the re-derivation with the emulators running, and the triage of
what it turned up. The harness is described well enough to re-run; the numbers
are all measured, and where a number is a floor rather than a point estimate it
says so.

---

## 1. The premise was right, and understated — there are five gates, not one

The emulator gate is the one the original sweep missed. Looking for it turned up
four more, two of which are **still shut** under the command normally used to
open the first one.

| gate                                                        | what it hides                                           | opened by                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `functions/__tests__/integration/*` (17 files)              | 99 tests                                                | `FIRESTORE_EMULATOR_HOST`                                                                   |
| `functions/__tests__/commentEmailVerificationGate.test.js`  | an 18th emulator-gated file, **outside** `integration/` | `FIRESTORE_EMULATOR_HOST`                                                                   |
| `functions/__tests__/integration/commentBoundary.test.js`   | 9 tests                                                 | **also** needs `FIREBASE_AUTH_EMULATOR_HOST` — `--only firestore` leaves it skipped         |
| `functions/__tests__/integration/workoutCorrection.test.js` | 3 tests                                                 | gates on the **literal** `"127.0.0.1:8080"`, so it skips on any other port                  |
| `firestore.collectionGroup.test.ts` (src side)              | 11 rules tests                                          | needs an emulator **and** no `deny-unit-network` guard — so `npm run test` can never run it |

Consequences worth carrying:

- **The true functions-side baseline is 1496 passed / 0 skipped**, not the
  1489 / 9 that `--only firestore` produces. The 9 are `commentBoundary`,
  which needs the Auth emulator as well:

  ```
  firebase emulators:start --only firestore,auth --project demo-tropos
  ```

- **`workoutCorrection.test.js` only ever runs on the default port.** Any
  developer or job that moves the Firestore emulator loses those 3 tests with
  no signal. This sweep had to run them in a separate serial lane on 8080.

- **`npm run test` cannot run the 11 emulator-gated rules tests even with an
  emulator up.** Measured: through `scripts/run-unit-tests.mjs` they report as
  _skipped_; the same files under plain `vitest` with the same env run 11/11.
  The cause is `scripts/deny-unit-network.cjs`, which `run-unit-tests.mjs`
  injects via `NODE_OPTIONS`. That is by design for the unit job — but it means
  a src-side guard can only be exercised by `npm run test:rules`, and a sweep
  that shells out to `npm run test` will call it unheld.

---

## 2. Corrected numbers

The unit of mutation is one **branch** of a refusal condition, plus one unit
for the whole guard. Neutralising a single disjunct of `if (a || b || c) throw`
is what the two shipped findings were about; neutralising the whole condition
is what the `rateLimiter` example in the brief was.

|                                                | count    |
| ---------------------------------------------- | -------- |
| refusal guards in `functions/`                 | **577**  |
| mutation units (guards + individual branches)  | **1089** |
| caught by the functions suite, emulators up    | **368**  |
| caught **only** by the `src/` mirror           | **63**   |
| caught only because removal fails to terminate | **1**    |
| **survivors — nothing on either side**         | **657**  |

Survivors by file, top of the list:

| count | file                         |
| ----- | ---------------------------- |
| 283   | `index.js`                   |
| 29    | `profileSanitizer.js`        |
| 28    | `lib/pushTokenOwnership.js`  |
| 23    | `appleIAP.js`                |
| 23    | `lib/workoutCorrections.js`  |
| 17    | `lib/spacePostEngagement.js` |
| 12    | `lib/goalSpaceCheckIn.js`    |
| 12    | `lib/socialCounters.js`      |

**134 of the 657 are guards whose line no functions-side test even evaluates.**
`index.js` dominates because its ~55 callables and triggers carry per-request
validation (`req.method !== "POST"`, `!context.auth`, and two rate-limit
`limited` checks) that the unit suite never reaches.

The `caught` row is the one being re-run serially (§6) — it is the direction
that can be wrong, and each false _caught_ moves a unit into the survivor
column. **657 is therefore a floor.**

**61–63 units are caught only from `src/`.** A functions-only sweep calls every
one of them a survivor. This is the standing "the tested copy does not prove the
running copy" rule running in the direction that _invents_ work rather than the
direction that hides it, and it is the single largest correction here.

---

## 3. How it was run

```bash
# both emulators — firestore alone leaves commentBoundary's 9 tests skipped
firebase emulators:start --only firestore,auth --project demo-tropos

# the whole functions suite, ~55s
cd functions && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  GCLOUD_PROJECT=demo-tropos npx vitest run
```

Targeting is **coverage-guided**: each test file was run once under
`--coverage.provider=v8` and the executed line numbers recorded per file, so a
mutation at `file:line` runs only the test files that actually _evaluate_ that
line. Three escape routes from that reduction were enumerated and closed by
always including the relevant files: the 14 tests that read source **text**, the
one test with a **non-literal `require`**, and the port-locked file above.

Soundness was checked rather than assumed — 44 units were re-run against the
**whole** suite. See §6 for what that check found, which is not nothing.

---

## 4. The two-branch shape

The brief's shape — _a refusal with two or more branches where every existing
rejection test reaches the verdict through a different branch, so the branches
are indistinguishable_ — is detectable directly: a multi-branch guard whose
**whole-guard** mutation is caught but at least one of whose **branches** is not.

**50 guards match.** Four are fixtured below. The rest are listed in §7 with a
one-line reason, so the next sweep does not re-litigate them.

Two caveats on that count. Guards are grouped by their source text, so two
distinct guards with identical text (`performanceEngine.js:324`'s
`if (d < start || d >= end) return;` occurs twice) collapse into one row with
duplicated branches. And the count is over guards, not defects: most of the 50
are redundant by construction.

---

## 5. Findings — four guards where removing a branch changes the answer

Each was mutation-proved against the **full** functions suite with both
emulators up: red with the branch neutralised, green with it restored, and no
other test moving either way. The suite goes 1496 → 1509 tests.

### 5.1 `acquireSendLease` — a non-owner could take a send lease

`lib/pushTokenOwnership.js:522`

```js
if (
  !isCanonicalClaim(claim) ||
  claim.get("uid") !== uid ||
  claim.get("bindingId") !== bindingId ||
  activeSendLease(claim, nowMs)
)
  return null;
```

Three of the four branches survived. The reason is worth reading, because the
suite _looks_ like it covers them: the existing test is named **"acquires a
lease only for the canonical owner + binding, and blocks a second lease"**, and
its third assertion is a wrong-`bindingId` call expected to return `null`. But
that call runs _after_ a lease has already been taken on `BIND_A`, so
`activeSendLease` is true and the refusal never reaches the `bindingId`
comparison. The uid check has no case at all.

Seeded with a claim that has **no** live lease, the surviving branches are the
only thing that can refuse. Without them a different uid takes a send lease on
another account's push-token claim.

Mutation evidence (each row is a full-suite run, both emulators up):

| mutation                                         | result                                              |
| ------------------------------------------------ | --------------------------------------------------- |
| baseline                                         | 1500 passed, 0 failed                               |
| `!isCanonicalClaim(claim)` → `false`             | 1 failed — the new revoked-claim test, nothing else |
| `claim.get("uid") !== uid` → `false`             | 1 failed — the new non-owner test, nothing else     |
| `claim.get("bindingId") !== bindingId` → `false` | 1 failed — the new wrong-binding test, nothing else |
| restored                                         | 1500 passed, 0 failed                               |

### 5.2 `assertCanInteractWithActivity` — `private` was enforced by one disjunct

`lib/activityAccess.js:49`

```js
if (
  activity.visibility !== "followers" ||
  typeof activity.authorId !== "string" ||
  activity.authorId.length === 0
)
  throw notAccessible();
```

This is the same guard the _previous_ sweep's fixture was written for — it
added the case for the second disjunct. The **first** disjunct is what enforces
`private`, and it was still unheld: `"rejects a stranger on a private activity"`
gives mallory no follower doc, so deleting the disjunct still refuses them one
branch later at `!followerSnap.exists`.

The case the stranger test cannot see is a **real follower on a private
activity**. Without the disjunct, a private activity falls through to the
follower lookup, and anyone the author has accepted can kudos and comment on a
post the author chose not to share with them.

| mutation                                        | result                                  |
| ----------------------------------------------- | --------------------------------------- |
| baseline                                        | 1506 passed, 0 failed                   |
| `activity.visibility !== "followers"` → `false` | 2 failed — both new tests, nothing else |
| the whole 3-disjunct condition → `false`        | 2 failed — both new tests, nothing else |
| restored                                        | 1506 passed, 0 failed                   |

### 5.3 `shouldRecommendDeload` — none of the three PI floors was held

`lib/perfScoring.js:190,199,205`. All three triggers read
`currentPI >= N && <something bad>`, and every existing case drives the
_something bad_ side while sitting exactly **on** the floor
(`shouldRecommendDeload(80, 40, 70, null)`, `(70, 70, 40, null)`). So the floors
were never the reason for any verdict.

The floors are what stop a deload being recommended to someone who is barely
training. Without them a light-trainer week — low load, poor sleep — is told to
back off, which is the wrong advice for an athlete whose load is already low.
CLAUDE.md treats light-trainers as a real segment rather than an edge case.

| mutation                   | result                                          |
| -------------------------- | ----------------------------------------------- |
| baseline                   | 1506 passed, 0 failed                           |
| `currentPI >= 80` → `true` | 1 failed — the new low-load/poor-recovery test  |
| `currentPI >= 85` → `true` | 1 failed — the new dropped-back-off test        |
| `currentPI >= 70` → `true` | 1 failed — the new low-load/poor-adherence test |
| restored                   | 1506 passed, 0 failed                           |

The client mirror `src/lib/performanceEngine.ts` carries the same three floors;
this fixture pins the server copy, which is the one ADR-0008 asks for.

### 5.4 `removeGoalSpaceMember` — the owner's own removal path

`lib/goalSpaceMembership.js:304`

```js
if (typeof memberUid !== "string" || memberUid === uid)
  throw invalid - argument;
```

Neither branch was reached: `"remove is owner-only"` is refused by the later
`space.ownerId !== uid` check, and every accepting call names another member.
Deleting the whole line left the file green.

`memberUid === uid` keeps the owner out of the removal path. Leaving is
`leaveGoalSpace`, which sets `active = false` when the owner goes. Removal does
not. So an owner who removed **themselves** would drop their member doc, their
journey link and the member count while the circle stayed _active_ with
`ownerId` naming someone no longer in it — and since removal is owner-only,
nobody could ever be removed again. The circle would be unreachable rather than
closed.

| mutation                                  | result                               |
| ----------------------------------------- | ------------------------------------ |
| baseline                                  | 1509 passed, 0 failed                |
| `typeof memberUid !== "string"` → `false` | 1 failed — the new non-string test   |
| `memberUid === uid` → `false`             | 1 failed — the new self-removal test |
| the whole condition → `false`             | 2 failed — both, nothing else        |
| restored                                  | 1509 passed, 0 failed                |

---

## 6. What the soundness check found — and the flakiness underneath it

44 units (30 survivors, 14 caught) were re-run against the **whole** suite.
**7 disagreed.** Re-running those 7 **serially** resolved all of them, and the
answer is in two parts:

- **5 were flakes in the check, not in the sweep.** Running four full suites
  concurrently on a 4-core box makes emulator-backed integration tests fail;
  `integration/activityDeleteReversal.test.js` is the usual actor. Serially,
  all 5 matched the sweep. So the coverage-guided targeting was right.
- **2 were flakes in the sweep.** `profileSanitizer.js:261` and `:263` were
  recorded as _caught_, but both the concurrent and the serial full run say
  they survive. In both cases the stage-1 failure was blamed on
  `activityDeleteReversal.test.js` — a test with nothing to do with profile
  sanitisation.

That second bucket means the sweep's _caught_ verdicts can be false, so the
survivor count is a **floor**, not a point estimate. Every caught verdict is
therefore being re-run serially; the number in §2 reflects that pass.

This matches what CLAUDE.md already says about `unit-shuffle` — "the job is not
deterministic" — and extends it: the non-determinism is **load-sensitive**, not
only order-sensitive, and it shows up as a single unrelated integration test
failing.

---

## 7. Survivors that are genuinely redundant

Listed so the next sweep does not re-litigate them. Each was read, not guessed.

| guard                                                                          | why removing it changes nothing                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/fastestEffortRebuild.js:62` `runSeconds <= 0`                             | `current > 0` is guaranteed three lines above, so any `runSeconds <= 0` also satisfies the `runSeconds <= current` return below it. Same answer either way.                                                                        |
| `lib/perfScoring.js:200` `previousWeekPI != null`                              | `null >= 85` and `undefined >= 85` are both `false`, so the following `previousWeekPI >= 85` already rejects the absent case.                                                                                                      |
| `lib/socialCounters.js:208` `!data`                                            | dominated by `if (!commentSnap.exists) throw` two lines above; a document that exists always has `data()`.                                                                                                                         |
| `lib/spacePostEngagement.js:169` `!data`                                       | same shape, same file position, same reason.                                                                                                                                                                                       |
| `lib/raceDayCompletion.js:155` `savedRunsForDate.length === 0`                 | an empty array makes the `for` body never run, and the function returns `false` regardless.                                                                                                                                        |
| `lib/activityAccess.js:40` `!activitySnap.exists`                              | falls through to `activity = {}` and is refused by the visibility disjunct with the _same_ `activity-not-accessible` code. Worth keeping for the read it avoids, but it is not distinguishable by behaviour.                       |
| `lib/blockGuard.js:40-41` `typeof ownerUid/actorUid !== "string"`, `!ownerUid` | these are fail-**open** normalisations in front of a fail-**closed** read. Removing one makes the guard refuse _more_ (a malformed uid throws inside the `try` and returns `true`), never less — so no interaction is let through. |

---

## 8. Limits of this sweep

- **Caught verdicts are less reliable than survivor verdicts.** See §6. The
  survivor count is a floor.
- **Branch neutralisation is not deletion.** A `||` branch is replaced by
  `false` and an `&&` branch by `true`. For a conjunctive guard that _widens_
  the refusal rather than removing it, so those units answer "does anything pin
  that this guard is not over-broad?" — a different and weaker question than
  the disjunctive case.
- **Guards are grouped by source text**, so two identical guards in one file
  collapse into a single row (§4).
- **Only `functions/` was mutated.** The client mirrors in `src/` were run as
  _detectors_, never mutated, so this says nothing about whether a client copy
  is itself pinned.
- **`lib/pathFilterMatcher.js` has no functions-side test at all** — its 13
  units are held entirely from `src/`, including by
  `firestore.collectionGroup.test.ts`, which `npm run test` cannot run (§1).
