/**
 * In-memory Firestore — the ONE fake (ADR-0009).
 *
 * Why this exists. Client code calls the Firestore SDK's FREE FUNCTIONS
 * (`collection(db, …)`, `getDocs`, `onSnapshot`) rather than methods on an
 * injected handle, so the `db` handle is inert in tests: 11 of the 12 suites
 * that mocked `@/lib/firebase` passed a literal `db: {}`. Injecting the
 * handle — the textbook fix — would touch 62 files and change nothing about
 * testability. The only interceptable seam is the MODULE, so this fake
 * implements the module.
 *
 * Before it, every hook test hand-modelled whichever slice of the SDK its
 * hook happened to touch: ~50 lines of bespoke scaffolding, 16 mutually
 * incompatible shapes across the repo, and 40 of 74 hooks untested because
 * the entry cost was that high.
 *
 * This module is the pure engine — no vitest, no globals. The SDK-shaped
 * surface lives in `__mocks__/firebase/firestore.ts`, which delegates here;
 * test ergonomics live in `src/test/firestoreHarness.ts`.
 *
 * Fidelity: deliberately "faithful enough for the queries this app writes",
 * not a Firestore clone. It models documents as path→data, supports
 * where/orderBy/limit/startAfter, live `onSnapshot`, transactions, batches,
 * and the field sentinels. It does NOT model security rules, indexes,
 * pagination cursors beyond `startAfter`, or offline persistence. If a hook
 * needs something absent, ADD IT HERE — that is the point of having one
 * fake instead of forty.
 */

/* ── Sentinels ─────────────────────────────────────────────────────── */

const SENTINEL = Symbol("fake-sentinel");

/**
 * A field sentinel — the fake's `FieldValue`.
 *
 * This is a CLASS, not a plain object, and that is load-bearing rather
 * than stylistic. Every write in this app is required to go through the
 * guarded wrappers in `src/lib/firestoreWrite.ts` (CLAUDE.md), which
 * apply `stripUndefined`. That helper passes non-plain objects through
 * untouched via `value.constructor !== Object` — precisely so real
 * `FieldValue`s and `Timestamp`s survive, as its header says.
 *
 * While these were plain objects carrying a symbol key, `stripUndefined`
 * recursed INTO them and dropped the symbol, so `increment(1)` reached
 * the store as `{ by: 1 }` and was written verbatim instead of applied.
 * Every sentinel was silently inert on the app's own mandated write
 * path. Found 2026-07-26 by `useFoodFavourites`, whose useCount stopped
 * accumulating.
 */
class FakeFieldValue {
  readonly [SENTINEL]: string;
  readonly by?: number;
  readonly values?: unknown[];
  constructor(kind: string, extra: { by?: number; values?: unknown[] } = {}) {
    this[SENTINEL] = kind;
    this.by = extra.by;
    this.values = extra.values;
  }
}

export type Sentinel = FakeFieldValue;

function isSentinel(v: unknown): v is Sentinel {
  return v instanceof FakeFieldValue;
}

export const sentinels = {
  serverTimestamp: (): Sentinel => new FakeFieldValue("serverTimestamp"),
  deleteField: (): Sentinel => new FakeFieldValue("delete"),
  increment: (by: number): Sentinel => new FakeFieldValue("increment", { by }),
  arrayUnion: (...values: unknown[]): Sentinel =>
    new FakeFieldValue("arrayUnion", { values }),
  arrayRemove: (...values: unknown[]): Sentinel =>
    new FakeFieldValue("arrayRemove", { values }),
};

