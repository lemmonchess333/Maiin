/**
 * localStorage persistence for in-flight runs. Phase B3 of the
 * Run-setup audit — closes the data-loss surface where a force-close,
 * tab crash, or long background suspend lost the entire run.
 *
 * RUN-06 (2026-07-12): persistence is now BOUNDED + INCREMENTAL.
 * Previously every 5-second write re-serialised the ENTIRE growing GPS
 * trail to one key — O(n²) work over a run and, on a marathon
 * (~14k points), a >1MB synchronous localStorage write every 5s
 * (main-thread jank + a real risk of hitting the ~5MB quota mid-run).
 * Now the trail is split into fixed-size CHUNKS: a sealed chunk is
 * never rewritten, so each write only re-serialises the small current
 * partial chunk (≤ CHUNK_SIZE points) plus a tiny meta record. A
 * marathon costs the same per write as a 5K.
 *
 * Layout (all uid-scoped):
 *   <prefix>:<uid>            → META: config, timer, phase, lastWriteAt,
 *                               pointCount, chunkCount (small, rewritten
 *                               every tick).
 *   <prefix>:<uid>:pts:<i>    → CHUNK i: a JSON array of ≤ CHUNK_SIZE
 *                               GPSPoints. Sealed chunks are immutable.
 *
 * Meta is written LAST on every save, so a chunk-write failure (quota)
 * leaves meta pointing at the previous consistent state — the read
 * path only ever reconstructs `chunkCount` chunks, so a half-written
 * new chunk is simply ignored until the next successful write.
 *
 * Schema is versioned (`v: 2`); a bump invalidates every existing
 * entry on the next read (v1 was the single-blob layout), so a format
 * change ships without a migration script. The 6-hour cutoff discards
 * a run abandoned and reopened days later.
 *
 * Write path is best-effort: try/catch around every storage op so a
 * quota-exceeded or private-mode environment falls through to "run
 * continues in memory, no recoverability" instead of breaking the
 * live run. localStorage is also unavailable during SSR / Node tests —
 * every helper short-circuits cleanly when the global is absent.
 */

import type { GPSPoint } from "./gps";
/* RunConfig's canonical home is runConfigDefaults.ts (pure module, no
 * UI imports — RunSetupModal only re-exports it). Importing the pure
 * module keeps storage/auth off the UI layer (2026-07-11 audit batch 3:
 * this line was the root of the auth -> runResumeStorage ->
 * RunSetupModal -> ShoeSelector -> useShoes -> auth cycles). */
import type { RunConfig } from "@/components/run/runConfigDefaults";

/** Schema version. Bump invalidates every stored entry on next read.
 *  v1 = single-blob layout; v2 = meta + chunked points (RUN-06). */
export const RUN_RESUME_SCHEMA_VERSION = 2 as const;

/** Points per chunk. A sealed chunk is never rewritten, so this is the
 *  ceiling on per-write serialisation cost. 250 GPSPoints ≈ tens of KB
 *  — cheap to rewrite every 5s, and a chunk seals roughly every ~4 min
 *  of running (1 pt/s), so the write set is ~1 chunk at any moment. */
export const RUN_RESUME_CHUNK_SIZE = 250 as const;

/**
 * localStorage key PREFIX. Includes the schema-version suffix so a bump
 * doesn't collide with old entries lingering at the previous key. The
 * actual key is uid-scoped (`<prefix>:<uid>`) so account B on a shared
 * device never sees account A's in-flight GPS trail in the Resume
 * chooser — and can't save A's run into B's account. See `runResumeKey`.
 */
export const RUN_RESUME_KEY_PREFIX = "tropos:run:resume:v1";

/**
 * Legacy un-scoped key from before uid scoping. Dropped on the first
 * read (mirrors the offlineQueue.ts PR #820 legacy-drop pattern): we
 * have no safe way to attribute the snapshot to a uid retroactively, so
 * better to discard than to risk offering it to the wrong account.
 */
export const LEGACY_RUN_RESUME_KEY = "tropos:run:resume:v1";

/** Build the uid-scoped META key for a given user. */
export function runResumeKey(uid: string): string {
  return `${RUN_RESUME_KEY_PREFIX}:${uid}`;
}

/** Build the uid-scoped CHUNK key for chunk index `i`. */
export function runResumeChunkKey(uid: string, i: number): string {
  return `${runResumeKey(uid)}:pts:${i}`;
}

/** Max age before a stored run silently discards on read. Six hours
 *  comfortably exceeds any plausible interrupted-run gap (marathon
 *  finishers do not pause for 6h) while keeping ancient sessions out
 *  of the prompt rotation. */
