import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { useRunningStats } from "@/hooks/useRunningStats";
import { starterProgress } from "@/features/program/starterProgress";
import { starterWeekFrom } from "@/features/program/starterWeek";
import { runEvidenceDate } from "@/lib/runExecutionEvidence";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { STARTER } from "@/test/journeyScreens";
import { journeyRunFields } from "../../../../e2e/helpers/journeyRunDoc";
import StarterGoalCard from "../StarterGoalCard";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "runner" } },
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "runner" }));

const plan = starterWeekFrom({
  today: "2026-11-16",
  stage: 1,
  weekSchedule: [
    { day: 3, type: "run" },
    { day: 5, type: "run" },
    { day: 0, type: "run" },
  ],
});

/** The same live runs → progress → card composition as ProgrammeRunSection. */
function LiveStarterGoal() {
  const { runs, loading } = useRunningStats(30);
  const progress = starterProgress(
    plan,
    { startedOn: "2026-11-09" },
    runs.map(runEvidenceDate)
  );
  return (
    <>
      <output>{loading ? "Loading runs" : `${runs.length} saved runs`}</output>
      {progress && <StarterGoalCard progress={progress} />}
    </>
  );
}

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  // Local dates, as both the saved-run window and the journey read them.
  vi.setSystemTime(new Date(2026, 10, 16, 12));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("counts the journey's saved runs as their days arrive, without remounting", async () => {
  for (const run of plan.runDays.slice(0, 2)) {
    const fields = journeyRunFields({
      run,
      plan,
      runMode: "starter",
      finishedAt: new Date(`${run.date}T08:00:00`),
      distance: 4800,
      duration: 29 * 60,
    });
    seedFirestore({
      [`users/runner/runs/journey-${run.id}`]: {
        ...fields,
        startedAt: Timestamp.fromDate(fields.startedAt),
        completedAt: Timestamp.fromDate(fields.completedAt),
      },
    });
  }
  render(<LiveStarterGoal />);
  // The journey originally saved Wednesday and Friday while the phone
  // was still on Monday. The ending-today run window rightly excludes
  // both, so waiting longer cannot make the starter week done.
  await screen.findByText("0 saved runs");
  expect(
    screen.getByText("This week again: 2 runs move you on.")
  ).toBeVisible();
  expect(screen.queryByText(STARTER.weekDone)).not.toBeInTheDocument();

  act(() => {
    vi.setSystemTime(new Date(2026, 10, 18, 12));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await screen.findByText("1 saved runs");
  expect(screen.queryByText(STARTER.weekDone)).not.toBeInTheDocument();

  act(() => {
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await screen.findByText("2 saved runs");
  expect(screen.getByText(STARTER.weekDone)).toBeInTheDocument();
});
