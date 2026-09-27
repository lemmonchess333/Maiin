/**
 * SpacePostComposer — starting a draft with the latest session attached.
 *
 * An empty space's "Share your last session" and the post-race hand-off
 * open the composer with `attachLatest`. The newest session is attached
 * as soon as the list arrives; removing it or picking another sticks for
 * the draft; and the post carries the attached session's snapshot.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "viewer", emailVerified: true },
    profile: { displayName: "Sam", uid: "viewer" },
  }),
  useUid: () => "viewer",
}));
vi.mock("@/hooks/useEmailVerificationGate", () => ({
  useEmailVerificationGate: () => ({
    needsVerification: false,
    recheck: vi.fn(),
  }),
}));

import SpacePostComposer from "../SpacePostComposer";
import type { RecentSession } from "../useRecentSessions";
import { allPaths, readDoc, resetFirestore } from "@/test/firestoreHarness";

const RUN: RecentSession = {
  kind: "run",
  run: {
    id: "r1",
    distance: 10000,
    duration: 3521,
    avgPace: 352,
    elevationGain: 40,
    calories: 640,
    activityType: "run",
    completedAt: new Date(2026, 8, 23, 8),
    relativeEffort: null,
  },
};
const WORKOUT = {
  kind: "workout",
  workout: {
    id: "w1",
    date: "2026-09-22",
    durationMinutes: 50,
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        sets: [{ setNumber: 1, reps: 5, weightKg: 80 }],
      },
    ],
  },
} as unknown as RecentSession;

function renderComposer(props: {
  sessions: RecentSession[];
  attachLatest?: boolean;
}) {
  return render(
    <SpacePostComposer
      spaceId="womens-running"
      open
      onOpenChange={() => {}}
      onPosted={() => {}}
      {...props}
    />
  );
}

beforeEach(() => resetFirestore());
afterEach(() => cleanup());

describe("SpacePostComposer — attachLatest", () => {
  it("attaches the newest session, and the post carries it", async () => {
    renderComposer({ sessions: [RUN, WORKOUT], attachLatest: true });

    expect(
      screen.getByRole("button", { name: "Remove attached session" })
    ).toBeInTheDocument();
    expect(screen.getByText("10.0 km run")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Post body"), {
      target: { value: "First 10K done." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post to space" }));

    await waitFor(() =>
      expect(
        allPaths().some((p) => p.startsWith("spaces/womens-running/posts/"))
      ).toBe(true)
    );
    const path = allPaths().find((p) =>
      p.startsWith("spaces/womens-running/posts/")
    )!;
    expect(readDoc(path)).toMatchObject({
      body: "First 10K done.",
      activity: { type: "run", distance: 10000, duration: 3521 },
    });
  });

  it("stays removed once the user removes it", () => {
    renderComposer({ sessions: [RUN, WORKOUT], attachLatest: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove attached session" })
    );
    expect(
      screen.queryByRole("button", { name: "Remove attached session" })
    ).toBeNull();
    // The picker lists both sessions to choose from instead.
    expect(screen.getByText("10.0 km run")).toBeInTheDocument();
    expect(screen.getByText("Workout · Bench Press")).toBeInTheDocument();
  });

  it("a session the user picks replaces the latest", () => {
    renderComposer({ sessions: [RUN, WORKOUT], attachLatest: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove attached session" })
    );
    fireEvent.click(screen.getByText("Workout · Bench Press"));
    expect(screen.getByText("Workout · Bench Press")).toBeInTheDocument();
    expect(screen.queryByText("10.0 km run")).toBeNull();
  });

  it("attaches nothing when opened as a plain post", () => {
    renderComposer({ sessions: [RUN, WORKOUT] });
    expect(
      screen.queryByRole("button", { name: "Remove attached session" })
    ).toBeNull();
  });

  it("attaches the latest when the sessions arrive after the sheet opens", () => {
    const { rerender } = renderComposer({ sessions: [], attachLatest: true });
    expect(screen.queryByText("Attach a session")).toBeNull();
    rerender(
      <SpacePostComposer
        spaceId="womens-running"
        open
        onOpenChange={() => {}}
        onPosted={() => {}}
        sessions={[RUN]}
        attachLatest
      />
    );
    expect(
      screen.getByRole("button", { name: "Remove attached session" })
    ).toBeInTheDocument();
  });
});