export const RUN_RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface StoredRun {
  /** Schema version. Hard gate — mismatch → discard on read. */
  v: typeof RUN_RESUME_SCHEMA_VERSION;
  /** Snapshot of the run config at start, including Phase B1
   *  planMetadata so the resumed run keeps its plan adherence. */
  config: RunConfig;
  /** ms epoch when the run originally started. */
  startedAt: number;
  /** Cumulative elapsed seconds at last write — what
   *  `useRunTimer.accumulatedRef` held. Combined with `isRunning`
   *  and `lastWriteAt` on rehydrate. */
  accumulatedSeconds: number;
  /** Was the timer actively counting at last write? `false` if the
   *  user had paused. Drives whether Resume re-arms `timer.resume()`. */
  isRunning: boolean;
  /** Full GPS points buffer. Down-sampling happens at save time
   *  (RunSummary), not here — Resume needs the full trail to render
   *  the live map accurately. Reconstructed from chunks on read. */
  points: GPSPoint[];
  /** ms epoch of the most recent write. Drives the 6h cutoff. */
  lastWriteAt: number;
  /** Run phase at write time. Only the two active states persist;
   *  `waiting` runs aren't worth recovering and `finished` runs
   *  belong in RunSummary, not Resume. */
  phase: "active" | "paused";
}

/** The small record stored at the META key — everything in StoredRun
 *  except the points, plus the counts needed to reconstruct them. */
interface StoredMeta {
  v: typeof RUN_RESUME_SCHEMA_VERSION;
  config: RunConfig;
  startedAt: number;
  accumulatedSeconds: number;
  isRunning: boolean;
  lastWriteAt: number;
  phase: "active" | "paused";
  pointCount: number;
  chunkCount: number;
}

function chunkCountFor(pointCount: number): number {
  return Math.ceil(pointCount / RUN_RESUME_CHUNK_SIZE);
}

/** Best-effort read of the raw meta record (no age/version gating) —
 *  used by the write path to decide same-run vs fresh. */