/** Minimal Timestamp with the surface the app uses. */
export class FakeTimestamp {
  // Declared, not parameter-property shorthand — the project builds with
  // `erasableSyntaxOnly`, which rejects constructor-parameter modifiers.
  readonly seconds: number;
  readonly nanoseconds: number;
  constructor(seconds: number, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static now(): FakeTimestamp {
    return FakeTimestamp.fromDate(new Date());
  }
  static fromDate(d: Date): FakeTimestamp {
    return FakeTimestamp.fromMillis(d.getTime());
  }
  /**
   * Sub-second precision is kept in `nanoseconds`, as real Firestore
   * does. It was dropped until 2026-07-26 — `fromMillis(100).toMillis()`
   * returned 0 — which silently collapsed any fixture whose timestamps
   * differ by less than a second into a tie. A hook sorting by
   * `lastUsed.toMillis()` then fell back to insertion order, so a
   * genuinely wrong sort and a correct one were indistinguishable.
   * (Found by `useFoodFavourites`, whose tie-break fixture uses 50 /
   * 100 / 200 ms.)
   */
  static fromMillis(ms: number): FakeTimestamp {
    const seconds = Math.floor(ms / 1000);
    return new FakeTimestamp(seconds, (ms - seconds * 1000) * 1e6);
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }
  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
}

/* ── Refs ──────────────────────────────────────────────────────────── */

export type WhereOp =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "array-contains"
  | "in"
  | "not-in";

export interface Constraint {
  kind: "where" | "orderBy" | "limit" | "startAfter";
  field?: string;
  op?: WhereOp;
  value?: unknown;
  dir?: "asc" | "desc";
  count?: number;
  cursor?: unknown;
}

export interface DocRef {
  __kind: "doc";
  path: string;
  id: string;
}

export interface CollectionRef {
  __kind: "collection";
  path: string;
  id: string;
  /** collectionGroup queries match on the LAST path segment anywhere. */
  group?: boolean;
  constraints: Constraint[];
}

export type QueryRef = CollectionRef;

export function isDocRef(v: unknown): v is DocRef {
  return !!v && (v as DocRef).__kind === "doc";
}
export function isCollectionRef(v: unknown): v is CollectionRef {
  return !!v && (v as CollectionRef).__kind === "collection";
}

/* ── Snapshots ─────────────────────────────────────────────────────── */

export interface FakeDocSnap {
  id: string;
  ref: DocRef;
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
  get: (field: string) => unknown;
}

export interface FakeQuerySnap {
  empty: boolean;
  size: number;
  docs: FakeDocSnap[];
  forEach: (cb: (d: FakeDocSnap) => void) => void;
}

/* ── Injected failures ─────────────────────────────────────────────── */

/**
 * Which SDK entry point to fail. These are SDK operations, not store
 * operations, because that is the granularity a test reasons about:
 * "the initial read is denied", "the write fails offline".
 */
export type FailOp =
  | "getDoc"
  | "getDocs"
  | "onSnapshot"
  | "setDoc"
  | "addDoc"
  | "updateDoc"
  | "deleteDoc"
  /** `writeBatch().commit()`. A batch is atomic, so a failure here must
   *  leave NONE of its operations applied — which is exactly what a test
   *  of the rollback path needs and what a per-op failure cannot model. */
  | "commit";

/**
 * The error shape client code branches on. Real Firestore throws a
 * `FirebaseError` carrying `.code`; several hooks read that code (e.g. to
 * distinguish `permission-denied` from `unavailable`), so the fake must
 * carry it too or those branches stay untested.
 */
export class FakeFirestoreError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? `[firestoreFake] injected failure: ${code}`);
    this.name = "FirebaseError";
    this.code = code;
  }
}

interface PendingFailure {
  op: FailOp;
  path?: string;
  code: string;
  remaining: number;
}

/* ── The store ─────────────────────────────────────────────────────── */

type Listener = { ref: DocRef | CollectionRef; fire: () => void };

let autoId = 0;

export class FirestoreFake {
  /** path → document data. Paths are "a/b/c/d" (even segment count). */
  private docs = new Map<string, Record<string, unknown>>();
  /**
   * The IndexedDB cache, DELIBERATELY separate from `docs`.
   *
   * A cache-first paint is only worth testing when the cached copy can
   * differ from the server's — that is the whole scenario ("cached
   * locally, server slow or unreachable"). Backing it with the same map
   * would make every cache test tautological, since the two could never
   * disagree.
   *
   * Empty by default, so the modelled cache stays COLD unless a test
   * says otherwise — see `getDocFromCache` in the SDK surface.
   */
  private cached = new Map<string, Record<string, unknown>>();
  private listeners = new Set<Listener>();
  private failures: PendingFailure[] = [];
  /** Every write, for assertions ("did it write, and with what?"). */
  readonly writes: { op: string; path: string; data?: unknown }[] = [];
  /**
   * One entry per COMMITTED batch, holding that batch's operations.
   *
   * The flat write log can't express this: a batch's writes are
   * indistinguishable from N separate writes once flattened, so a suite
   * asserting "these three landed together, atomically" has nowhere to
   * look. Grouping is the property under test for `writeBatch` callers.
   */
  readonly batches: { op: string; path: string; data?: unknown }[][] = [];
  /**
   * Every read the code under test issued. Exists so a suite can assert a
   * hook did NOT read — a gated hook that skips Firestore is saving the
   * user money, and "active === false" alone doesn't prove the read was
   * skipped rather than merely ignored.
   */
  readonly reads: { op: "getDoc" | "getDocs" | "onSnapshot"; path: string }[] =
    [];

