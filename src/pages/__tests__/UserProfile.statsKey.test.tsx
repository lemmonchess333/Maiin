/**
 * The profile page's stats skeleton belongs to the profile on screen.
 *
 * /user/:uid stays mounted when the param changes (one profile's activity
 * card links to another), so the page moves from one profile to the next
 * on the same instance. The stats pills are gated on a loading flag
 * derived from the (viewer, profile) pair whose reads have settled: until
 * the new profile's reads land, the pills show the skeleton — never the
 * previous profile's distance and session count. (The flag used to be
 * raised in the read effect, one commit after the new profile rendered.)
 *
 * Firestore runs on the one fake (ADR-0009); the page's heavy children
 * are stubbed — this suite is about the stats row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "viewer" }));
vi.mock("@/lib/socialApi", () => ({
  getFollowerCount: async () => 0,
  getFollowingCount: async () => 0,
  blockUser: vi.fn(),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/components/social/FollowButton", () => ({ default: () => null }));
vi.mock("@/features/partnerStreak/PartnerStreakCard", () => ({
  default: () => null,
}));
vi.mock("@/features/spaces/TrainingForChip", () => ({ default: () => null }));
vi.mock("@/components/social/ActivityCard", () => ({ default: () => null }));
vi.mock("@/components/social/ProgressPhotos", () => ({ default: () => null }));

import UserProfile from "../UserProfile";
import {
  deferReads,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";

const run = (id: string, authorId: string, createdAt: number) => ({
  [`activities/${id}`]: {
    authorId,
    authorName: authorId,
    type: "run",
    visibility: "public",
    distance: 5000,
    createdAt,
  },
});

beforeEach(() => {
  resetFirestore();
  seedFirestore({
    "users/alice": { displayName: "Alice" },
    "users/bob": { displayName: "Bob" },
    ...run("a1", "alice", 2),
    ...run("a2", "alice", 1),
  });
});
afterEach(() => {
  resumeReads();
  releaseAllReads();
  cleanup();
});

describe("UserProfile — stats across a profile change", () => {
  it("the next profile shows the stats skeleton until its own reads land", async () => {
    render(
      <MemoryRouter initialEntries={["/user/alice"]}>
        <Routes>
          <Route path="/user/:uid" element={<UserProfile />} />
        </Routes>
        <Link to="/user/bob">Open Bob</Link>
      </MemoryRouter>
    );
    // POSITIVE anchor: the first profile's stats are showing.
    expect(await screen.findByText("2 sessions")).toBeInTheDocument();

    // Hold the next profile's reads, so the change is observed before
    // anything of its own could land.
    deferReads();
    fireEvent.click(screen.getByRole("link", { name: "Open Bob" }));

    expect(screen.queryByText("2 sessions")).toBeNull();
    expect(screen.queryByText(/sessions$/)).toBeNull();

    // Then its own stats, once its reads land.
    resumeReads();
    releaseAllReads();
    await waitFor(() =>
      expect(screen.getByText("0 sessions")).toBeInTheDocument()
    );
  });
});
