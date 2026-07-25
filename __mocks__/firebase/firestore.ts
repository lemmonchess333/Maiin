/**
 * `firebase/firestore` — the ONE mock (ADR-0009).
 *
 * Vitest resolves `vi.mock("firebase/firestore")` with no factory to this
 * file (node-module mocks live in a `__mocks__` folder adjacent to
 * `node_modules`). Every suite that needs Firestore should use the bare
 * form and drive data through `src/test/firestoreHarness.ts` — NOT write
 * another inline factory.
 *
 * This file is only the SDK-shaped surface; all behaviour lives in
 * `src/test/firestoreFake.ts`, which is plain TS and independently tested.
 */
import {
  firestoreFake,
  sentinels,
  FakeTimestamp,
  type CollectionRef,
  type Constraint,
  type DocRef,
  type WhereOp,
  isDocRef,
} from "../../src/test/firestoreFake";

/* ── refs ──────────────────────────────────────────────────────────── */

/** `collection(db, "users", uid, "meals")` — the leading db arg is inert. */
export function collection(_db: unknown, ...segments: string[]): CollectionRef {
  const path = segments.join("/");
  return {
    __kind: "collection",
    path,
    id: segments[segments.length - 1],
    constraints: [],
  };
}

export function collectionGroup(_db: unknown, id: string): CollectionRef {
  return { __kind: "collection", path: id, id, group: true, constraints: [] };
}

export function doc(dbOrCollection: unknown, ...segments: string[]): DocRef {
  // Two call shapes: doc(db, "users", uid) and doc(collectionRef[, id]).
  if (
    dbOrCollection &&
    (dbOrCollection as CollectionRef).__kind === "collection"
  ) {
    const parent = dbOrCollection as CollectionRef;
    const id = segments[0] ?? firestoreFake.nextId();
    return { __kind: "doc", path: `${parent.path}/${id}`, id };
  }
  const path = segments.join("/");
  return { __kind: "doc", path, id: segments[segments.length - 1] };
}

/* ── query building ────────────────────────────────────────────────── */

export function query(ref: CollectionRef, ...cs: Constraint[]): CollectionRef {
  return { ...ref, constraints: [...ref.constraints, ...cs.filter(Boolean)] };
}

export function where(field: string, op: WhereOp, value: unknown): Constraint {
  return { kind: "where", field, op, value };
}

export function orderBy(
  field: string,
  dir: "asc" | "desc" = "asc"
): Constraint {
  return { kind: "orderBy", field, dir };
}

export function limit(count: number): Constraint {
  return { kind: "limit", count };
}

export function startAfter(cursor: unknown): Constraint {
  return { kind: "startAfter", cursor };
}

export function documentId(): string {
  return "__name__";
}

/* ── reads ─────────────────────────────────────────────────────────── */

export async function getDoc(ref: DocRef) {
  firestoreFake.failIfArmed("getDoc", ref.path);
  return firestoreFake.docSnap(ref);
}

export async function getDocs(ref: CollectionRef) {
  firestoreFake.failIfArmed("getDocs", ref.path);
  return firestoreFake.querySnap(ref);
}

export async function getCountFromServer(ref: CollectionRef) {
  const snap = firestoreFake.querySnap(ref);
  return { data: () => ({ count: snap.size }) };
}

/**
 * Live listener. Supports both call shapes the app uses:
 *   onSnapshot(ref, next, error?)
 *   onSnapshot(ref, { next, error })
 */
export function onSnapshot(
  ref: DocRef | CollectionRef,
  a: unknown,
  b?: unknown
): () => void {
  const next =
    typeof a === "function"
      ? (a as (snap: unknown) => void)
      : ((a as { next?: (s: unknown) => void })?.next ?? (() => {}));
  const onError =
    typeof b === "function"
      ? (b as (e: unknown) => void)
      : (a as { error?: (e: unknown) => void })?.error;

  return firestoreFake.addListener({
    ref,
    fire: () => {
      try {
        firestoreFake.failIfArmed("onSnapshot", ref.path);
        next(
          isDocRef(ref)
            ? firestoreFake.docSnap(ref)
            : firestoreFake.querySnap(ref)
        );
      } catch (err) {
        onError?.(err);
      }
    },
  });
}

