import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";

/* The post's comment count is written by the server, so the card's figure
   would stay put after you comment until the feed was read again. The
   sheet reports what happened; the card adds it. */

const sheet = vi.hoisted(() => ({
  onCountChange: undefined as ((delta: number) => void) | undefined,
}));

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
vi.mock("../Avatar", () => ({ default: () => <div /> }));
vi.mock("../BlockAwareAvatar", () => ({ default: () => <div /> }));
vi.mock("../CommentSheet", () => ({
  default: (props: { onCountChange?: (delta: number) => void }) => {
    sheet.onCountChange = props.onCountChange;
    return null;
  },
}));

function feedItem(commentCount: number): FeedItem {
  return {
    id: "a1",
    activityId: "a1",
    authorId: "author",
    authorName: "Test Author",
    type: "workout",
    summary: "Lower body",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Test Author",
      type: "workout",
      commentCount,
    },
  } as FeedItem;
}

describe("the feed card's comment count", () => {
  it("moves when a comment is added or deleted from its sheet", () => {
    render(
      <MemoryRouter>
        <ActivityCard feedItem={feedItem(2)} />
      </MemoryRouter>
    );
    const button = screen.getByRole("button", { name: "View comments" });
    expect(button).toHaveTextContent("2");
    act(() => sheet.onCountChange?.(1));
    expect(button).toHaveTextContent("3");
    act(() => sheet.onCountChange?.(-1));
    act(() => sheet.onCountChange?.(-1));
    expect(button).toHaveTextContent("1");
  });
});
