/**
 * A session nobody has given props to yet says so once, on someone else's
 * card, as the running apps' "Be the first to like this" does: a new post
 * with an empty action row read as ignored. Not on the reader's own card,
 * and gone once there are props.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FeedItem } from "../../../hooks/useSocialFeed";

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
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blocked: new Set() }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));
vi.mock("../../../lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("../Avatar", () => ({ default: () => <div /> }));
vi.mock("../BlockAwareAvatar", () => ({ default: () => <div /> }));

import ActivityCard from "../ActivityCard";

afterEach(cleanup);

function item(authorId: string, kudosCount: number): FeedItem {
  return {
    id: "a1",
    activityId: "a1",
    authorId,
    authorName: "Test Author",
    type: "run",
    summary: "Easy run",
    createdAt: { toDate: () => new Date("2026-08-21T10:00:00Z") },
    kudosCount,
    activity: { authorId, authorName: "Test Author", type: "run" },
  } as unknown as FeedItem;
}

function renderCard(feedItem: FeedItem) {
  render(
    <MemoryRouter>
      <ActivityCard feedItem={feedItem} />
    </MemoryRouter>
  );
}

const FIRST = "Be the first to give props";

describe("ActivityCard — the first props", () => {
  it("asks for the first props on someone else's session", () => {
    renderCard(item("author", 0));
    expect(screen.getByText(FIRST)).toBeInTheDocument();
  });

  it("says nothing of it on the reader's own session", () => {
    renderCard(item("viewer", 0));
    expect(screen.queryByText(FIRST)).toBeNull();
  });

  it("says nothing of it once there are props", () => {
    renderCard(item("author", 3));
    expect(screen.queryByText(FIRST)).toBeNull();
  });
});
