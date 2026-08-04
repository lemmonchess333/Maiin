/**
 * The completion screen's header stats — pinned because they disagreed with
 * each other on a real session.
 *
 * A device screenshot (2026-08-04) showed "Legs — Deadlift Focus" reporting
 * SETS 4 and VOLUME 240kg while the only exercise listed read
 * "Cable Crunch — 10 kg × 12 — 2/2 sets". Three numbers, one session, two
 * different definitions of a set: VOLUME and the per-exercise rows both
 * excluded the auto-generated warm-up ramp, and SETS did not.
 *
 * This file exists because the screen had no test at all, which is how the
 * inconsistency survived — the same reason `stallDetection` and the weekly
 * volume card were untested when their bugs shipped.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import SessionCompleteScreen from "../SessionCompleteScreen";
import type { ProgramExercise } from "@/features/program/programTypes";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    profile: { preferredWeightUnit: "kg" },
    user: { uid: "u1" },
  }),
}));
// Not under test here, and it pulls the streaks provider + Firestore in.
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));

function exercise(name: string, sets: number): ProgramExercise {
  return {
    name,
    exerciseId: "cable-crunch",
    instanceId: `i-${name}`,
    movementCategory: "core",
    sets,
    reps: 12,
    baseReps: 12,
    weight: 10,
    progressionType: "double",
    lastSuccessfulWeight: 10,
    lastAttemptedWeight: 10,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  } as unknown as ProgramExercise;
}

function renderScreen(setLogs: Array<Array<Record<string, unknown>>>) {
  return render(
    <SessionCompleteScreen
      dayName="Legs — Deadlift Focus"
      exercises={[exercise("Cable Crunch", 2)]}
      setLogs={setLogs as never}
      firedPRs={new Map()}
      sessionDurationMinutes={24}
      completing={false}
      onFinish={() => {}}
      onClose={() => {}}
    />
  );
}

describe("SessionCompleteScreen — header stats agree with each other", () => {
  it("SETS counts working sets only, not the warm-up ramp", () => {
    // The production shape: two warm-up rows the ramp generated, two working
    // sets the user actually prescribed. Pre-fix this rendered SETS 4.
    renderScreen([
      [
        { reps: 10, weight: 5, completed: true, type: "warmup" },
        { reps: 10, weight: 7.5, completed: true, type: "warmup" },
        { reps: 12, weight: 10, completed: true, type: "working" },
        { reps: 12, weight: 10, completed: true, type: "working" },
      ],
    ]);

    // The per-exercise row is the number the user reads as authoritative.
    expect(screen.getByText("2/2 sets")).toBeInTheDocument();
    // The header stat must now say the same thing.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("4")).toBeNull();
  });

  it("does not count sets the user never completed", () => {
    renderScreen([
      [
        { reps: 12, weight: 10, completed: true, type: "working" },
        { reps: 12, weight: 10, completed: false, type: "working" },
      ],
    ]);
    expect(screen.getByText("1/2 sets")).toBeInTheDocument();
  });

  it("renders the day name without the raw dayType suffix", () => {
    // Guards the 2026-08-04 fix: this used to render
    // "Legs — Deadlift Focus · legs", and "· full_body" on full-body days.
    renderScreen([
      [{ reps: 12, weight: 10, completed: true, type: "working" }],
    ]);
    expect(screen.getByText("Legs — Deadlift Focus")).toBeInTheDocument();
  });
});

/**
 * No share affordance on this screen — the phantom-post regression pin.
 *
 * Until 2026-08-04 this screen carried "Share Workout" (image card) and
 * "Share to Circle". Both fired BEFORE the save, because "Save Workout" is a
 * separate button — so "Share to Circle" → "Close without saving" published
 * a `session_completed` event for a session that was never written. Sharing
 * moved to `/workout/:id`, where the record exists first and that sequence
 * is impossible.
 *
 * This asserts absence, which is normally a weak test. It earns its place
 * because the thing it forbids is a defect that already shipped once, and
 * the natural instinct when adding a feature here is to put a share button
 * back on the celebration screen.
 */
describe("SessionCompleteScreen — sharing lives on the saved record", () => {
  const twoWorking = [
    [
      { reps: 12, weight: 10, completed: true, type: "working" },
      { reps: 12, weight: 10, completed: true, type: "working" },
    ],
  ];

  it("offers no way to share a session that has not been saved yet", () => {
    renderScreen(twoWorking);

    expect(screen.queryByRole("button", { name: /share/i })).toBeNull();
    expect(screen.queryByText(/share to circle/i)).toBeNull();
  });

  it("still offers exactly Save and Close", () => {
    renderScreen(twoWorking);

    expect(screen.getByRole("button", { name: /save workout/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /close without saving/i })
    ).toBeTruthy();
  });
});
