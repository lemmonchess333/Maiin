/**
 * A run's numbers on a feed card: in the reader's own unit, and after the
 * author on the hybrid (run + lift) card as on the run card. The run card
 * printed the per-km pace under "/mi" for anyone reading in miles, and the
 * hybrid card drew its run numbers above the author, where they read as
 * the card before's (the Social pass, 2026-10-13).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";

const reader = vi.hoisted(() => ({ unit: "km" as "km" | "mi" }));

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
  useDistanceUnit: () => reader.unit,
}));

const route = [
  { lat: 51.5, lon: -0.12 },
  { lat: 51.501, lon: -0.121 },
  { lat: 51.502, lon: -0.119 },
];

function run(activity: Record<string, unknown>): FeedItem {
  return {
    id: "r1",
    activityId: "r1",
    authorId: "author",
    authorName: "Maya Chen",
    type: "run",
    summary: "Morning run",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Maya Chen",
      type: "run",
      distance: 8240,
      duration: 2621,
      avgPace: 318,
      routePreview: route,
      ...activity,
    },
  } as FeedItem;
}

const renderCard = (item: FeedItem) =>
  render(
    <MemoryRouter>
      <ActivityCard feedItem={item} />
    </MemoryRouter>
  );

beforeEach(() => {
  reader.unit = "km";
});

describe("a run's numbers on a feed card", () => {
  it("give the pace per km to a reader in kilometres", () => {
    renderCard(run({}));
    expect(screen.getByText("5:18")).toBeTruthy();
    expect(screen.getByText("/km")).toBeTruthy();
  });

  it("give the pace per mile to a reader in miles", () => {
    reader.unit = "mi";
    renderCard(run({}));
    // 318 s/km is 8:32 a mile; the card used to print "5:18 /mi".
    expect(screen.getByText("8:32")).toBeTruthy();
    expect(screen.getByText("/mi")).toBeTruthy();
    expect(screen.queryByText("5:18")).toBeNull();
  });

  it("leave the time out of a run with none", () => {
    renderCard(run({ duration: 0 }));
    expect(screen.queryByText("Time")).toBeNull();
  });

  it("come after the author on a hybrid card, as on a run card", () => {
    renderCard(
      run({
        exercises: [{ name: "Goblet Squat", summary: "3 x 12 24kg" }],
      })
    );
    const author = screen.getByText("Maya Chen");
    const time = screen.getByText("Time");
    expect(
      author.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText("Goblet Squat")).toBeTruthy();
  });
});
