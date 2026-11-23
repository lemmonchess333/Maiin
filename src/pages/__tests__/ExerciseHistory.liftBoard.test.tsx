/**
 * An exercise's Leaderboard (Run30 call 3), copied from Hevy's per-exercise
 * board: on a barbell lift's page, the heaviest set of each person you
 * follow, with yours among them, heaviest first, in your unit. Who is on it
 * is the server's (getLiftBoard; functions/__tests__/liftBoards.test.js
 * holds who sees whom); someone blocked since is left out here too. With
 * nobody you follow on it, your own best and a way to invite someone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LiftUnitContext } from "@/hooks/useLiftUnit";
import type { LiftUnit } from "@/lib/liftLoad";

const H = vi.hoisted(() => ({
  call: vi.fn(),
  blocked: new Set<string>(),
  workouts: [] as unknown[],
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
  functions: {},
  auth: { currentUser: { uid: "me" } },
}));
vi.mock("firebase/functions", () => ({
  getFunctions: () => ({}),
  httpsCallable: (_f: unknown, name: string) => (data: unknown) =>
    H.call(name, data),
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "me",
  useAuth: () => ({ profile: { displayName: "Me" } }),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: H.blocked,
    youBlocked: new Set(),
    blockedYou: new Set(),
    ready: true,
    addBlocked: () => {},
    removeBlocked: () => {},
  }),
}));
vi.mock("@/hooks/useWorkouts", () => ({
  useWorkouts: () => ({
    workouts: H.workouts,
    loading: false,
    failed: false,
    refresh: () => {},
  }),
}));
vi.mock("@/lib/subscription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/subscription")>()),
  useSubscription: () => ({ isPro: true }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/components/ExerciseFormContent", () => ({
  default: () => <div>Exercise guidance ready</div>,
}));

import ExerciseHistory from "../ExerciseHistory";

const workout = (id: string, date: string, weightKg: number, reps: number) => ({
  id,
  date,
  createdAt: null,
  exercises: [
    {
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      category: "Chest",
      sets: [
        { setNumber: 1, weightKg: weightKg + 40, reps: 5, type: "warmup" },
        { setNumber: 2, weightKg, reps },
      ],
    },
  ],
});

const person = (uid: string, name: string, weightKg: number, reps = 1) => ({
  uid,
  name,
  photoURL: null,
  weightKg,
  reps,
  day: "2026-11-10",
  activityId: `post-${uid}`,
});

function renderAt(name: string, unit: LiftUnit = "kg") {
  return render(
    <LiftUnitContext value={unit}>
      <MemoryRouter
        initialEntries={[`/history/exercise/${encodeURIComponent(name)}`]}
      >
        <Routes>
          <Route path="/history/exercise/:name" element={<ExerciseHistory />} />
          <Route path="/social" element={<div>Social page</div>} />
        </Routes>
      </MemoryRouter>
    </LiftUnitContext>
  );
}

const openBoard = () =>
  fireEvent.click(screen.getByRole("radio", { name: "Leaderboard" }));

beforeEach(() => {
  H.call.mockReset();
  H.blocked = new Set();
  H.workouts = [
    workout("w-old", "2026-10-01", 100, 3),
    workout("w-new", "2026-11-01", 95, 8),
  ];
});
afterEach(cleanup);

describe("an exercise's Leaderboard", () => {
  it("is on a barbell lift's page and on no other", async () => {
    renderAt("Bench Press");
    expect(screen.getByRole("radio", { name: "Leaderboard" })).toBeTruthy();
    cleanup();
    renderAt("Dumbbell Bench Press");
    expect(screen.getByRole("radio", { name: "Progress" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Leaderboard" })).toBeNull();
    // Never asked for until opened.
    expect(H.call).not.toHaveBeenCalled();
  });

  it("ranks you among the people you follow by heaviest weight, in your unit", async () => {
    H.call.mockResolvedValue({
      data: {
        entries: [person("sam", "Sam", 120), person("ola", "Ola", 90, 5)],
      },
    });
    renderAt("Bench Press");
    openBoard();
    const list = await screen.findByRole("list", { name: "Bench Press board" });
    expect(H.call).toHaveBeenCalledWith("getLiftBoard", {
      exerciseId: "bench-press",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^1.*Sam.*1 rep · 10 Nov 2026.*120 kg$/),
      // Your heaviest working set, never the warm-up.
      expect.stringMatching(/^2.*You.*3 reps · 1 Oct 2026.*100 kg$/),
      expect.stringMatching(/^3.*Ola.*5 reps · 10 Nov 2026.*90 kg$/),
    ]);
    expect(rows[1].getAttribute("aria-current")).toBe("true");
    expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe(
      "/activity/post-sam"
    );
    expect(within(rows[1]).getByRole("link").getAttribute("href")).toBe(
      "/workout/w-old"
    );
    // A board with others on it has no invite.
    expect(
      screen.queryByRole("button", { name: "Invite a friend" })
    ).toBeNull();
  });

  it("reads loads in pounds for a lifter who lifts in pounds", async () => {
    H.call.mockResolvedValue({
      data: { entries: [person("sam", "Sam", 100)] },
    });
    renderAt("Bench Press", "lbs");
    openBoard();
    const list = await screen.findByRole("list", { name: "Bench Press board" });
    expect(within(list).getAllByRole("listitem")[0].textContent).toMatch(
      /220\.5 lb$/
    );
  });

  it("leaves out someone blocked since the board was read", async () => {
    H.blocked = new Set(["sam"]);
    H.call.mockResolvedValue({
      data: { entries: [person("sam", "Sam", 120), person("ola", "Ola", 90)] },
    });
    renderAt("Bench Press");
    openBoard();
    const list = await screen.findByRole("list", { name: "Bench Press board" });
    expect(list.textContent).not.toContain("Sam");
    expect(list.textContent).toContain("Ola");
  });

  it("with nobody you follow on it, shows your best and a way to invite someone", async () => {
    H.call.mockResolvedValue({ data: { entries: [] } });
    renderAt("Bench Press");
    openBoard();
    const list = await screen.findByRole("list", { name: "Bench Press board" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(
      screen.getByText(
        "When people you follow share a workout with Bench Press, their heaviest set shows here."
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Invite a friend" }));
    await screen.findByText("Social page");
  });

  it("says so when the board can't be read, and reads it again on Try again", async () => {
    H.call.mockRejectedValueOnce(new Error("unavailable"));
    H.call.mockResolvedValueOnce({ data: { entries: [] } });
    renderAt("Bench Press");
    openBoard();
    await screen.findByText("Couldn’t load the board");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(H.call).toHaveBeenCalledTimes(2));
    await screen.findByRole("list", { name: "Bench Press board" });
  });
});
