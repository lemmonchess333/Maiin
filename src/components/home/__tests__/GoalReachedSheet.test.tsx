/**
 * GoalReachedSheet contract tests.
 *
 * The prompt half of the goal-crossed fix (probe sweep 2026-08-05): a cutter
 * who arrives is ASKED about maintenance — never silently flipped, never
 * silently kept cutting. "Switch to maintenance" must write exactly what the
 * Settings surface would (shared buildGoalWeightPersistPayload recipe) plus
 * the same programState.goal mirror; "Keep my current plan" must write
 * NOTHING and still resolve the ask.
 *
 * ADR-0009: bare vi.mock("firebase/firestore") + seedFirestore for the
 * programState mirror's read-then-merge.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  seedFirestore,
  resetFirestore,
  writeLog,
} from "@/test/firestoreHarness";
import GoalReachedSheet from "../GoalReachedSheet";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

const UID = "u1";
const PROGRAM = `users/${UID}/programState/current`;

function cutterProfile(): UserProfile {
  return {
    uid: UID,
    weightKg: 76.5,
    heightCm: 180,
    age: 30,
    activityLevel: "moderate",
    sex: "male",
    goalWeightKg: 78,
    weeklyRateKg: -0.5,
    program: { goal: "cut", startWeight: 92, currentPhase: "build" },
  } as unknown as UserProfile;
}

function setup(programGoal: string | null = "cut") {
  resetFirestore();
  if (programGoal !== null) {
    seedFirestore({ [PROGRAM]: { goal: programGoal } });
  }
  const updateProfile = vi.fn(
    async (_patch: Partial<UserProfile>) =>
      ({ ok: true }) as UpdateProfileResult
  );
  const onResolved = vi.fn();
  render(
    <GoalReachedSheet
      open={true}
      offer={{ storedDirection: "lose", goalWeightKg: 78, currentKg: 76.5 }}
      profile={cutterProfile()}
      uid={UID}
      updateProfile={updateProfile}
      onResolved={onResolved}
    />
  );
  return { updateProfile, onResolved };
}

describe("GoalReachedSheet", () => {
  beforeEach(() => resetFirestore());

  it("switch-to-maintenance writes the shared recipe and mirrors programState", async () => {
    const { updateProfile, onResolved } = setup("cut");
    fireEvent.click(
      screen.getByRole("button", { name: /Switch to maintenance/i })
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalled());

    expect(updateProfile).toHaveBeenCalledTimes(1);
    const patch = updateProfile.mock.calls[0][0] as Record<string, unknown>;
    // Maintain AT today's weight: goal re-anchored so the reactive Settings
    // surface cannot resolve "gain" against the old 78 and silently undo
    // this choice on its next visit.
    expect(patch.goalWeightKg).toBe(76.5);
    expect(patch.weeklyRateKg).toBe(0);
    expect((patch.program as { goal: string }).goal).toBe("recomp");
    // Carried, not re-seeded.
    expect((patch.program as { startWeight: number }).startWeight).toBe(92);
    // The full target set comes with it — this is the Settings recipe, not
    // a partial write that leaves macros pointing at the old deficit.
    expect(typeof patch.tdeeBase).toBe("number");
    expect(typeof patch.targetProtein).toBe("number");

    // programState.goal mirror — same read-then-merge as SettingsNutrition.
    await waitFor(() => {
      const mirror = writeLog().find(
        (w) => w.path === PROGRAM && w.op.startsWith("set")
      );
      expect(mirror).toBeTruthy();
      expect((mirror!.data as { goal: string }).goal).toBe("recomp");
    });
  });

  it("keep-my-current-plan writes nothing and still resolves the ask", async () => {
    const { updateProfile, onResolved } = setup("cut");
    fireEvent.click(
      screen.getByRole("button", { name: /Keep my current plan/i })
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(updateProfile).not.toHaveBeenCalled();
    expect(
      writeLog().filter((w) => w.path === PROGRAM && w.op.startsWith("set"))
    ).toEqual([]);
  });

  it("skips the programState mirror when the stored goal already matches", async () => {
    const { onResolved } = setup("recomp");
    fireEvent.click(
      screen.getByRole("button", { name: /Switch to maintenance/i })
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(
      writeLog().filter((w) => w.path === PROGRAM && w.op.startsWith("set"))
    ).toEqual([]);
  });
});
