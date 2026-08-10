/**
 * Firestore test harness (ADR-0009) — the ergonomics layer.
 *
 * Usage in a hook/component test:
 *
 *   vi.mock("firebase/firestore");            // ← bare; resolves to __mocks__
 *   vi.mock("@/lib/firebase", () => ({ db: {} }));
 *
 *   import { seedFirestore, resetFirestore, flushSnapshots } from "@/test/firestoreHarness";
 *
 *   beforeEach(() => resetFirestore());
 *   seedFirestore({ "users/u1/meals/m1": { foodName: "Eggs", calories: 200 } });
 *
 * Do NOT add another inline `vi.mock("firebase/firestore", () => ({...}))`.
 * The whole point of ADR-0009 is that there is exactly one fake; if it's
 * missing behaviour your hook needs, extend `firestoreFake.ts`.
 */
import { act } from "@testing-library/react";
import { firestoreFake, type FailOp } from "./firestoreFake";

/** Wipe all documents, listeners and the write log. Call in `beforeEach`. */
export function resetFirestore(): void {
  if (firestoreFake.armedFailures.length > 0) {
    console.error("UNFIRED_FAILURE " + JSON.stringify(firestoreFake.armedFailures));
  }
  firestoreFake.reset();
}

/**
 * Seed documents by full path:
 *   { "users/u1": {...}, "users/u1/meals/m1": {...} }
 * Paths must have an EVEN number of segments (they address documents).
 */
export function seedFirestore(
  tree: Record<string, Record<string, unknown>>
): void {
  for (const path of Object.keys(tree)) {
    if (path.split("/").length % 2 !== 0) {
      throw new Error(
        `[firestoreHarness] "${path}" has an odd segment count — that's a ` +
          `COLLECTION path. Seed documents, e.g. "users/u1/meals/m1".`
      );
    }
  }
  firestoreFake.seed(tree);
}

/**
 * Let queued `onSnapshot` callbacks land and React re-render.
 *
 * The fake coalesces notifications into a microtask (so one batch commit is
 * one snapshot, as in real Firestore), which means a listener fires AFTER
 * the synchronous part of `renderHook`. Await this before asserting.
 */
export async function flushSnapshots(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Make the next matching Firestore call fail.
 *
 *   failNextFirestore("getDocs");                                // any read
 *   failNextFirestore("setDoc", { path: "users/u1", code: "unavailable" });
 *
 * The failure surfaces as a `FirebaseError`-shaped rejection carrying `.code`,
 * which is what hooks branch on. Use this instead of spying on the SDK mock's
 * exports — they are plain functions, not `vi.fn()`s, precisely so a suite
 * can't swap out one operation and leave the store disagreeing with it.
 */
export function failNextFirestore(
  op: FailOp,
  opts: { path?: string; code?: string; times?: number } = {}
): void {
  firestoreFake.failNext(op, opts);
}

/**
 * Failures armed but never triggered — assert this is empty when a test
 * depends on the failure having actually fired (a typo'd path otherwise
 * makes the "handles the error" test silently exercise the happy path).
 */
export function unfiredFailures(): readonly { op: FailOp; path?: string }[] {
  return firestoreFake.armedFailures;
}

/**
 * Seed the IndexedDB cache only. These documents answer
 * `getDocFromCache` and are INVISIBLE to every server read, so a test can
 * model "cached locally, server slow or unreachable" — the case a
 * cache-first paint exists for.
 *
 * The cache stays COLD by default; without this the fake rejects with
 * `unavailable`, exactly as the real SDK does for an uncached document.
 *
 *   seedCache({ "users/u1/programState/current": { weekNumber: 3 } });
 *   deferReads();   // server read never answers
 *   // → the hook still paints from cache
 */
export function seedCache(tree: Record<string, Record<string, unknown>>): void {
  firestoreFake.seedCache(tree);
}

/** Read a document straight out of the store, for assertions. */
export function readDoc(path: string): Record<string, unknown> | undefined {
  return firestoreFake.peek(path);
}

/** Every stored document path, sorted — for "did it write where I expect?". */
export function allPaths(): string[] {
  return firestoreFake.paths();
}

/**
 * The ordered write log: `{ op, path, data }` per mutation.
 * Lets a test assert HOW something was written (merge vs overwrite, field
 * sentinels) without reaching into the SDK mock.
 */
export function writeLog(): readonly {
  op: string;
  path: string;
  data?: unknown;
}[] {
  return firestoreFake.writes;
}

/**
 * One entry per COMMITTED batch, holding that batch's writes.
 *
 * `writeLog()` flattens everything, so it cannot answer "did these land
 * together?" — the property a `writeBatch` caller actually promises. A
 * batch whose commit fails contributes NO entry, since the fake applies
 * nothing on a failed commit.
 */
export function batchLog(): readonly {
  op: string;
  path: string;
  data?: unknown;
}[][] {
  return firestoreFake.batches;
}

/**
 * Every read issued since the last reset, in order.
 *
 * For asserting a gated hook did NOT touch Firestore. "active === false"
 * only proves the RESULT was suppressed; it can't distinguish a hook that
 * skipped the read from one that paid for it and threw the answer away —
 * and on a per-read-priced database those are different bugs.
 */
export function readLog(): readonly { op: string; path: string }[] {
  return firestoreFake.reads;
}

/** Reads issued against `path` (exact match). */
export function readsAt(path: string): readonly { op: string; path: string }[] {
  return firestoreFake.reads.filter((r) => r.path === path);
}

/* ── deferred reads ────────────────────────────────────────────────── */

/**
 * Hold every subsequent read open so the test chooses the order they
 * resolve in.
 *
 * For account-switch races: user A's in-flight read resolving AFTER the
 * switch to B, and overwriting B's rows with A's. Both reads succeed, so
 * nothing throws and nothing logs — the user just sees someone else's
 * data. A fake that always resolves immediately cannot produce that
 * interleaving, so the bug is untestable without this.
 *
 *   deferReads();
 *   // ... render as A, switch to B — two reads now pending
 *   releaseRead(1);   // B answers first
 *   releaseRead(0);   // A answers LATE and must not win
 */
export function deferReads(): void {
  firestoreFake.deferReads();
}

/** Stop holding NEW reads. Already-held ones stay held. */
export function resumeReads(): void {
  firestoreFake.resumeReads();
}

/** Paths of the reads currently held, in the order they were issued. */
export function pendingReads(): readonly string[] {
  return firestoreFake.pendingReads;
}

/**
 * Release one held read by position in issue order (default: oldest).
 * Returns false if nothing is at that index — assert on it, so a test
 * can't claim an interleaving that never happened.
 */
export function releaseRead(index = 0): boolean {
  return firestoreFake.releaseRead(index);
}

/**
 * Fail one held read instead of answering it (default: oldest). Returns
 * false if nothing is at that index — assert on it, same as `releaseRead`.
 *
 * `failNextFirestore` cannot do this: it fires at ISSUE time, so the read
 * rejects immediately and is never held. Use this for the late-failure
 * ordering — account A's read still in flight across a switch to B, then
 * failing — where a stale rejection handler can clear B's state.
 *
 *   deferReads();
 *   // render as A, switch to B
 *   releaseRead(1);   // B answers
 *   rejectRead(0);    // A fails LATE and must not clear B
 */
export function rejectRead(index = 0, code = "unavailable"): boolean {
  return firestoreFake.rejectRead(index, code);
}

/** Release everything still held, oldest first. */
export function releaseAllReads(): void {
  firestoreFake.releaseAllReads();
}
