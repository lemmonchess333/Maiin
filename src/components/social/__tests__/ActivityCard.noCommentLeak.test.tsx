import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";

/* The card pulls auth, blocks, kudos and the viewer's unit. None of that
   is what this asserts, so it is all stubbed to the quietest thing that
   still renders. */
vi.mock("../../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "viewer" }, profile: null }),
}));
vi.mock("../../../lib/socialApi", () => ({
  giveHighFive: vi.fn(),
  getKudosList: vi.fn(async () => []),
  blockUser: vi.fn(),
}));
vi.mock("../../../hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blockedUsers: new Set() }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));
vi.mock("../Avatar", () => ({ default: () => <div /> }));
vi.mock("../BlockAwareAvatar", () => ({ default: () => <div /> }));

/**
 * A JSX comment written as `/* … *\/` instead of `{/* … *\/}` is a TEXT
 * NODE, and React renders it. That shipped: the workout card printed a
 * five-line source comment about grid columns to the screen, on every
 * lift post, in production.
 *
 * Nothing caught it. `tsc -b` was clean (a string child is valid JSX),
 * ESLint was clean (`eslint-plugin-react`, which carries
 * `jsx-no-comment-textnodes`, is not installed here), and the full unit
 * suite passed because every assertion looked for text that SHOULD be
 * present and none looked for text that should not. It took a rendered
 * screenshot of the card to see it.
 *
 * This is the cheap guard for that whole class: whatever the card is
 * asked to render, none of the source's own commentary may reach the
 * DOM.
 */
function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "a1",
    activityId: "a1",
    authorId: "author",
    authorName: "Test Author",
    type: "workout",
    summary: "Lower body",
    createdAt: { toDate: () => new Date("2026-08-21T10:00:00Z") },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Test Author",
      type: "workout",
      totalVolume: 12480,
      exerciseCount: 6,
      prCount: 2,
      duration: 4200,
      exercises: [{ name: "Back Squat", summary: "5 x 5 100kg" }],
    },
    ...overrides,
  } as FeedItem;
}

function renderCard(item: FeedItem) {
  return render(
    <MemoryRouter>
      <ActivityCard feedItem={item} />
    </MemoryRouter>
  );
}

describe("ActivityCard does not leak source comments into the DOM", () => {
  it("renders a workout card with no comment syntax in its text", () => {
    const { container } = renderCard(feedItem());
    const text = container.textContent ?? "";
    expect(text).not.toContain("/*");
    expect(text).not.toContain("*/");
    // The specific sentence that shipped, pinned by its own words so the
    // failure names itself rather than just saying "contains /*".
    expect(text).not.toMatch(/unconstrained flex row/i);
    // Sanity: the card really did render, so the assertions above are
    // about content rather than about an empty container.
    expect(text).toContain("12,480");
  });

  it("renders a run card with no comment syntax in its text", () => {
    const { container } = renderCard(
      feedItem({
        type: "run",
        summary: "Morning run",
        activity: {
          authorId: "author",
          authorName: "Test Author",
          type: "run",
          distance: 21100,
          avgPace: 312,
          duration: 6583,
          elevationGain: 342,
        },
      })
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("/*");
    expect(text).not.toContain("*/");
    expect(text).toContain("21.10");
  });
});
