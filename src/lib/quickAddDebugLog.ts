/**
 * F5.2 diagnostic logger for the Quick Add chip-change mystery.
 *
 * Real-usage repro (Snacks slot, no interaction, 3-minute gap)
 * showed Quick Add chips changing across the idle window:
 *
 *   A (19:01): Oatmeal & Banana, Crunch Minis
 *   B (19:04): Crunch Minis, Breakfast Ingredients
 *
 * F4.1 had pinned the time-of-day favourite-window so an
 * unrelated useMemo recompute couldn't roll in a different
 * favourite set as the hour changed. The fact that chips still
 * change post-F4.1 means there's an upstream source we haven't
 * named — most plausibly the `meals` or `useFoodFavourites`
 * Firestore subscription re-emitting on tab focus / background
 * sync.
 *
 * This module is scaffolding. It instruments five capture points
 * across `Food.tsx`, `useMeals.ts`, and `useFoodFavourites.ts`,
 * gated on a localStorage flag so production users never see
 * console output. Once a captured A→B pair lands in chat, the
 * F5.3 fix commit will rip this module + all five call sites out
 * in one go.
 *
 * Enable in DevTools:
 *   localStorage.setItem('tropos.debug.quickAdd', '1')
 *   location.reload()
 *
 * The visibility trail persists across reloads via sessionStorage
 * so transitions that happened before DevTools was opened are
 * recoverable on the next page load.
 */

const FLAG_KEY = 'tropos.debug.quickAdd';
const VISIBILITY_TRAIL_KEY = 'tropos.debug.quickAdd.visibilityTrail';
const PREFIX = '[F5.2 qa]';
const VISIBILITY_TRAIL_CAP = 50;

export function qaDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Flat single-line log. Use for 2–5 field capture points where
 * a collapsed group would be more friction than benefit.
 */
export function qaLog(scope: string, fields: Record<string, unknown>): void {
  if (!qaDebugEnabled()) return;
  console.log(`${PREFIX} ${scope}`, { ts: nowIso(), ...fields });
}

/**
 * Collapsed-group log for the big quickMeals capture — too many
 * fields to scan inline. User expands the group in DevTools.
 */
export function qaLogGroup(scope: string, fields: Record<string, unknown>): void {
  if (!qaDebugEnabled()) return;
  console.groupCollapsed(`${PREFIX} ${scope} — ${nowIso()}`);
  for (const [k, v] of Object.entries(fields)) {
    console.log(`${k}:`, v);
  }
  console.groupEnd();
}

export interface VisibilityTrailEntry {
  ts: string;
  state: 'visible' | 'hidden';
}

/**
 * Append a visibility-change transition to sessionStorage so
 * transitions that happened before DevTools was opened are
 * recoverable on the next reload. Capped at 50 entries to avoid
 * unbounded growth on long-lived sessions.
 */
export function qaPersistVisibility(state: 'visible' | 'hidden'): void {
  if (!qaDebugEnabled() || typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(VISIBILITY_TRAIL_KEY);
    const existing: VisibilityTrailEntry[] = raw ? JSON.parse(raw) : [];
    existing.push({ ts: nowIso(), state });
    const trimmed = existing.slice(-VISIBILITY_TRAIL_CAP);
    window.sessionStorage.setItem(VISIBILITY_TRAIL_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage failure is best-effort tolerable for diagnostic data
  }
}

/**
 * Replay the persisted visibility trail at mount so the captured
 * console output includes transitions from prior page loads.
 * No-op when the flag is off or storage is unavailable.
 */
export function qaReplayVisibilityTrail(): void {
  if (!qaDebugEnabled() || typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(VISIBILITY_TRAIL_KEY);
    const trail: VisibilityTrailEntry[] = raw ? JSON.parse(raw) : [];
    if (trail.length > 0) {
      qaLogGroup('visibility trail replay (persisted across reloads)', {
        count: trail.length,
        entries: trail,
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Compute which of a labelled deps array changed against the
 * previous recompute. Stored externally in a useRef on the
 * caller's side — this helper just does the diff. Returns an
 * array of labels whose corresponding deps changed (Object.is
 * reference comparison, matching React's useMemo semantics).
 */
export function qaDepsDiff(
  prev: readonly unknown[] | null,
  current: readonly unknown[],
  labels: readonly string[],
): string[] {
  if (prev === null) return ['<first-recompute>'];
  if (prev.length !== current.length) return ['<length-changed>'];
  const changed: string[] = [];
  for (let i = 0; i < current.length; i++) {
    if (!Object.is(prev[i], current[i])) {
      changed.push(labels[i] ?? `dep[${i}]`);
    }
  }
  return changed;
}
