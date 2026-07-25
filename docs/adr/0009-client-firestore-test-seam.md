---
Status: accepted
---

# One Firestore fake, not a stub per suite — and injecting the `db` handle buys nothing

## Context

Tropos has ~29 hooks that read or write Firestore. Roughly half had no test
at all, and the half that did each carried its own inline
`vi.mock("firebase/firestore", () => ({ … }))` factory — twenty-three of
them at the time of writing, each a slightly different partial reimplementation
of the SDK.

The cost is not the duplication. It is what the duplication forces a test to
assert. A stub that returns a fixed array cannot answer "did the query return
the right documents?", only "was a `limit(50)` object constructed?" So suites
drift toward asserting on the shape of the arguments handed to their own
stub — a tautology, since the same file defines both sides. The pre-existing
`useWorkouts.test.tsx` was the clearest case: it mocked the SDK _and_
`offlineQueue`, `workoutBurn` and `dateHelpers`, leaving nothing of the hook
running except the code that assembled constraint objects.

The second-order effect was worse than the first. Because each new hook test
began with ~50 lines of bespoke stubbing, "no test" was the cheapest option
at every decision point, and the gap grew quietly for a year.

### The obvious answer, and why it is wrong

The textbook fix for "hard to test because of a hard-wired dependency" is
dependency injection: stop importing the `db` handle, take it as a parameter
or read it from a provider, and pass a fake in tests.

Here it buys nothing. The Firebase v9 modular SDK is built from **free
functions**, not handle methods — `getDocs(query(collection(db, …)))`, never
`db.collection(…).get()`. The `db` handle is an inert token threaded through
to the SDK. Confirming this empirically: of the twelve suites that already
mock `@/lib/firebase`, **eleven pass a literal `{}`** and are entirely
unaffected. Injecting a handle nobody calls methods on would add a seam
across every hook signature and change nothing about what a test can assert.

The dependency that actually needs replacing is the **module**, not the
handle. So the seam belongs at the module boundary.

## Decision

**One fake `firebase/firestore` module, resolved by a bare `vi.mock`, driven
through a harness of seed/read helpers.**

    src/test/firestoreFake.ts       — the engine: an in-memory document store
    __mocks__/firebase/firestore.ts — the SDK-shaped surface over it
    src/test/firestoreHarness.ts    — seed / read / fail-injection helpers

A suite writes `vi.mock("firebase/firestore")` with **no factory**; Vitest
resolves node-module mocks from a root-level `__mocks__` directory. Data goes
in via `seedFirestore({ "users/u1/meals/m1": {…} })` and comes back out via
`readDoc(path)` / `allPaths()` / `writeLog()`.

Three properties make this worth more than the stubs it replaces:

- **It is a store, not a script.** Queries actually filter, order and limit;
  writes actually mutate; `onSnapshot` actually re-fires. A test can therefore
  assert on outcomes ("fifty workouts came back, newest first") rather than on
  call shapes.
- **It composes through the app's own layers.** `useWeeklyReview` calls
  `fetchBodyweightLogs` from `@/lib/api`, and `useWorkouts` writes through
  `safeMerge` in `@/lib/offlineQueue`. Neither needs its own mock — they read
  Firestore through the same SDK, so mocking it once covers them, and the
  guarded-write and offline-queue paths get exercised for real instead of
  being stubbed out.
- **Failure is a store operation.** `failNextFirestore("getDocs", { code })`
  arms a `FirebaseError`-shaped rejection at a chosen entry point. It lives
  in the fake rather than as a `vi.fn()` spy on the mock's exports so that
  after an injected error the documents are untouched — exactly as a rejected
  call leaves them. `unfiredFailures()` lets a test prove the failure it armed
  actually fired, rather than silently exercising the happy path.

### Fidelity is bounded, and the boundary is stated

The fake is "faithful enough for the queries this app writes", not a Firestore
reimplementation. Known and deliberate gaps: transactions run their callback
once with no contention or retry; there are no security rules, so a test
cannot prove a rule (that is the emulator's job in `*.rules.test.ts`); and
composite-index requirements are not modelled. When a hook needs behaviour the
fake lacks, the rule is **extend the fake**, never add a local factory beside
it — two disagreeing Firestores are worse than one imperfect one.

### A seam that only makes testing possible does not close a gap

`src/hooks/__tests__/firestoreHookCoverage.test.ts` converts the possibility
into a default. A hook that touches Firestore must have a sibling test or
carry an `@untested: <reason>` marker, with the exempt set pinned in a
**delete-only** list. It checks honesty in both directions — a marker left on
a hook that has since gained a test is a lie in the direction that rots
quietly — and it holds a second delete-only list of suites still carrying
inline factories, so the pattern cannot spread while they are migrated.

This mirrors the reachability gate from ADR-0008 deliberately. Both encode
the same lesson from the same audit: a discipline enforced by convention
decays, and one enforced by a test that names its own exceptions does not.

## Consequences

- Hook tests start at zero setup cost, which is the point — the reason the
  gap existed is gone, and the gate stops it reopening.
- Fourteen hooks remain exempt with named reasons. Two (`useMealReminders`,
  `useWorkoutReminders`) are blocked on a _notifications_ seam, not this one;
  the rest are plain gaps now unblocked.
- Twenty-two suites still carry inline factories. Migrating them is real work
  — their assertions are shaped around their own stubs' quirks — and belongs
  in follow-up PRs, one cluster at a time. `useWorkouts.test.tsx` was migrated
  here as the worked example: its three genuine contracts (recent coverage is
  bounded to 50, complete coverage is not, an account switch cannot leak) now
  assert on returned documents instead of on constructed constraint objects.
- The fake is load-bearing, so it is itself tested
  (`src/test/__tests__/firestoreFake.test.ts`), including the `__mocks__`
  resolution — the part a future reader is most likely to doubt.

## Alternatives considered

**The Firestore emulator for unit tests.** It is the real implementation, so
fidelity is exact and rules are enforced. Rejected for this layer: it needs a
running process, costs seconds per suite rather than milliseconds, and cannot
run in the agent sandbox. It remains correct — and already used — for the
rules tests, where the thing under test _is_ the rules.

**Injecting the `db` handle.** Rejected above: the modular SDK's free-function
design means the handle is inert, and eleven of twelve existing suites already
prove it by passing `{}`.

**A shared stub factory (`makeFirestoreMock()`) instead of a fake.** Cheaper
to write, but it preserves the defect: a factory returns canned responses, so
tests still assert on calls rather than on data. The duplication was the
symptom; the inability to observe outcomes was the disease.