  reset(): void {
    // Settle held writes before the clears — see `settleDeferredWrites`.
    this.settleDeferredWrites();
    this.deferringWrites = false;
    this.docs.clear();
    this.cached.clear();
    this.listeners.clear();
    this.failures.length = 0;
    this.writes.length = 0;
    this.batches.length = 0;
    this.reads.length = 0;
    // Release before clearing: a held promise that is dropped never settles,
    // and a test awaiting it would hang until the suite timeout rather than
    // fail with a usable message.
    this.releaseAllReads();
    this.deferring = false;
    autoId = 0;
  }

  /* ── injected failures ── */

  /**
   * Arm a failure for the next matching SDK call.
   *
   * This lives in the fake rather than being spied onto the mock's exports
   * because the mock exports plain functions, not `vi.fn()`s — deliberately,
   * so that a suite cannot quietly replace one operation's behaviour and
   * leave the rest of the store inconsistent with it. Failure is a store
   * concern here: after an injected error the documents are untouched,
   * exactly as a rejected Firestore call leaves them.
   */
  failNext(
    op: FailOp,
    opts: { path?: string; code?: string; times?: number } = {}
  ): void {
    this.failures.push({
      op,
      path: opts.path,
      code: opts.code ?? "permission-denied",
      remaining: opts.times ?? 1,
    });
  }

  /**
   * Consume a matching armed failure and throw, or return. Called by the SDK
   * surface (`__mocks__/firebase/firestore.ts`) at each entry point.
   *
   * A failure with no `path` matches any path; with one it matches that exact
   * document/collection path or anything beneath it.
   */
  failIfArmed(op: FailOp, path: string): void {
    const i = this.failures.findIndex(
      (f) =>
        f.op === op &&
        (f.path === undefined ||
          f.path === path ||
          path.startsWith(`${f.path}/`))
    );
    if (i === -1) return;
    const failure = this.failures[i];
    failure.remaining -= 1;
    if (failure.remaining <= 0) this.failures.splice(i, 1);
    throw new FakeFirestoreError(failure.code);
  }

  /** Armed-but-unfired failures, so a test can assert it actually exercised one. */
  get armedFailures(): readonly { op: FailOp; path?: string }[] {
    return this.failures.map((f) => ({ op: f.op, path: f.path }));
  }

  /* ── deferred reads ── */

  /**
   * Hold reads open so a test can choose the ORDER they resolve in.
   *
   * Account-switch bugs are ordering bugs: user A's in-flight read resolves
   * AFTER the switch to B and overwrites B's rows with A's. Both reads
   * succeed, so nothing throws and nothing logs — the user simply sees
   * someone else's data. That failure is invisible to a fake that always
   * resolves immediately, because it can never produce the interleaving.
   *
   * The snapshot is taken when the read is ISSUED, not when it is released,
   * so holding a read doesn't let later seeding rewrite its answer — the
   * point is to reorder delivery, not to change what was fetched.
   */
  private deferring = false;
  private deferred: {
    path: string;
    resolve: () => void;
    reject: (err: unknown) => void;
  }[] = [];

  /** Hold every subsequent read until explicitly released. */
  deferReads(): void {
    this.deferring = true;
  }

  /** Stop holding new reads. Already-held ones stay held. */
  resumeReads(): void {
    this.deferring = false;
  }

  /** Paths of the reads currently held, in the order they were issued. */
  get pendingReads(): readonly string[] {
    return this.deferred.map((d) => d.path);
  }

