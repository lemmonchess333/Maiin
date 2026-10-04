/**
 * `/workout/:id` — the surface that made a saved lift session reachable.
 *
 * Before it existed, nothing in Tropos showed you one saved workout:
 * History's lifting section is aggregates only, its per-entry list was
 * removed by product call (2026-07-04), and Home's day card tapped through
 * for runs but not lifts. The consequence that bites is sharing — the
 * completion screen was the only surface that could share a workout and it
 * unmounts on save, so a session missed in that moment was unshareable
 * forever. Worse once a stored share default exists: a user whose default is
 * "never" has `compose()` decline every session silently, and this page is
 * the only way they can ever post one.
 *
 * So the tests pin reachability and the dedupe, not layout:
 *   - the sets are actually rendered (this is the only place they appear);
 *   - a session already in the feed does NOT offer to post again, because
 *     `postActivity` addDocs a fresh activity on every call and would put
 *     one workout in the feed twice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  createMemoryRouter,
  RouterProvider,
} from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u1" },
    profile: { displayName: "Alex", uid: "u1" },
  }),
}));
// The share-card sheet pulls in html-to-image + the full renderer; the page's
// contract with it is "opens with this workout's numbers", which the feed
// sheet already covers structurally. Stub so this file tests the page.
vi.mock("@/components/share/ShareCardSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/social/CircleShareSheet", () => ({
  default: () => null,
}));

import WorkoutDetail from "../WorkoutDetail";
import { workoutTonnageKg } from "@/hooks/useWorkouts";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const SAVED = {
  date: "2026-08-01",
  notes: "Push — Chest Focus — Programme Week 3",
  durationMinutes: 52,
  totalCalories: 310,
  exercises: [
    {
      exerciseId: "bench-press",
      exerciseName: "Barbell Bench Press",
      category: "push",
      caloriesBurned: 0,
      sets: [
        { setNumber: 1, reps: 10, weightKg: 40, type: "warmup" },
        { setNumber: 2, reps: 8, weightKg: 60, type: "working" },
        { setNumber: 3, reps: 8, weightKg: 60, type: "working" },
      ],
    },
  ],
};

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/workout/${id}`]}>
      <Routes>
        <Route path="/workout/:workoutId" element={<WorkoutDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
});
afterEach(cleanup);

describe("WorkoutDetail", () => {
  /* The headline is now per-state. This case used to assert "Workout not
     found" for BOTH, which is the conflation the split fixed: a failed
     read reported the user's session as possibly deleted, or the link as
     someone else's. What the case is FOR — the previous workout must not
     survive the navigation — is unchanged and is the half that matters,
     since stale data reads as data rather than as an error. */
  it.each([
    ["missing", "Workout not found"],
    ["failed", "Couldn't load this workout"],
  ])(
    "clears the previous workout when the next record is %s",
    async (state, headline) => {
      seedFirestore({ "users/u1/workouts/w1": SAVED });
      const router = createMemoryRouter(
        [{ path: "/workout/:workoutId", element: <WorkoutDetail /> }],
        { initialEntries: ["/workout/w1"] }
      );
      render(<RouterProvider router={router} />);
      expect(await screen.findByText("Barbell Bench Press")).toBeTruthy();
      if (state === "failed") {
        failNextFirestore("getDoc", { path: "users/u1/workouts/w2" });
      }
      await act(async () => {
        await router.navigate("/workout/w2");
      });
      expect(await screen.findByText(headline)).toBeTruthy();
      expect(screen.queryByText("Barbell Bench Press")).toBeNull();
      expect(
        screen.queryByRole("button", { name: /share to feed/i })
      ).toBeNull();
      expect(unfiredFailures()).toHaveLength(0);
    }
  );

  it("renders the session's working sets — the only surface that shows them", async () => {
    seedFirestore({ "users/u1/workouts/w1": SAVED });
    renderAt("w1");

    expect(await screen.findByText("Push")).toBeTruthy();
    expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
    // Two working sets at 60kg. The 40kg warm-up is NOT work and must not
    // appear — counting it inflates every set total on the page, the same
    // boundary SessionCompleteScreen's sets figure enforces.
    expect(screen.getAllByText("60 kg × 8")).toHaveLength(2);
    expect(screen.queryByText("40 kg × 10")).toBeNull();
    expect(screen.getByText("2 sets")).toBeTruthy();
    // Numbered among the sets that count, as the workout screen numbered
    // them, and named in words for a screen reader.
    expect(screen.getByText("Set 1: 60 kg, 8 reps")).toBeTruthy();
    expect(screen.getByText("Set 2: 60 kg, 8 reps")).toBeTruthy();
  });

  it("marks a drop set and a set to failure as the workout screen did", async () => {
    seedFirestore({
      "users/u1/workouts/w1": {
        ...SAVED,
        exercises: [
          {
            ...SAVED.exercises[0],
            sets: [
              { setNumber: 1, reps: 8, weightKg: 80, type: "working" },
              // Saved before set types were recorded: a working set.
              { setNumber: 2, reps: 8, weightKg: 80 },
              { setNumber: 3, reps: 10, weightKg: 60, type: "dropset" },
              { setNumber: 4, reps: 6, weightKg: 45, type: "failure" },
            ],
          },
        ],
      },
    });
    const { container } = renderAt("w1");
    expect(await screen.findByText("Barbell Bench Press")).toBeTruthy();
    expect(
      [...container.querySelectorAll("[data-set-type]")].map(
        (chip) => `${chip.getAttribute("data-set-type")} ${chip.textContent}`
      )
    ).toEqual(["working 1", "working 2", "dropset D", "failure F"]);
    expect(screen.getByText("Set 3, drop set: 60 kg, 10 reps")).toBeTruthy();
    expect(screen.getByText("Set 4, to failure: 45 kg, 6 reps")).toBeTruthy();
  });

  it("writes a hold in seconds and a bodyweight set in reps", async () => {
    seedFirestore({
      "users/u1/workouts/w1": {
        ...SAVED,
        exercises: [
          {
            exerciseId: "plank",
            exerciseName: "Plank",
            category: "core",
            repUnit: "seconds",
            caloriesBurned: 0,
            sets: [{ setNumber: 1, reps: 60, weightKg: 0 }],
          },
          {
            exerciseId: "pull-ups",
            exerciseName: "Pull-Ups",
            category: "pull",
            caloriesBurned: 0,
            sets: [{ setNumber: 1, reps: 1, weightKg: 0 }],
          },
        ],
      },
    });
    renderAt("w1");
    expect(await screen.findByText("60 s")).toBeTruthy();
    expect(screen.getByText("Set 1: 60 seconds")).toBeTruthy();
    expect(screen.getByText("1 rep")).toBeTruthy();
    // No load the app can weigh, so the session's work is its reps, as on
    // the finish screen; the hold's seconds are not reps.
    expect(screen.getByText("rep")).toBeTruthy();
    expect(screen.queryByText("kg lifted")).toBeNull();
  });

  it("leads with the finish screen's three figures", async () => {
    seedFirestore({ "users/u1/workouts/w1": SAVED });
    renderAt("w1");
    expect(await screen.findByText("minutes")).toBeTruthy();
    const figure = (unit: string) =>
      screen.getByText(unit).previousElementSibling?.textContent;
    expect(figure("minutes")).toBe("52");
    expect(figure("sets")).toBe("2");
    expect(figure("kg lifted")).toBe(
      workoutTonnageKg(SAVED as never).toLocaleString("en-GB")
    );
  });

  it("shows a not-found state rather than crashing on a missing workout", async () => {
    // Deep-linkable route: a deleted session, or another account's id.
    renderAt("does-not-exist");

    expect(await screen.findByText("Workout not found")).toBeTruthy();
  });

  it("offers a feed share for a session that hasn't been posted", async () => {
    seedFirestore({ "users/u1/workouts/w1": SAVED });
    renderAt("w1");

    expect(
      await screen.findByRole("button", { name: /share to feed/i })
    ).toBeTruthy();
  });

  it("does NOT offer to post a session that is already in the feed", async () => {
    // `postActivity` addDocs unconditionally, so a second post here would
    // put one workout in the feed twice. The marker is written by whichever
    // path posted it — the post-save composer or this page.
    seedFirestore({
      "users/u1/workouts/w1": { ...SAVED, sharedActivityId: "act-1" },
    });
    renderAt("w1");

    expect(await screen.findByText("Shared to your feed")).toBeTruthy();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /share to feed/i })
      ).toBeNull();
    });
  });
});