function readMetaRaw(uid: string): StoredMeta | null {
  try {
    const raw = localStorage.getItem(runResumeKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidMeta(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Defensive write — wrapped in try/catch because:
 *   - localStorage quota can throw mid-write (5MB cap)
 *   - private-mode Safari throws on every setItem
 *   - SSR / Node test envs have no `localStorage` global
 *
 * Incremental: only chunks from the previous partial chunk onward are
 * rewritten; sealed chunks are left untouched. Meta is written LAST so
 * a mid-write quota failure never advances the counts past the chunks
 * that actually persisted.
 *
 * Returns true on success so call sites can debounce / log failures.
 * Never propagates the error — the live run is more important than
 * recoverability.
 */
export function writeStoredRun(uid: string, snapshot: StoredRun): boolean {
  if (typeof localStorage === "undefined") return false;
  if (!uid) return false;
  try {
    const prior = readMetaRaw(uid);
    const newCount = snapshot.points.length;
    const newChunks = chunkCountFor(newCount);

    // Same run only when the meta is the current version, the start
    // timestamp matches, and the trail hasn't shrunk (a shrink means a
    // reset / different run reusing the key). Otherwise: fresh — wipe
    // the prior run's chunks and write every chunk from scratch.
    const sameRun =
      prior !== null &&
      prior.startedAt === snapshot.startedAt &&
      newCount >= prior.pointCount;

    if (!sameRun && prior) {
      for (let i = 0; i < prior.chunkCount; i++) {
        localStorage.removeItem(runResumeChunkKey(uid, i));
      }
    }

    // Only the previous partial chunk and any brand-new chunks are
    // dirty; earlier chunks are sealed and identical.
    const firstDirty = sameRun
      ? Math.floor(prior!.pointCount / RUN_RESUME_CHUNK_SIZE)
      : 0;
    for (let i = firstDirty; i < newChunks; i++) {
      const slice = snapshot.points.slice(
        i * RUN_RESUME_CHUNK_SIZE,
        (i + 1) * RUN_RESUME_CHUNK_SIZE
      );
      localStorage.setItem(runResumeChunkKey(uid, i), JSON.stringify(slice));
    }
    // In the same-run path a shrink is impossible (guarded above), so
    // there are never stale trailing chunks to remove here.

    // Meta LAST — the commit point. Until this lands the read path
    // still sees the previous consistent (pointCount, chunkCount).
    const meta: StoredMeta = {
      v: RUN_RESUME_SCHEMA_VERSION,
      config: snapshot.config,
      startedAt: snapshot.startedAt,
      accumulatedSeconds: snapshot.accumulatedSeconds,
      isRunning: snapshot.isRunning,
      lastWriteAt: snapshot.lastWriteAt,
      phase: snapshot.phase,
      pointCount: newCount,
      chunkCount: newChunks,
    };
    localStorage.setItem(runResumeKey(uid), JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads + validates + reconstructs. Returns null when:
 *   - localStorage unavailable
 *   - no stored entry
 *   - JSON malformed
 *   - schema version mismatch
 *   - older than RUN_RESUME_MAX_AGE_MS
 *   - missing required fields (defensive)
 *   - a points chunk is missing / corrupt (partial trail is not a safe
 *     recovery — discard the whole run rather than resume a gap)
 *
 * Side effect: any discard branch clears the entry (meta + chunks) so
 * subsequent reads don't keep trying. Also drops the legacy un-scoped
 * key on every read (one-time migration — see LEGACY_RUN_RESUME_KEY).
 */
export function readStoredRun(
  uid: string,
  now: number = Date.now()
): StoredRun | null {
  if (typeof localStorage === "undefined") return null;
  // Drop the legacy un-scoped entry on first read so a pre-scoping
  // snapshot can never surface in the chooser under the wrong account.
  dropLegacyKey();
  if (!uid) return null;

  let raw: string | null;
  try {
    raw = localStorage.getItem(runResumeKey(uid));
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearStoredRun(uid);
    return null;
  }

  if (!isValidMeta(parsed)) {
    clearStoredRun(uid);
    return null;
  }
  if (parsed.v !== RUN_RESUME_SCHEMA_VERSION) {
    clearStoredRun(uid);
    return null;
  }
  if (now - parsed.lastWriteAt > RUN_RESUME_MAX_AGE_MS) {
    clearStoredRun(uid);
    return null;
  }

  // Reconstruct the trail from its chunks. Any missing / corrupt chunk
  // makes the trail non-contiguous → unsafe to resume → discard.
  const points: GPSPoint[] = [];
  for (let i = 0; i < parsed.chunkCount; i++) {
    let chunkRaw: string | null;
    try {
      chunkRaw = localStorage.getItem(runResumeChunkKey(uid, i));
    } catch {
      clearStoredRun(uid);
      return null;
    }
    if (chunkRaw === null) {
      clearStoredRun(uid);
      return null;
    }
    try {
      const chunk = JSON.parse(chunkRaw) as unknown;
      if (!Array.isArray(chunk)) {
        clearStoredRun(uid);
        return null;
      }
      points.push(...(chunk as GPSPoint[]));
    } catch {
      clearStoredRun(uid);
      return null;
    }
  }
  // Belt-and-braces: the reconstructed length must match the committed
  // pointCount (a torn write would fail here).
  if (points.length !== parsed.pointCount) {
    clearStoredRun(uid);
    return null;
  }

  return {
    v: parsed.v,
    config: parsed.config,
    startedAt: parsed.startedAt,
    accumulatedSeconds: parsed.accumulatedSeconds,
    isRunning: parsed.isRunning,
    points,
    lastWriteAt: parsed.lastWriteAt,
    phase: parsed.phase,
  };
}

/**
 * Best-effort removal of the legacy un-scoped key. Idempotent; never
 * throws. The legacy key has no `:uid` suffix so it can never collide
 * with a scoped key — this only removes the pre-scoping global entry.
 */
function dropLegacyKey(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_RUN_RESUME_KEY);
  } catch {
    // Best-effort.
  }
}

/**
 * Idempotent delete of meta + every chunk. Safe to call from
 * save-success, discard, and cancel paths without checking whether
 * anything was stored. Uses the meta's chunkCount when available; also
 * sweeps forward defensively (bounded) so orphan chunks from a corrupt
 * meta can't linger.
 */
export function clearStoredRun(uid: string): void {
  if (typeof localStorage === "undefined") return;
  if (!uid) return;
  const meta = readMetaRaw(uid);
  try {
    localStorage.removeItem(runResumeKey(uid));
  } catch {
    // Best-effort.
  }
  const known = meta?.chunkCount ?? 0;
  // Remove the known chunks, then keep sweeping until the first gap so
  // a stale run with more chunks than a corrupt meta claims is still
  // fully cleaned. Hard cap guards against an unbounded loop.
  const CAP = 100_000;
  for (let i = 0; i < CAP; i++) {
    const key = runResumeChunkKey(uid, i);
    let present: string | null;
    try {
      present = localStorage.getItem(key);
    } catch {
      break;
    }
    if (present === null && i >= known) break;
    try {
      localStorage.removeItem(key);
    } catch {
      // Best-effort.
    }
  }
}

// ─── Internal validation ────────────────────────────────────────────

/**
 * Defensive shape check for the META record. Doesn't deep-validate
 * RunConfig — if that type drifts, the stored entry would also have
 * been written by the same drifted code, so it stays internally
 * consistent. Only the top-level keys the read path dereferences are
 * checked.
 */
function isValidMeta(value: unknown): value is StoredMeta {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (typeof r.v !== "number") return false;
  if (typeof r.startedAt !== "number") return false;
  if (typeof r.accumulatedSeconds !== "number") return false;
  if (typeof r.isRunning !== "boolean") return false;
  if (typeof r.lastWriteAt !== "number") return false;
  if (typeof r.pointCount !== "number") return false;
  if (typeof r.chunkCount !== "number") return false;
  if (r.phase !== "active" && r.phase !== "paused") return false;
  if (!r.config || typeof r.config !== "object") return false;
  return true;
}
