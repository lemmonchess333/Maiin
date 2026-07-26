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

export type Sentinel =
  | { [SENTINEL]: "serverTimestamp" }
  | { [SENTINEL]: "delete" }
  | { [SENTINEL]: "increment"; by: number }
  | { [SENTINEL]: "arrayUnion"; values: unknown[] }
  | { [SENTINEL]: "arrayRemove"; values: unknown[] };

function isSentinel(v: unknown): v is Sentinel {
  return typeof v === "object" && v !== null && SENTINEL in v;
}

export const sentinels = {
  serverTimestamp: (): Sentinel => ({ [SENTINEL]: "serverTimestamp" }),
  deleteField: (): Sentinel => ({ [SENTINEL]: "delete" }),
  increment: (by: number): Sentinel => ({ [SENTINEL]: "increment", by }),
  arrayUnion: (...values: unknown[]): Sentinel => ({
    [SENTINEL]: "arrayUnion",
    values,
  }),
  arrayRemove: (...values: unknown[]): Sentinel => ({
    [SENTINEL]: "arrayRemove",
    values,
  }),
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
    return new FakeTimestamp(Math.floor(d.getTime() / 1000));
  }
  static fromMillis(ms: number): FakeTimestamp {
    return new FakeTimestamp(Math.floor(ms / 1000));
  }
  toDate(): Date {
    return new Date(this.seconds * 1000);
  }
  toMillis(): number {
    return this.seconds * 1000;
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
  | "deleteDoc";

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
  private listeners = new Set<Listener>();
  private failures: PendingFailure[] = [];
  /** Every write, for assertions ("did it write, and with what?"). */
  readonly writes: { op: string; path: string; data?: unknown }[] = [];
  /**
   * Every read the code under test issued. Exists so a suite can assert a
   * hook did NOT read — a gated hook that skips Firestore is saving the
   * user money, and "active === false" alone doesn't prove the read was
   * skipped rather than merely ignored.
   */
  readonly reads: { op: "getDoc" | "getDocs" | "onSnapshot"; path: string }[] =
    [];

  reset(): void {
    this.docs.clear();
    this.listeners.clear();
    this.failures.length = 0;
    this.writes.length = 0;
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
    const kind = (value as Record<symbol, unknown>)[SENTINEL];
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
