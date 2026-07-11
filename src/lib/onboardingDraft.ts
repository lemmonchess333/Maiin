/**
 * Onboarding draft persistence (D-2 / F-2,
 * docs/frontend-design-principles-2026-07.md).
 *
 * The multi-step onboarding flow used to hold every answer in component
 * state only — a backgrounded PWA reclaim, a WKWebView purge, or an
 * accidental swipe-away destroyed all progress and restarted the user at
 * step 0. That's a first-session abandon moment, and EVERY new user lives
 * in that window (design-for-the-user-base: the cold-start state is one of
 * the most-seen states in the app).
 *
 * This module is the pure, unit-testable persistence layer: a uid-scoped
 * localStorage draft written on every answer/step change, rehydrated on
 * mount, cleared on completion. Onboarding.tsx owns the defaults and the
 * UI; this module owns (de)serialisation and validation.
 *
 * Contract:
 *   - uid-scoped key + uid echoed INSIDE the envelope (PR #820 lesson: a
 *     shared device must never leak one account's draft into another's
 *     flow — the key scopes it, the echo cross-checks it).
 *   - STRICT validation: any missing/mistyped/out-of-vocabulary field
 *     rejects the whole draft (null). Defaults live in Onboarding.tsx
 *     alone — merging "partially valid" drafts over defaults here would
 *     create a second copy of those defaults that drifts (the
 *     tested-copy-vs-running-copy rule).
 *   - Versioned envelope: a future schema change bumps DRAFT_VERSION and
 *     old drafts self-discard.
 *   - TTL 14 days: restoring week-old answers helps a distracted user;
 *     restoring a months-old mid-flow (with e.g. a now-past race date)
 *     confuses more than it saves. Lapsed users past the TTL restart
 *     cleanly.
 *   - Storage failures (quota, private-mode, disabled storage) are
 *     swallowed: the draft is an enhancement, never a gate.
 */

import { logger } from "@/lib/logger";
import {
  VALID_EQUIPMENT,
  VALID_RACE_DISTANCE,
  type Equipment,
  type RaceDistance,
} from "@/features/program/programTypes";

export const DRAFT_VERSION = 1;
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const keyFor = (uid: string) => `tropos.onboarding.draft.${uid}`;

/* Runtime vocabularies for the unions Onboarding.tsx declares locally.
 * TypeScript keeps these honest at the wire-up: Onboarding assigns
 * `draft.gender` etc. straight into its own typed state, so a value added
 * here that Onboarding doesn't know (or vice versa on the draft side)
 * fails the build at the call site. */
export const DRAFT_GENDERS = ["male", "female", "unspecified"] as const;
export const DRAFT_AGE_RANGES = [
  "under-16",
  "16-24",
  "25-34",
  "35-44",
  "45-54",
  "55+",
] as const;
export const DRAFT_PRIMARY_GOALS = [
  "hypertrophy",
  "strength",
  "fat_loss",
  "general",
  "running",
] as const;
export const DRAFT_DAYS_PER_WEEK = [2, 3, 4, 5, 6] as const;
export const DRAFT_RUN_FREQUENCIES = ["regular", "occasional", "none"] as const;
export const DRAFT_RUN_MODES = ["freeform", "structured", "race_prep"] as const;
export const DRAFT_UNITS_HEIGHT = ["cm", "ft"] as const;
export const DRAFT_UNITS_WEIGHT = ["kg", "lbs"] as const;

export interface OnboardingDraft {
  step: number;
  primaryGoal: (typeof DRAFT_PRIMARY_GOALS)[number];
  daysPerWeek: (typeof DRAFT_DAYS_PER_WEEK)[number];
  equipment: Equipment;
  runFrequency: (typeof DRAFT_RUN_FREQUENCIES)[number];
  runMode: (typeof DRAFT_RUN_MODES)[number];
  weeklyRunDays: number;
  raceDistance: RaceDistance;
  raceTargetDate: string;
  injuries: string[];
  gender: (typeof DRAFT_GENDERS)[number];
  ageRange: (typeof DRAFT_AGE_RANGES)[number];
  heightCm: number;
  weightKg: number;
  heightUnit: (typeof DRAFT_UNITS_HEIGHT)[number];
  weightUnit: (typeof DRAFT_UNITS_WEIGHT)[number];
  trainingWhy: string;
}

