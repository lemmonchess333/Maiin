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