/* ── writes ────────────────────────────────────────────────────────── */

export async function setDoc(
  ref: DocRef,
  data: Record<string, unknown>,
  opts?: { merge?: boolean }
): Promise<void> {
  firestoreFake.failIfArmed("setDoc", ref.path);
  firestoreFake.setDoc(ref, data, opts);
}

export async function addDoc(
  ref: CollectionRef,
  data: Record<string, unknown>
): Promise<DocRef> {
  firestoreFake.failIfArmed("addDoc", ref.path);
  const id = firestoreFake.nextId();
  const docRef: DocRef = { __kind: "doc", path: `${ref.path}/${id}`, id };
  firestoreFake.setDoc(docRef, data);
  return docRef;
}

export async function updateDoc(
  ref: DocRef,
  data: Record<string, unknown>
): Promise<void> {
  firestoreFake.failIfArmed("updateDoc", ref.path);
  firestoreFake.updateDoc(ref, data);
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  firestoreFake.failIfArmed("deleteDoc", ref.path);
  firestoreFake.deleteDoc(ref);
}

/**
 * Transactions run the callback ONCE against live data — enough to exercise
 * read-modify-write logic. Contention/retry is deliberately not simulated;
 * a test that needs it should say so explicitly rather than rely on the fake.
 */
export async function runTransaction<T>(
  _db: unknown,
  fn: (tx: {
    get: (ref: DocRef) => Promise<ReturnType<typeof firestoreFake.docSnap>>;
    set: (
      ref: DocRef,
      data: Record<string, unknown>,
      opts?: { merge?: boolean }
    ) => void;
    update: (ref: DocRef, data: Record<string, unknown>) => void;
    delete: (ref: DocRef) => void;
  }) => Promise<T>
): Promise<T> {
  return fn({
    get: async (ref) => firestoreFake.docSnap(ref),
    set: (ref, data, opts) => firestoreFake.setDoc(ref, data, opts),
    update: (ref, data) => firestoreFake.updateDoc(ref, data),
    delete: (ref) => firestoreFake.deleteDoc(ref),
  });
}

export function writeBatch(_db?: unknown) {
  const ops: (() => void)[] = [];
  const batch = {
    set: (
      ref: DocRef,
      data: Record<string, unknown>,
      opts?: { merge?: boolean }
    ) => {
      ops.push(() => firestoreFake.setDoc(ref, data, opts));
      return batch;
    },
    update: (ref: DocRef, data: Record<string, unknown>) => {
      ops.push(() => firestoreFake.updateDoc(ref, data));
      return batch;
    },
    delete: (ref: DocRef) => {
      ops.push(() => firestoreFake.deleteDoc(ref));
      return batch;
    },
    commit: async () => {
      ops.forEach((op) => op());
    },
  };
  return batch;
}

/* ── field sentinels + Timestamp ───────────────────────────────────── */

export const serverTimestamp = sentinels.serverTimestamp;
export const deleteField = sentinels.deleteField;
export const increment = sentinels.increment;
export const arrayUnion = sentinels.arrayUnion;
export const arrayRemove = sentinels.arrayRemove;
export const Timestamp = FakeTimestamp;

/* ── init surface (imported by src/lib/firebase.ts at module load) ─── */

export function initializeFirestore(): Record<string, never> {
  return {};
}
export function getFirestore(): Record<string, never> {
  return {};
}
export function persistentLocalCache(): Record<string, never> {
  return {};
}
export function persistentMultipleTabManager(): Record<string, never> {
  return {};
}
export function memoryLocalCache(): Record<string, never> {
  return {};
}
export function connectFirestoreEmulator(): void {}
