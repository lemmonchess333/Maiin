/**
 * RACE-EVENTS-REMOTE (locked 2026-07-20) — server-fed race event
 * metadata, so date updates reach every platform (including stale
 * native binaries) without an app release.
 *
 * Model: git is the SOURCE OF TRUTH (spaceDefs.ts, reviewed via PR);
 * CI mirrors the race event blocks into the Firestore doc
 * `config/raceEvents` on merge (sync-race-events.yml). The client
 * fetches that doc LAZILY — once per session, on the first race
 * surface touched — and merges it OVER the bundled event blocks.
 * Bundled values are the seed and the fallback: a failed read, an
 * offline session, or a malformed doc field always degrades to the
 * shipped config, never to a blank.
 *
 * Every field is validated on the way in (sanitizeRaceEventOverrides)
 * so a corrupt doc can never inject junk: an invalid field simply
 * loses to the bundled value; unknown space ids are dropped entirely.
 *
 * The fetch uses a dynamic import of the firebase module so merely
 * importing this file (config consumers, tests) never initialises
 * Firebase.
 */
import { useEffect, useSyncExternalStore } from "react";
import { logger } from "@/lib/logger";
import { raceSpaceDefs, type SpaceDef, type SpaceEventInfo } from "./spaceDefs";

export type RaceEventOverride = Partial<SpaceEventInfo>;
export type RaceEventOverrides = Record<string, RaceEventOverride>;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ELEVATIONS = ["flat", "rolling", "hilly"] as const;

/**
 * Validate a raw doc payload into safe overrides. Per-field: anything
 * invalid is dropped (the bundled value wins); ids that aren't
 * race-kind spaces are dropped wholesale.
 */
export function sanitizeRaceEventOverrides(raw: unknown): RaceEventOverrides {
  if (typeof raw !== "object" || raw === null) return {};
  const raceIds = new Set(raceSpaceDefs().map((d) => d.id));
  const out: RaceEventOverrides = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!raceIds.has(id)) continue;
    if (typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    const o: RaceEventOverride = {};
    if (typeof v.dateKey === "string" && DATE_KEY_RE.test(v.dateKey)) {
      o.dateKey = v.dateKey;
    }
    if (
      typeof v.websiteUrl === "string" &&
      v.websiteUrl.startsWith("https://") &&
      v.websiteUrl.length <= 200
    ) {
      o.websiteUrl = v.websiteUrl;
    }
    if (
      typeof v.elevation === "string" &&
      (ELEVATIONS as readonly string[]).includes(v.elevation)
    ) {
      o.elevation = v.elevation as SpaceEventInfo["elevation"];
    }
    if (
      typeof v.city === "string" &&
      v.city.length > 0 &&
      v.city.length <= 40
    ) {
      o.city = v.city;
    }
    if (
      typeof v.countryFlag === "string" &&
      v.countryFlag.length > 0 &&
      v.countryFlag.length <= 20
    ) {
      o.countryFlag = v.countryFlag;
    }
    if (Object.keys(o).length > 0) out[id] = o;
  }
  return out;
}

/** The def's event with any validated overrides merged over it. */
export function resolveRaceEvent(
  def: SpaceDef,
  overrides: RaceEventOverrides
): SpaceEventInfo | undefined {
  if (!def.event) return undefined;
  const o = overrides[def.id];
  return o ? { ...def.event, ...o } : def.event;
}

/** Race defs with resolved events baked in (new objects — the bundled
 *  config is never mutated). */
export function applyRaceEventOverrides(
  defs: SpaceDef[],
  overrides: RaceEventOverrides
): SpaceDef[] {
  return defs.map((d) =>
    d.event ? { ...d, event: resolveRaceEvent(d, overrides) } : d
  );
}

/**
 * Upcoming races on RESOLVED dates — the override-aware sibling of
 * spaceDefs' upcomingRaceSpaceDefs. A server-side date can bring a
 * bundled-past race back (the stale-binary rescue this feature
 * exists for) or retire one early; sorting follows the resolved
 * dates too.
 */
export function upcomingResolvedRaceDefs(
  overrides: RaceEventOverrides,
  todayKey: string
): SpaceDef[] {
  return applyRaceEventOverrides(raceSpaceDefs(), overrides)
    .filter((d) => (d.event?.dateKey ?? "") >= todayKey)
    .sort((a, b) =>
      (a.event?.dateKey ?? "").localeCompare(b.event?.dateKey ?? "")
    );
}

/* ── Session store (fetch once, share everywhere) ─────────────────── */

let overrides: RaceEventOverrides = {};
let fetchStarted = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): RaceEventOverrides {
  return overrides;
}

/** Kick the once-per-session fetch. Safe to call repeatedly. */
export function ensureRaceEventOverridesFetched(): void {
  if (fetchStarted) return;
  fetchStarted = true;
  (async () => {
    try {
      const [{ db }, { doc, getDoc }] = await Promise.all([
        import("@/lib/firebase"),
        import("firebase/firestore"),
      ]);
      const snap = await getDoc(doc(db, "config", "raceEvents"));
      const next = sanitizeRaceEventOverrides(snap.data()?.events);
      if (Object.keys(next).length > 0) {
        overrides = next;
        emit();
      }
    } catch (e) {
      // Bundled config is the fallback — a failed read is calm.
      logger.warn("[raceEventOverrides] fetch failed, using bundled", e);
    }
  })();
}

/** Test-only reset (module state is per-session by design). */
export function __resetRaceEventOverridesForTests(): void {
  overrides = {};
  fetchStarted = false;
  listeners.clear();
}

/**
 * The validated server overrides — `{}` until the session fetch
 * lands (bundled config renders meanwhile), then all subscribed
 * surfaces re-render together.
 */
export function useRaceEventOverrides(): RaceEventOverrides {
  useEffect(ensureRaceEventOverridesFetched, []);
  return useSyncExternalStore(subscribe, getSnapshot);
}
