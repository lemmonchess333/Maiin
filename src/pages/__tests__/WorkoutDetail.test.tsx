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
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

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
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

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
  it("renders the session's working sets — the only surface that shows them", async () => {
    seedFirestore({ "users/u1/workouts/w1": SAVED });
    renderAt("w1");

    expect(await screen.findByText("Push")).toBeTruthy();
    expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
    // Two working sets at 60kg. The 40kg warm-up is NOT work and must not
    // appear — counting it inflates every set total on the page, the same
    // boundary SessionCompleteScreen's SETS stat enforces.
    expect(screen.getAllByText("8× 60kg")).toHaveLength(2);
    expect(screen.queryByText("10× 40kg")).toBeNull();
    expect(screen.getByText("2 sets")).toBeTruthy();
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
