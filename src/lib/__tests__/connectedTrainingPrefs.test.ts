// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentUid: string | null = "u1";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return currentUid ? { uid: currentUid } : null;
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import {
  isWatchRunLocallyDisabled,
  isWorkoutExportLocallyDisabled,
  readWorkoutExportLocalConsent,
  loadConnectedTrainingPrefs,
  saveConnectedTrainingPref,
  setWatchRunLocallyDisabled,
  setWorkoutExportLocallyDisabled,
} from "@/lib/connectedTrainingPrefs";
import {
  deferReads,
  pendingReads,
  readDoc,
  releaseRead,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const U1 = "users/u1/settings/connectedTraining";
const readPrefs = async (uid: string) =>
  (await loadConnectedTrainingPrefs(uid)).prefs;

beforeEach(() => {
  resetFirestore();
  currentUid = "u1";
  localStorage.clear();
  setWatchRunLocallyDisabled("u1", false);
  setWatchRunLocallyDisabled("u2", false);
  setWorkoutExportLocallyDisabled("u1", false);
  setWorkoutExportLocallyDisabled("u2", false);
});

describe("connected training consent", () => {
  it("keeps both capabilities off for an untouched or malformed account", async () => {
    expect(await readPrefs("u1")).toEqual({
      useWatchForRuns: false,
      saveWorkoutsToHealth: false,
    });
    seedFirestore({
      [U1]: { useWatchForRuns: "true", saveWorkoutsToHealth: 1 },
    });
    expect(await readPrefs("u1")).toEqual({
      useWatchForRuns: false,
      saveWorkoutsToHealth: false,
    });
  });

  it("does not return a prior account's opt-in after an account switch", async () => {
    seedFirestore({ [U1]: { saveWorkoutsToHealth: true } });
    deferReads();
    const read = readPrefs("u1");
    await vi.waitFor(() => expect(pendingReads()).toEqual([U1]));
    currentUid = "u2";
    releaseRead(0);
    expect(await read).toEqual({
      useWatchForRuns: false,
      saveWorkoutsToHealth: false,
    });
    expect(
      await saveConnectedTrainingPref("u1", "saveWorkoutsToHealth", true)
    ).toBe(false);
  });

  it("saves each choice independently, leaving the other consent intact", async () => {
    seedFirestore({ [U1]: { useWatchForRuns: true } });
    expect(
      await saveConnectedTrainingPref("u1", "saveWorkoutsToHealth", true)
    ).toBe(true);
    expect(readDoc(U1)).toMatchObject({
      useWatchForRuns: true,
      saveWorkoutsToHealth: true,
    });
    expect(readDoc(U1)).toHaveProperty("workoutExportEnabledAt");
    expect(readDoc(U1)).toHaveProperty("workoutExportConsentId");
    expect(readWorkoutExportLocalConsent("u1")?.id).toBe(
      (readDoc(U1) as { workoutExportConsentId: string }).workoutExportConsentId
    );
    expect(
      await saveConnectedTrainingPref("u1", "saveWorkoutsToHealth", false)
    ).toBe(true);
    expect(readDoc(U1)).toMatchObject({
      useWatchForRuns: true,
      saveWorkoutsToHealth: false,
      workoutExportEnabledAt: null,
      workoutExportConsentId: null,
    });
    expect(readWorkoutExportLocalConsent("u1")).toBeNull();
  });

  it("vetoes export on this device immediately without affecting another account", () => {
    expect(setWorkoutExportLocallyDisabled("u1", true)).toBe(true);
    expect(isWorkoutExportLocallyDisabled("u1")).toBe(true);
    expect(isWorkoutExportLocallyDisabled("u2")).toBe(false);
    expect(setWorkoutExportLocallyDisabled("u1", false)).toBe(true);
    expect(isWorkoutExportLocallyDisabled("u1")).toBe(false);
  });

  it("persists a Watch-off veto for only the account that turned it off", () => {
    expect(setWatchRunLocallyDisabled("u1", true)).toBe(true);
    expect(isWatchRunLocallyDisabled("u1")).toBe(true);
    expect(isWatchRunLocallyDisabled("u2")).toBe(false);
    expect(localStorage.getItem("tropos:watch-run-off:v1:u1")).toBe("1");
    expect(setWatchRunLocallyDisabled("u1", false)).toBe(true);
    expect(isWatchRunLocallyDisabled("u1")).toBe(false);
  });
});