  /**
   * Release one held read by its position in issue order (default: the
   * oldest). Returns false when there is nothing at that index, so a test
   * can't silently assert against an interleaving that never happened.
   */
  releaseRead(index = 0): boolean {
    const entry = this.deferred[index];
    if (!entry) return false;
    this.deferred.splice(index, 1);
    entry.resolve();
    return true;
  }

  /**
   * Fail one held read instead of answering it, by position in issue order.
   * Returns false when there is nothing at that index, on the same terms as
   * `releaseRead` — so a test can't claim an interleaving that never
   * happened.
   *
   * `failNextFirestore` cannot express this. It is checked at ISSUE time
   * (`failIfArmed` throws before `maybeDefer` runs), so an armed read
   * rejects immediately and never becomes a held read at all. The bug this
   * exists for needs the opposite shape: a read that is still in flight
   * when the account switches, and only THEN fails. A stale rejection
   * handler that clears state it no longer owns wipes the CURRENT
   * account's profile — the same privacy-shaped failure as a stale
   * success, and equally invisible to a fake that can only resolve.
   */
  rejectRead(index = 0, code = "unavailable"): boolean {
    const entry = this.deferred[index];
    if (!entry) return false;
    this.deferred.splice(index, 1);
    entry.reject(new FakeFirestoreError(code));
    return true;
  }

  /** Release everything still held, oldest first. */
  releaseAllReads(): void {
    while (this.releaseRead()) {
      /* drain */
    }
  }

  /**
   * Wrap a read result so it resolves only when released. Called by the SDK
   * surface. When not deferring, the value passes straight through, so the
   * default behaviour is unchanged.
   */
  maybeDefer<T>(path: string, value: T): Promise<T> {
    if (!this.deferring) return Promise.resolve(value);
    return new Promise<T>((resolve, reject) => {
      this.deferred.push({ path, resolve: () => resolve(value), reject });
    });
  }

  /* ── deferred writes ── */

  /**
   * Hold WRITES open, the dual of `deferReads`.
   *
   * Reads could be held since the account-switch work; writes could not,
   * so nothing could test what happens to state that a write is in the
   * middle of. That is a whole class of bug on its own: any read-modify-
   * write whose read happens before an await and whose write happens
   * after is stale by however long the round trip took, and anything the
   * user did in that window is overwritten. The offline queue's flush is
   * exactly this shape, and the window is as long as the queue takes to
   * drain.
   *
   * A held write has NOT landed: the store is untouched and `writeLog()`
   * shows nothing until it is released. That is the honest model of a
   * request in flight, and it is what lets a test distinguish "issued"
   * from "committed" — `pendingWrites` is the former, the log the latter.
   *
   *   deferWrites();
   *   const flushing = flushQueue(db, uid);   // suspends mid-write
   *   queueWrite(uid, ...);                   // user logs during the flush
   *   releaseAllWrites();
   *   await flushing;                         // the new item must survive
   */
  private deferringWrites = false;
  private deferredWrites: {
    path: string;
    apply: () => void;
    resolve: () => void;
    reject: (err: unknown) => void;
  }[] = [];

  /** Hold every subsequent single-document write until released. */
  deferWrites(): void {
    this.deferringWrites = true;
  }

  /** Stop holding NEW writes. Already-held ones stay held. */
  resumeWrites(): void {
    this.deferringWrites = false;
  }

  /** Paths of the writes currently held, in the order they were issued. */
  get pendingWrites(): readonly string[] {
    return this.deferredWrites.map((d) => d.path);
  }

  /**
   * Land one held write by position in issue order (default: the oldest).
   * Returns false when there is nothing at that index, so a test can't
   * silently assert against an interleaving that never happened.
   *
   * A write whose effect throws (`updateDoc` on a missing document) is
   * delivered as a rejection rather than escaping here, because that is
   * what the real SDK surface does with it.
   */
  releaseWrite(index = 0): boolean {
    const entry = this.deferredWrites[index];
    if (!entry) return false;
    this.deferredWrites.splice(index, 1);
    try {
      entry.apply();
      entry.resolve();
    } catch (e) {
      entry.reject(e);
    }
    return true;
  }

