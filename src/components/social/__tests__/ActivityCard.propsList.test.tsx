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

/** A post whose props the server named: Friend, Blocker and Pal. */
function named(extra: Partial<FeedItem> = {}): FeedItem {
  return {
    ...item,
    kudosCount: 5,
    ...extra,
    activity: {
      ...item.activity,
      recentPropsBy: [
        { uid: "blocker", name: "Blocker" },
        { uid: "friend", name: "Friend" },
        { uid: "pal", name: "Pal" },
      ],
    },
  } as FeedItem;
}

/* Mob2's Mobbin finding 8: the card names who gave props, not only how
   many, and never someone either side of a block with the reader. */
describe("ActivityCard — who gave props", () => {
  it("names the newest giver the reader may see, and counts the rest", () => {
    render(
      <MemoryRouter>
        <ActivityCard feedItem={named()} />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("button", { name: "Friend and 4 others gave props" })
    ).toBeVisible();
    expect(screen.queryByText(/Blocker/)).toBeNull();
  });

  it("says You first once the reader has given props", () => {
    render(
      <MemoryRouter>
        <ActivityCard feedItem={named({ liked: true })} />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("button", { name: "You and 4 others gave props" })
    ).toBeVisible();
  });

  it("opens the full list, as the count does", async () => {
    render(
      <MemoryRouter>
        <ActivityCard feedItem={named()} />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Friend and 4 others gave props" })
    );
    expect(await screen.findByText("Props from")).toBeVisible();
  });

  it("says nothing on a post with no names kept", () => {
    render(
      <MemoryRouter>
        <ActivityCard feedItem={item} />
      </MemoryRouter>
    );
    // POSITIVE anchor: the count is there.
    expect(
      screen.getByRole("button", { name: /props — show list/ })
    ).toBeVisible();
    expect(screen.queryByText(/gave props$/)).toBeNull();
  });
});

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
