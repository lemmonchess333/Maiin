import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";
import {
  readJson,
  readString,
  remove,
  writeJson,
  writeString,
} from "./localStore";

/** Account-scoped consent. Both choices are off until the athlete turns them on. */
export interface ConnectedTrainingPrefs {
  useWatchForRuns: boolean;
  saveWorkoutsToHealth: boolean;
}

export const DEFAULT_CONNECTED_TRAINING_PREFS: ConnectedTrainingPrefs = {
  useWatchForRuns: false,
  saveWorkoutsToHealth: false,
};

export type ConnectedTrainingPrefKey = keyof ConnectedTrainingPrefs;

const LOCAL_EXPORT_OFF_PREFIX = "tropos:health-workout-export-off:v1:";
const LOCAL_EXPORT_CONSENT_PREFIX = "tropos:health-workout-consent:v1:";
const exportOffThisLaunch = new Set<string>();
const LOCAL_WATCH_OFF_PREFIX = "tropos:watch-run-off:v1:";
const watchOffThisLaunch = new Set<string>();

function localWatchOffKey(uid: string): string {
  return `${LOCAL_WATCH_OFF_PREFIX}${encodeURIComponent(uid)}`;
}

/** A failed account opt-out must not let a stale server preference restart the Watch. */
export function isWatchRunLocallyDisabled(uid: string): boolean {
  if (!uid || watchOffThisLaunch.has(uid)) return true;
  return readString(localWatchOffKey(uid)) === "1";
}

/** Persist the device veto before disabling native Watch runs. */
export function setWatchRunLocallyDisabled(
  uid: string,
  disabled: boolean
): boolean {
  if (!uid) return false;
  const stored = disabled
    ? writeString(localWatchOffKey(uid), "1")
    : remove(localWatchOffKey(uid));
  if (!stored) return false;
  if (disabled) watchOffThisLaunch.add(uid);
  else watchOffThisLaunch.delete(uid);
  return true;
}

function localExportOffKey(uid: string): string {
  return `${LOCAL_EXPORT_OFF_PREFIX}${encodeURIComponent(uid)}`;
}

function localExportConsentKey(uid: string): string {
  return `${LOCAL_EXPORT_CONSENT_PREFIX}${encodeURIComponent(uid)}`;
}

/** Identifies the explicit opt-in that was current on this phone at Save.
 * A later off/on cycle creates a different ID, so old intents cannot export. */
export function readWorkoutExportLocalConsent(
  uid: string
): { id: string; enabledAtMs: number } | null {
  if (!uid) return null;
  const value = readJson<unknown>(localExportConsentKey(uid), null);
  if (!value || typeof value !== "object") return null;
  const consent = value as Record<string, unknown>;
  return typeof consent.id === "string" &&
    consent.id.length > 0 &&
    typeof consent.enabledAtMs === "number" &&
    Number.isFinite(consent.enabledAtMs) &&
    consent.enabledAtMs > 0
    ? { id: consent.id, enabledAtMs: consent.enabledAtMs }
    : null;
}

function saveWorkoutExportLocalConsent(
  uid: string,
  value: { id: string; enabledAtMs: number } | null
): void {
  if (value) writeJson(localExportConsentKey(uid), value);
  else remove(localExportConsentKey(uid));
  // The server choice is still authoritative. A missing local receipt
  // falls back to the stricter server-time check at Save.
}

/** Immediate device veto for a user who turns off export during a retry. */
export function isWorkoutExportLocallyDisabled(uid: string): boolean {
  if (!uid || exportOffThisLaunch.has(uid)) return true;
  return readString(localExportOffKey(uid)) === "1";
}

/** Returns whether the device veto was durably stored; memory still fails closed. */
export function setWorkoutExportLocallyDisabled(
  uid: string,
  disabled: boolean
): boolean {
  if (!uid) return false;
  if (disabled) exportOffThisLaunch.add(uid);
  else exportOffThisLaunch.delete(uid);
  return disabled
    ? writeString(localExportOffKey(uid), "1")
    : remove(localExportOffKey(uid));
}

function settingsRef(uid: string) {
  return doc(db, "users", uid, "settings", "connectedTraining");
}

function parsePrefs(value: Record<string, unknown>): ConnectedTrainingPrefs {
  return {
    useWatchForRuns: value.useWatchForRuns === true,
    saveWorkoutsToHealth: value.saveWorkoutsToHealth === true,
  };
}

/** A failed or stale-account read never becomes permission to write Health data. */
export async function loadConnectedTrainingPrefs(
  uid: string
): Promise<{ prefs: ConnectedTrainingPrefs; ok: boolean }> {
  if (!uid || auth.currentUser?.uid !== uid) {
    return { prefs: DEFAULT_CONNECTED_TRAINING_PREFS, ok: false };
  }
  try {
    const snapshot = await getDoc(settingsRef(uid));
    if (auth.currentUser?.uid !== uid) {
      return { prefs: DEFAULT_CONNECTED_TRAINING_PREFS, ok: false };
    }
    return {
      prefs: parsePrefs(snapshot.exists() ? snapshot.data() : {}),
      ok: true,
    };
  } catch (error) {
    logger.error("[connectedTraining] settings load failed", error);
    return { prefs: DEFAULT_CONNECTED_TRAINING_PREFS, ok: false };
  }
}

/** Resolve the server write before showing the new consent as saved. */
export async function saveConnectedTrainingPref(
  uid: string,
  key: ConnectedTrainingPrefKey,
  enabled: boolean
): Promise<boolean> {
  if (!uid || auth.currentUser?.uid !== uid) return false;
  try {
    const enabledAtMs = Date.now();
    const consentId =
      key === "saveWorkoutsToHealth" && enabled ? crypto.randomUUID() : null;
    await setDocGuarded(
      settingsRef(uid),
      {
        [key]: enabled,
        // A provisional Save made while Settings is still loading may only
        // export when the server can prove opt-in preceded that Save.
        ...(key === "saveWorkoutsToHealth"
          ? {
              workoutExportEnabledAt: enabled ? serverTimestamp() : null,
              workoutExportConsentId: consentId,
            }
          : {}),
      },
      { merge: true }
    );
    if (auth.currentUser?.uid !== uid) return false;
    if (key === "saveWorkoutsToHealth")
      saveWorkoutExportLocalConsent(
        uid,
        consentId ? { id: consentId, enabledAtMs } : null
      );
    return true;
  } catch (error) {
    logger.error("[connectedTraining] settings save failed", error);
    return false;
  }
}