  /**
   * Fail one held write instead of landing it, by position in issue
   * order. The store is left untouched — a rejected write did not happen.
   *
   * `failNextFirestore` cannot express this: it fires at ISSUE time, so
   * the write rejects before it is ever in flight. The bug shapes that
   * need this one are the late failures — a write that was accepted into
   * flight and only THEN failed, with the caller having already moved on.
   */
  rejectWrite(index = 0, code = "unavailable"): boolean {
    const entry = this.deferredWrites[index];
    if (!entry) return false;
    this.deferredWrites.splice(index, 1);
    entry.reject(new FakeFirestoreError(code));
    return true;
  }

  /** Land everything still held, oldest first. */
  releaseAllWrites(): void {
    while (this.releaseWrite()) {
      /* drain */
    }
  }

  /**
   * Wrap a write so it lands only when released. Called by the SDK
   * surface. When not deferring the effect runs immediately, so the
   * default behaviour is unchanged.
   */
  maybeDeferWrite(path: string, apply: () => void): Promise<void> {
    if (!this.deferringWrites) {
      apply();
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.deferredWrites.push({ path, apply, resolve, reject });
    });
  }

  /**
   * Settle held writes for `reset` by REJECTING them.
   *
   * All three options here are wrong in different ways, so the reasoning
   * matters:
   *
   *   - RELEASING repopulates the store `reset` is about to clear.
   *   - DROPPING leaves a test awaiting a promise that never settles,
   *     which fails as a suite timeout instead of a usable message.
   *   - RESOLVING (what this did first) is the subtle one, and it
   *     recreates exactly the leak class this fake exists to expose. The
   *     abandoned caller resumes during the NEXT test and carries on with
   *     the rest of its work — issuing its remaining writes into the
   *     freshly-cleared store. That test then fails on a `writeLog()` /
   *     `allPaths()` / `readDoc()` assertion naming a document it never
   *     wrote, with the failure reported against the innocent test rather
   *     than the one that leaked. CI-only, unreproducible locally: the
   *     same shape that cost the reminder suites two speculative fixes
   *     and 56 diagnostic runs.
   *
   * Rejecting propagates into the abandoned caller and stops it AT the
   * await, so it cannot go on to write. If nothing was handling that
   * promise the rejection surfaces as an unhandled rejection — which is
   * the correct outcome: it is loud, and it names the test that left a
   * write in flight instead of the one that inherits the mess.
   *
   * A test that legitimately holds writes should release them
   * (`releaseAllWrites()`) or fail them (`rejectWrite()`) before it ends.
   */
  private settleDeferredWrites(): void {
    const held = this.deferredWrites.splice(0, this.deferredWrites.length);
    for (const entry of held) {
      entry.reject(
        new FakeFirestoreError(
          "aborted",
          `[firestoreFake] the write to ${entry.path} was still held when ` +
            `reset() ran. Release (releaseAllWrites) or fail (rejectWrite) ` +
            `held writes before the test ends — a write left in flight ` +
            `resumes inside the NEXT test.`
        )
      );
    }
  }

  /**
   * Seed the IndexedDB cache only — these documents are visible to
   * `getDocFromCache` and INVISIBLE to every server read. Use it to model
   * a returning user whose cache is warm while the network is slow.
   */
  seedCache(tree: Record<string, Record<string, unknown>>): void {
    for (const [path, data] of Object.entries(tree)) {
      this.cached.set(path, { ...data });
    }
  }

  /** Cached copy of a document, or undefined for a cold cache. */
  peekCache(path: string): Record<string, unknown> | undefined {
    return this.cached.get(path);
  }

  /** Seed documents: `{ "users/u1": {...}, "users/u1/meals/m1": {...} }`. */
  seed(tree: Record<string, Record<string, unknown>>): void {
    for (const [path, data] of Object.entries(tree)) {
      this.docs.set(path, { ...data });
    }
    this.notify();
  }

  /** Raw read, for assertions. */
  peek(path: string): Record<string, unknown> | undefined {
    return this.docs.get(path);
  }

  /** Every stored path, for assertions. */
  paths(): string[] {
    return [...this.docs.keys()].sort();
  }

  nextId(): string {
    autoId += 1;
    return `fake-id-${autoId}`;
  }

  /* ── reads ── */

  docSnap(ref: DocRef): FakeDocSnap {
    this.reads.push({ op: "getDoc", path: ref.path });
    return this.snapFor(ref);
  }

  /** Snapshot WITHOUT logging a read — `querySnap` builds one per row, and
   *  logging those would report a getDocs as N phantom getDoc reads. */
  private snapFor(ref: DocRef): FakeDocSnap {
    const data = this.docs.get(ref.path);
    return {
      id: ref.id,
      ref,
      exists: () => data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
      get: (field: string) => data?.[field],
    };
  }

  /** Immediate children of a collection path (or collection-group matches). */
  private childPaths(ref: CollectionRef): string[] {
    const out: string[] = [];
    for (const path of this.docs.keys()) {
      const segs = path.split("/");
      if (ref.group) {
        // collectionGroup: any doc whose PARENT collection segment matches.
        if (segs.length >= 2 && segs[segs.length - 2] === ref.id)
          out.push(path);
        continue;
      }
      if (!path.startsWith(`${ref.path}/`)) continue;
      if (segs.length !== ref.path.split("/").length + 1) continue;
      out.push(path);
    }
    return out;
  }

  querySnap(ref: CollectionRef): FakeQuerySnap {
    this.reads.push({ op: "getDocs", path: ref.path });
    let rows = this.childPaths(ref).map((p) =>
      this.snapFor({ __kind: "doc", path: p, id: p.split("/").pop() as string })
    );

    for (const c of ref.constraints) {
      if (c.kind === "where") {
        rows = rows.filter((r) => matches(r, c));
      }
    }

    const orderBys = ref.constraints.filter((c) => c.kind === "orderBy");
    for (const ob of [...orderBys].reverse()) {
      rows.sort((a, b) => {
        const av = fieldValue(a, ob.field as string);
        const bv = fieldValue(b, ob.field as string);
        const cmp = compare(av, bv);
        return ob.dir === "desc" ? -cmp : cmp;
      });
    }

    const startAfter = ref.constraints.find((c) => c.kind === "startAfter");
    if (startAfter && orderBys.length > 0) {
      const field = orderBys[0].field as string;
      const dir = orderBys[0].dir === "desc" ? -1 : 1;
      // Real `startAfter` takes EITHER a raw field value or the last document
      // snapshot of the previous page. Paging code overwhelmingly passes the
      // snapshot, so a fake that only understood raw values would silently
      // return page 1 again — the bug it exists to catch.
      const cursor = isDocSnapLike(startAfter.cursor)
        ? (startAfter.cursor as FakeDocSnap).get(field)
        : startAfter.cursor;
      rows = rows.filter(
        (r) => compare(fieldValue(r, field), cursor) * dir > 0
      );
    }

    const limit = ref.constraints.find((c) => c.kind === "limit");
    if (limit?.count !== undefined) rows = rows.slice(0, limit.count);

    return {
      empty: rows.length === 0,
      size: rows.length,
      docs: rows,
      forEach: (cb) => rows.forEach(cb),
    };
  }

  /* ── writes ── */

  setDoc(
    ref: DocRef,
    data: Record<string, unknown>,
    opts?: { merge?: boolean }
  ): void {
    const prev = opts?.merge ? (this.docs.get(ref.path) ?? {}) : {};
    this.docs.set(ref.path, resolveWrite(prev, data));
    this.writes.push({
      op: opts?.merge ? "set:merge" : "set",
      path: ref.path,
      data,
    });
    this.notify();
  }

  updateDoc(ref: DocRef, data: Record<string, unknown>): void {
    const prev = this.docs.get(ref.path);
    if (prev === undefined) {
      throw new Error(
        `[firestoreFake] updateDoc on missing document: ${ref.path} ` +
          `(real Firestore rejects this too — seed it or use setDoc({merge:true}))`
      );
    }
    this.docs.set(ref.path, resolveWrite(prev, data));
    this.writes.push({ op: "update", path: ref.path, data });
    this.notify();
  }

  deleteDoc(ref: DocRef): void {
    this.docs.delete(ref.path);
    this.writes.push({ op: "delete", path: ref.path });
    this.notify();
  }

  /* ── listeners ── */

  addListener(l: Listener): () => void {
    // Log the SUBSCRIPTION as a read, not each fire. Attaching a listener
    // is what costs a document read; re-delivery on a local change is not
    // a new billed read, so one entry per subscribe is the honest count.
    //
    // This was missing until 2026-07-26, which made `readLog()` /
    // `readsAt()` quietly partial: they claimed to be the read log while
    // omitting the most common read shape in this codebase. Nothing was
    // wrong at the time — the one consumer asserting "this gated hook
    // performs NO read" (useAdaptiveTdee) reads via `getDocs`, which was
    // logged. But it is a latent vacuity: convert that hook to
    // `onSnapshot` (the natural change for anything live-updating) and
    // the assertion keeps passing while a listener is attached and
    // billing. Logging here means the check fails instead, which is the
    // whole point of asserting it.
    this.reads.push({ op: "onSnapshot", path: l.ref.path });
    this.listeners.add(l);
    l.fire();
    return () => {
      this.listeners.delete(l);
    };
  }

  private notifyScheduled = false;
  private notify(): void {
    // Coalesce like a real snapshot batch — a multi-doc seed or batch commit
    // should surface as ONE listener fire, not N.
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      for (const l of [...this.listeners]) l.fire();
    });
  }
}

