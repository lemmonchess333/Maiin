/**
 * Posting a SAVED workout to the feed, from `/workout/:id`.
 *
 * Two properties matter and neither is visual:
 *
 * 1. It must NOT go through `compose()`. That is the post-save composer's
 *    path and is governed by the stored "always" default — routing this
 *    through it would be short-circuited for a user whose default is
 *    "never", which is exactly the user who needs an explicit per-workout
 *    share, and remembering would rewrite their default as a side effect of
 *    posting one session.
 *
 * 2. It must write the `sharedActivityId` marker. `postActivity` addDocs a
 *    fresh activity on every call, so without the marker the same workout
 *    can be posted from here and from the post-save composer and land in
 *    the feed twice. The marker is best-effort — a failed marker write must
 *    never fail the post, because the post is the thing the user asked for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

const postActivityMock = vi.fn();
const updateDocGuardedMock = vi.fn();
const composeMock = vi.fn();

// ADR-0009 — one Firestore fake, bare mock. Nothing is seeded: the sheet
// only builds a doc ref, and the write itself goes through the mocked
// `updateDocGuarded` below so the marker call can be asserted directly.
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { displayName: "Alex" } }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));
vi.mock("@/lib/socialApi", () => ({
  postActivity: (...args: unknown[]) => postActivityMock(...args),
}));
vi.mock("@/lib/firestoreWrite", () => ({
  updateDocGuarded: (...args: unknown[]) => updateDocGuardedMock(...args),
}));
vi.mock("@/lib/shareComposer", () => ({
  compose: (...args: unknown[]) => composeMock(...args),
}));

import WorkoutFeedShareSheet from "../WorkoutFeedShareSheet";
import type { Workout } from "@/hooks/useWorkouts";

const WORKOUT = {
  id: "programme-abc",
  date: "2026-08-01",
  notes: "Push — Chest Focus",
  durationMinutes: 52,
  totalCalories: 310,
  exercises: [
    {
      exerciseId: "bench-press",
      exerciseName: "Barbell Bench Press",
      category: "push",
      caloriesBurned: 0,
      sets: [
        { setNumber: 1, reps: 8, weightKg: 60 },
        { setNumber: 2, reps: 8, weightKg: 60 },
      ],
    },
  ],
} as unknown as Workout;

function renderSheet(onShared = vi.fn()) {
  render(
    <WorkoutFeedShareSheet
      open
      onOpenChange={vi.fn()}
      uid="u1"
      workout={WORKOUT}
      title="Push — Chest Focus"
      onShared={onShared}
    />
  );
  return onShared;
}

beforeEach(() => {
  postActivityMock.mockReset().mockResolvedValue("act-1");
  updateDocGuardedMock.mockReset().mockResolvedValue(undefined);
  composeMock.mockReset();
});
afterEach(cleanup);

describe("WorkoutFeedShareSheet", () => {
  it("posts the saved workout's real numbers", async () => {
    renderSheet();

    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );

    await waitFor(() => expect(postActivityMock).toHaveBeenCalledTimes(1));
    expect(postActivityMock.mock.calls[0][0]).toMatchObject({
      authorId: "u1",
      type: "workout",
      visibility: "followers",
      exerciseCount: 1,
      // 2 sets × 8 reps × 60kg — derived from the saved doc, not a
      // placeholder from the plan.
      totalVolume: 960,
      duration: 52 * 60,
    });
  });

  it("never routes through compose() — that would obey the stored default", async () => {
    // A user whose default is "never" is precisely who needs this button;
    // compose() would resolve null and post nothing, silently.
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /make public/i }));

    await waitFor(() => expect(postActivityMock).toHaveBeenCalled());
    expect(composeMock).not.toHaveBeenCalled();
    expect(postActivityMock.mock.calls[0][0]).toMatchObject({
      visibility: "public",
    });
  });

  it("writes the dedupe marker so the page can't offer to post it twice", async () => {
    const onShared = renderSheet();

    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );

    await waitFor(() => expect(updateDocGuardedMock).toHaveBeenCalledTimes(1));
    expect(updateDocGuardedMock.mock.calls[0][1]).toEqual({
      sharedActivityId: "act-1",
    });
    expect(onShared).toHaveBeenCalledWith("act-1");
  });

  it("keeps the post when the marker write fails", async () => {
    // A failed marker costs a possible duplicate later; failing the share
    // would cost the post the user actually asked for.
    updateDocGuardedMock.mockRejectedValue(new Error("permission-denied"));
    const onShared = renderSheet();

    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );

    await waitFor(() => expect(onShared).toHaveBeenCalledWith("act-1"));
    expect(postActivityMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to post an objectionable caption", async () => {
    renderSheet();

    fireEvent.change(screen.getByLabelText(/add a note/i), {
      target: { value: "fucking great session" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /share to followers/i })
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(postActivityMock).not.toHaveBeenCalled();
  });
});
