import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";
import { LiftUnitContext } from "@/hooks/useLiftUnit";
import type { LiftUnit } from "@/lib/liftLoad";
import { group } from "@/test/localeGrouping";

vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer" }, profile: null }),
}));
vi.mock("../../../lib/socialApi", () => ({
  giveHighFive: vi.fn(),
  getKudosList: vi.fn(async () => []),
  blockUser: vi.fn(),
}));
vi.mock("../../../hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("../../../hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blockedUsers: new Set() }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

/**
 * Lift18: someone else's lift, read in the reader's unit, as their run is
 * read in the reader's distance. The post stores kg: the volume, each
 * exercise's first set, and the PR load.
 */
const item = {
  id: "a1",
  activityId: "a1",
  authorId: "author",
  authorName: "Test Author",
  type: "workout",
  summary: "Upper body",
  createdAt: { toDate: () => new Date() },
  kudosCount: 0,
  prHit: true,
  prExercise: "Bench Press",
  prWeight: 100,
  activity: {
    authorId: "author",
    authorName: "Test Author",
    type: "workout",
    totalVolume: 4500,
    exerciseCount: 1,
    exercises: [
      {
        name: "Bench Press",
        exerciseId: "bench-press",
        summary: "3×8×60 kg",
        setCount: 3,
        targetReps: 8,
        targetWeightKg: 60,
      },
    ],
  },
} as unknown as FeedItem;

const renderIn = (unit: LiftUnit) =>
  render(
    <LiftUnitContext value={unit}>
      <MemoryRouter>
        <ActivityCard feedItem={item} />
      </MemoryRouter>
    </LiftUnitContext>
  ).container.textContent ?? "";

describe("a lift post in the reader's unit", () => {
  it("reads kg for a kg reader", () => {
    const text = renderIn("kg");
    expect(text).toContain(`${group(4500)}kg volume`);
    expect(text).toContain("3×8×60 kg");
    expect(text).toContain("New PR: Bench Press 100 kg");
  });

  it("reads lb for an lb reader, from the same stored kg", () => {
    const text = renderIn("lbs");
    // 4,500 kg is 9,921 lb; 60 kg is 132.3 lb; 100 kg is 220.5 lb.
    expect(text).toContain(`${group(9921)}lb volume`);
    expect(text).toContain("3×8×132.3 lb");
    expect(text).toContain("New PR: Bench Press 220.5 lb");
    expect(text).not.toMatch(/\bkg\b/);
  });
});