/* ── helpers ───────────────────────────────────────────────────────── */

/** A cursor that is a document snapshot rather than a raw field value. */
function isDocSnapLike(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as FakeDocSnap).get === "function" &&
    typeof (v as FakeDocSnap).data === "function"
  );
}

function fieldValue(snap: FakeDocSnap, field: string): unknown {
  if (field === "__name__") return snap.id;
  return field.split(".").reduce<unknown>((acc, part) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, snap.data());
}

function matches(snap: FakeDocSnap, c: Constraint): boolean {
  const v = fieldValue(snap, c.field as string);
  const target = c.value;
  switch (c.op) {
    case "==":
      return Object.is(v, target) || v === target;
    case "!=":
      return v !== target;
    case "<":
      return compare(v, target) < 0;
    case "<=":
      return compare(v, target) <= 0;
    case ">":
      return compare(v, target) > 0;
    case ">=":
      return compare(v, target) >= 0;
    case "array-contains":
      return Array.isArray(v) && v.includes(target);
    case "in":
      return Array.isArray(target) && target.includes(v);
    case "not-in":
      return Array.isArray(target) && !target.includes(v);
    default:
      throw new Error(`[firestoreFake] unsupported where op: ${String(c.op)}`);
  }
}

function compare(a: unknown, b: unknown): number {
  const an = a instanceof FakeTimestamp ? a.toMillis() : a;
  const bn = b instanceof FakeTimestamp ? b.toMillis() : b;
  if (typeof an === "number" && typeof bn === "number") return an - bn;
  const as = String(an ?? "");
  const bs = String(bn ?? "");
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** Apply a write on top of previous data, resolving field sentinels. */
function resolveWrite(
  prev: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prev };
  for (const [key, value] of Object.entries(patch)) {
    if (!isSentinel(value)) {
      next[key] = value;
      continue;
    }
    const kind = (value as FakeFieldValue)[SENTINEL];
    if (kind === "serverTimestamp") {
      next[key] = FakeTimestamp.now();
    } else if (kind === "delete") {
      delete next[key];
    } else if (kind === "increment") {
      const by = (value as { by: number }).by;
      next[key] =
        (typeof prev[key] === "number" ? (prev[key] as number) : 0) + by;
    } else if (kind === "arrayUnion") {
      const add = (value as { values: unknown[] }).values;
      const cur = Array.isArray(prev[key]) ? [...(prev[key] as unknown[])] : [];
      for (const v of add) if (!cur.includes(v)) cur.push(v);
      next[key] = cur;
    } else if (kind === "arrayRemove") {
      const drop = (value as { values: unknown[] }).values;
      const cur = Array.isArray(prev[key]) ? (prev[key] as unknown[]) : [];
      next[key] = cur.filter((v) => !drop.includes(v));
    }
  }
  return next;
}

/** The process-wide instance the SDK mock delegates to. */
export const firestoreFake = new FirestoreFake();