interface DraftEnvelope {
  v: number;
  uid: string;
  savedAt: number;
  draft: OnboardingDraft;
}

const oneOf = <T extends readonly unknown[]>(
  vocab: T,
  value: unknown
): value is T[number] => vocab.includes(value as T[number]);

const finiteInRange = (value: unknown, min: number, max: number): boolean =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

/**
 * Strict field-by-field validation. `maxStep` comes from the caller
 * (TOTAL_STEPS - 1) so this module doesn't hold a second copy of the flow
 * length that drifts when steps are added/removed — an out-of-range step
 * rejects the draft rather than clamping into a wrong screen.
 */
export function isValidDraft(
  value: unknown,
  maxStep: number
): value is OnboardingDraft {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    finiteInRange(d.step, 0, maxStep) &&
    Number.isInteger(d.step) &&
    oneOf(DRAFT_PRIMARY_GOALS, d.primaryGoal) &&
    oneOf(DRAFT_DAYS_PER_WEEK, d.daysPerWeek) &&
    oneOf(VALID_EQUIPMENT, d.equipment) &&
    oneOf(DRAFT_RUN_FREQUENCIES, d.runFrequency) &&
    oneOf(DRAFT_RUN_MODES, d.runMode) &&
    finiteInRange(d.weeklyRunDays, 0, 7) &&
    oneOf(VALID_RACE_DISTANCE, d.raceDistance) &&
    typeof d.raceTargetDate === "string" &&
    Array.isArray(d.injuries) &&
    (d.injuries as unknown[]).every((i) => typeof i === "string") &&
    oneOf(DRAFT_GENDERS, d.gender) &&
    oneOf(DRAFT_AGE_RANGES, d.ageRange) &&
    finiteInRange(d.heightCm, 100, 250) &&
    finiteInRange(d.weightKg, 30, 300) &&
    oneOf(DRAFT_UNITS_HEIGHT, d.heightUnit) &&
    oneOf(DRAFT_UNITS_WEIGHT, d.weightUnit) &&
    typeof d.trainingWhy === "string"
  );
}

/** Persist the draft. Best-effort — storage failures never surface. */
export function saveOnboardingDraft(uid: string, draft: OnboardingDraft): void {
  if (!uid) return;
  try {
    const envelope: DraftEnvelope = {
      v: DRAFT_VERSION,
      uid,
      savedAt: Date.now(),
      draft,
    };
    localStorage.setItem(keyFor(uid), JSON.stringify(envelope));
  } catch (err) {
    logger.warn("[OnboardingDraft] save failed", err);
  }
}

/**
 * Load and validate the current user's draft. Null (fresh start) on: no
 * draft, unparseable JSON, version mismatch, uid mismatch, expired TTL, or
 * any invalid field. Invalid/expired blobs are proactively removed.
 */
export function loadOnboardingDraft(
  uid: string,
  maxStep: number
): OnboardingDraft | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(keyFor(uid));
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Partial<DraftEnvelope> | null;
    if (
      !envelope ||
      envelope.v !== DRAFT_VERSION ||
      envelope.uid !== uid ||
      typeof envelope.savedAt !== "number" ||
      Date.now() - envelope.savedAt > DRAFT_TTL_MS ||
      !isValidDraft(envelope.draft, maxStep)
    ) {
      localStorage.removeItem(keyFor(uid));
      return null;
    }
    return envelope.draft;
  } catch (err) {
    logger.warn("[OnboardingDraft] load failed", err);
    try {
      localStorage.removeItem(keyFor(uid));
    } catch {
      /* storage unavailable — nothing to clean */
    }
    return null;
  }
}

/** Remove the draft — called once onboarding completes successfully. */
export function clearOnboardingDraft(uid: string): void {
  if (!uid) return;
  try {
    localStorage.removeItem(keyFor(uid));
  } catch (err) {
    logger.warn("[OnboardingDraft] clear failed", err);
  }
}
