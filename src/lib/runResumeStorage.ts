/**
 * localStorage persistence for in-flight runs. Phase B3 of the
 * Run-setup audit — closes the data-loss surface where a force-close,
 * tab crash, or long background suspend lost the entire run.
 *
 * Schema is versioned (`v: 1`); a bump invalidates every existing
 * entry on the next read, so a future field migration can ship
 * without a migration script. The 6-hour cutoff handles the case
 * where a user starts a run, abandons it, and reopens /run days
 * later — old snapshots silently discard rather than offering a
 * stale Resume prompt.
 *
 * Write path is best-effort: try/catch around every storage op so
 * a quota-exceeded or private-mode environment falls through to
 * "run continues in memory, no recoverability" instead of breaking
 * the live run. localStorage is also unavailable during SSR / Node
 * tests — every helper short-circuits cleanly when the global is
 * absent.
 */

import type { GPSPoint } from "./gps";
import type { RunConfig } from "@/components/run/RunSetupModal";

/** Schema version. Bump invalidates every stored entry on next read. */
export const RUN_RESUME_SCHEMA_VERSION = 1 as const;

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

/** Build the uid-scoped localStorage key for a given user. */
export function runResumeKey(uid: string): string {
  return `${RUN_RESUME_KEY_PREFIX}:${uid}`;
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
   *  the live map accurately. */
  points: GPSPoint[];
  /** ms epoch of the most recent write. Drives the 6h cutoff. */
  lastWriteAt: number;
  /** Run phase at write time. Only the two active states persist;
   *  `waiting` runs aren't worth recovering and `finished` runs
   *  belong in RunSummary, not Resume. */
  phase: "active" | "paused";
}

/**
 * Defensive write — wrapped in try/catch because:
 *   - localStorage quota can throw mid-write (5MB cap)
 *   - private-mode Safari throws on every setItem
 *   - SSR / Node test envs have no `localStorage` global
 *
 * Returns true on success so call sites can debounce / log
 * failures. Never propagates the error — the live run is more
 * important than recoverability.
 */
export function writeStoredRun(uid: string, snapshot: StoredRun): boolean {
  if (typeof localStorage === "undefined") return false;
  if (!uid) return false;
  try {
    localStorage.setItem(runResumeKey(uid), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads + validates. Returns null when:
 *   - localStorage unavailable
 *   - no stored entry
 *   - JSON malformed
 *   - schema version mismatch
 *   - older than RUN_RESUME_MAX_AGE_MS
 *   - missing required fields (defensive — a hand-edited entry
 *     shouldn't crash the app)
 *
 * Side effect: any of the discard branches above also clears the
 * stored entry so subsequent reads don't keep trying. Also drops the
 * legacy un-scoped key on every read (one-time migration — see
 * LEGACY_RUN_RESUME_KEY).
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
    // Corrupt entry — drop it so we don't re-read it next mount.
    clearStoredRun(uid);
    return null;
  }

  if (!isValidStoredRun(parsed)) {
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

  return parsed;
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
 * Idempotent delete. Safe to call from save-success, discard, and
 * cancel paths without checking whether anything was stored.
 */
export function clearStoredRun(uid: string): void {
  if (typeof localStorage === "undefined") return;
  if (!uid) return;
  try {
    localStorage.removeItem(runResumeKey(uid));
  } catch {
    // Best-effort.
  }
}

// ─── Internal validation ────────────────────────────────────────────

/**
 * Defensive shape check. Doesn't deep-validate RunConfig or
 * GPSPoint — if those types drift, the stored entry would also
 * have been written by the same drifted code, so the shape stays
 * internally consistent. We only check the top-level required
 * keys that the read path will dereference.
 */
function isValidStoredRun(value: unknown): value is StoredRun {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (typeof r.v !== "number") return false;
  if (typeof r.startedAt !== "number") return false;
  if (typeof r.accumulatedSeconds !== "number") return false;
  if (typeof r.isRunning !== "boolean") return false;
  if (typeof r.lastWriteAt !== "number") return false;
  if (r.phase !== "active" && r.phase !== "paused") return false;
  if (!r.config || typeof r.config !== "object") return false;
  if (!Array.isArray(r.points)) return false;
  return true;
}
