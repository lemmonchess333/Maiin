import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";
import { group } from "@/test/localeGrouping";

/* The card pulls auth, blocks, kudos and the viewer's unit. None of that
   is what this asserts, so it is stubbed to the quietest thing that still
   renders. */
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

/**
 * The card with the data real people post, not the data it was designed
 * against: a caption on a hybrid session, counts past a thousand, a PR
 * load stored as a float, a right-to-left name. Each case here was found
 * broken in the break-social lab (`/dev/break-social?data=worst`), whose
 * fixture this file borrows its values from.
 */
function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
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
      totalVolume: 12480,
      exerciseCount: 1,
      exercises: [{ name: "Back Squat", summary: "5 x 5 100kg" }],
    },
    ...overrides,
  } as FeedItem;
}

const route = [
  { lat: 51.5, lon: -0.12 },
  { lat: 51.501, lon: -0.121 },
  { lat: 51.502, lon: -0.119 },
];

function renderCard(item: FeedItem) {
  return render(
    <MemoryRouter>
      <ActivityCard feedItem={item} />
    </MemoryRouter>
  );
}

describe("ActivityCard with worst-case data", () => {
  it("a hybrid session shows its caption, and its summary when untitled", () => {
    const item = feedItem({
      summary: "Ran to the gym, lifted, ran home",
      activity: {
        authorId: "author",
        authorName: "Test Author",
        type: "workout",
        distance: 5200,
        duration: 3600,
        routePreview: route,
        exercises: [{ name: "Back Squat", summary: "5 x 5 100kg" }],
        caption: "Line one\nLine two",
      },
    });
    renderCard(item);
    // Run on top, lift beneath: the hybrid branch, not the standard one.
    expect(screen.getByText("Back Squat")).toBeTruthy();
    expect(screen.getByText("5.20")).toBeTruthy();
    expect(screen.getByText("Ran to the gym, lifted, ran home")).toBeTruthy();
    expect(
      screen.getByText((_, el) => el?.textContent === "Line one\nLine two")
    ).toBeTruthy();
  });

  it("groups props and comment counts past a thousand", () => {
    const item = feedItem({ kudosCount: 1284 });
    item.activity!.commentCount = 2568;
    renderCard(item);
    // textContent, not toHaveTextContent: the matcher collapses
    // whitespace, and fr-FR groups with a narrow no-break space.
    expect(
      screen.getByRole("button", { name: `${group(1284)} props — show list` })
        .textContent
    ).toBe(group(1284));
    expect(
      screen.getByRole("button", { name: "View comments" }).textContent
    ).toBe(group(2568));
  });

  it("prints a PR load the way every other load is printed", () => {
    const item = feedItem({ prHit: true, prExercise: "Deadlift" });
    item.prWeight = 142.8816;
    const { container } = renderCard(item);
    expect(container.textContent).toContain("New PR: Deadlift 142.9 kg");
    expect(container.textContent).not.toContain("142.8816");
  });

  it("lets a right-to-left name and title read from their own side", () => {
    const item = feedItem({ authorName: "نور الهدى عبد الرحمن" });
    item.activity!.activityTitle = "تمرين الصباح";
    renderCard(item);
    expect(screen.getByText("نور الهدى عبد الرحمن")).toHaveAttribute(
      "dir",
      "auto"
    );
    expect(screen.getByText("تمرين الصباح")).toHaveAttribute("dir", "auto");
  });
});
