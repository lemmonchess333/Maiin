/**
 * The "Props from" list leaves out anyone either side of a block with the
 * viewer (Polish3 call 1), as the comments under it do. `blocked` is the
 * merged set (useBlockedUsers): whoever the viewer blocked and whoever
 * blocked them.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";

vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer" }, profile: null }),
}));
vi.mock("../../../lib/socialApi", () => ({
  giveHighFive: vi.fn(),
  getKudosList: vi.fn(async () => [
    { userId: "friend", userName: "Friend" },
    { userId: "blocker", userName: "Blocker" },
  ]),
  blockUser: vi.fn(),
}));
vi.mock("../../../hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("../../../hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    addBlocked: vi.fn(),
    blocked: new Set(["blocker"]),
  }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

const item = {
  id: "a1",
  activityId: "a1",
  authorId: "author",
  authorName: "Test Author",
  type: "run",
  summary: "Easy run",
  createdAt: { toDate: () => new Date() },
  kudosCount: 2,
  activity: {
    authorId: "author",
    authorName: "Test Author",
    type: "run",
    distance: 5000,
  },
} as unknown as FeedItem;

describe("ActivityCard — Props from", () => {
  it("leaves out whoever is either side of a block with you", async () => {
    render(
      <MemoryRouter>
        <ActivityCard feedItem={item} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /props — show list/ }));
    // POSITIVE anchor: the list has loaded, with the friend on it.
    expect(await screen.findByText("Friend")).toBeInTheDocument();
    expect(screen.queryByText("Blocker")).toBeNull();
  });
});
