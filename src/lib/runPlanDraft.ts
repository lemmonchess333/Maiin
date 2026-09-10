/**
 * Run-plan draft persistence.
 *
 * The editor held its whole draft in component state, so leaving the page
 * unmounted it and discarded the edits. The journey that loses work is an
 * ordinary one: the page's own "open full settings" link navigates away,
 * and coming back showed the saved plan as though nothing had been typed.
 * Race edits are the expensive kind to retype — a date, an event name, a
 * goal time.
 *
 * Same contract as `onboardingDraft`, deliberately, because it was
 * written against the same hazards:
 *
 *   - uid-scoped key AND the uid echoed inside the envelope. On a shared
 *     device the key scopes the draft and the echo cross-checks it, so a
 *     value moved or copied between keys cannot cross accounts.
 *   - STRICT validation — any missing, mistyped or out-of-vocabulary
 *     field rejects the WHOLE draft. Defaults live in the editor alone;
 *     merging a partial draft over them here would be a second copy of
 *     those defaults, free to drift.
 *   - Versioned envelope, so a schema change self-discards old drafts
 *     instead of half-restoring them.
 *   - Storage failures swallowed: a draft is an enhancement, never a gate.
 *
 * TTL is ONE DAY rather than onboarding's fourteen. The journey this
 * exists for is measured in minutes — leave for settings, come back — and
 * a race draft ages badly in a way onboarding answers do not: a target
 * date can fall into the past while the draft sits, so restoring
 * week-old race edits would reinstate a plan the user has since abandoned
 * and may no longer be valid at all.
 *
 * The raw goal-time STRING is persisted, invalid included. That is the
 * point: an unfinished edit is what needs preserving, and the editor
 * already refuses to save a malformed one.
 */

import { logger } from "@/lib/logger";
import { readString, remove, writeJson, scopedKey } from "@/lib/localStore";
import {
  VALID_RACE_DISTANCE,
  type RaceDistance,
} from "@/features/program/programTypes";
import type {
  RunVolumePreset,
  RunDifficultyPreset,
} from "@/features/program/runScheduler";

export const RUN_PLAN_DRAFT_VERSION = 1;
export const RUN_PLAN_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_BASE = "tropos.runPlan.draft";
const keyFor = (uid: string) => scopedKey(KEY_BASE, uid);

const RUN_MODES = ["freeform", "race_prep"] as const;
/* Restated from `runScheduler`'s unions rather than imported as values,
   because those are TYPE-only and carry no runtime array. The satisfies
   clauses below are what keep the two honest: adding a preset there
   without adding it here is a build error, not a silent rejection of
   every draft that uses it. */
const VOLUMES = [
  "lighter",
  "standard",
  "bigger",
] as const satisfies readonly RunVolumePreset[];
const DIFFICULTIES = [
  "gentler",
  "standard",
  "harder",
] as const satisfies readonly RunDifficultyPreset[];

export interface RunPlanDraft {
  runMode: (typeof RUN_MODES)[number];
  weeklyRunDays: number;
  raceDistance: RaceDistance;
  raceTargetDate: string;
  raceEventName: string;
  /** The string the user typed, not the parsed seconds. */
  raceTimeStr: string;
  raceEventSpaceId: string;
  runVolume: RunVolumePreset;
  runDifficulty: RunDifficultyPreset;
}

interface Envelope extends RunPlanDraft {
  v: number;
  uid: string;
  savedAt: number;
}

function isOneOf<T extends readonly string[]>(
  vocab: T,
  value: unknown
): value is T[number] {
  return (
    typeof value === "string" && (vocab as readonly string[]).includes(value)
  );
}

/** Write the draft. Returns false when storage refused it. */
export function saveRunPlanDraft(uid: string, draft: RunPlanDraft): boolean {
  const envelope: Envelope = {
    ...draft,
    v: RUN_PLAN_DRAFT_VERSION,
    uid,
    savedAt: Date.now(),
  };
  return writeJson(keyFor(uid), envelope);
}

export function clearRunPlanDraft(uid: string): void {
  remove(keyFor(uid));
}

/**
 * Read a draft back, or null when there is nothing trustworthy stored.
 *
 * Every rejection path returns null rather than a partial object, and the
 * stored value is cleared when it is structurally wrong so a corrupt
 * entry cannot be re-parsed on every mount for the rest of the TTL.
 */
export function loadRunPlanDraft(uid: string): RunPlanDraft | null {
  const raw = readString(keyFor(uid));
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    remove(keyFor(uid));
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    remove(keyFor(uid));
    return null;
  }
  const e = parsed as Partial<Envelope>;

  // Version and identity first: a mismatch is not corruption, so it is
  // discarded quietly rather than logged.
  if (e.v !== RUN_PLAN_DRAFT_VERSION || e.uid !== uid) {
    remove(keyFor(uid));
    return null;
  }
  if (
    typeof e.savedAt !== "number" ||
    Date.now() - e.savedAt > RUN_PLAN_DRAFT_TTL_MS
  ) {
    remove(keyFor(uid));
    return null;
  }

  if (
    !isOneOf(RUN_MODES, e.runMode) ||
    !isOneOf(VALID_RACE_DISTANCE, e.raceDistance) ||
    !isOneOf(VOLUMES, e.runVolume) ||
    !isOneOf(DIFFICULTIES, e.runDifficulty) ||
    typeof e.weeklyRunDays !== "number" ||
    !Number.isFinite(e.weeklyRunDays) ||
    e.weeklyRunDays < 0 ||
    e.weeklyRunDays > 7 ||
    typeof e.raceTargetDate !== "string" ||
    typeof e.raceEventName !== "string" ||
    typeof e.raceTimeStr !== "string" ||
    typeof e.raceEventSpaceId !== "string"
  ) {
    logger.error("runPlanDraft: discarding a malformed draft");
    remove(keyFor(uid));
    return null;
  }

  return {
    runMode: e.runMode,
    weeklyRunDays: e.weeklyRunDays,
    raceDistance: e.raceDistance,
    raceTargetDate: e.raceTargetDate,
    raceEventName: e.raceEventName,
    raceTimeStr: e.raceTimeStr,
    raceEventSpaceId: e.raceEventSpaceId,
    runVolume: e.runVolume,
    runDifficulty: e.runDifficulty,
  };
}
