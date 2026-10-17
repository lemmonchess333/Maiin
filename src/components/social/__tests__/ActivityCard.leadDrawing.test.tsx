/**
 * A lift post leads with its lead lift's drawing (owner, 2026-10-16: "Why
 * is it just the muscle groups worked? It looks silly").
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
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
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blockedUsers: new Set() }),
}));
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

function liftPost(
  exercises: Record<string, unknown>[],
  extra: Record<string, unknown> = {}
): FeedItem {
  return {
    id: "a1",
    activityId: "a1",
    authorId: "author",
    authorName: "Test Author",
    type: "workout",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Test Author",
      type: "workout",
      totalVolume: 4500,
      exerciseCount: exercises.length,
      muscleGroups: ["horizontal_push"],
      exercises,
      ...extra,
    },
  } as unknown as FeedItem;
}

const renderCard = (item: FeedItem) =>
  render(
    <MemoryRouter>
      <ActivityCard feedItem={item} />
    </MemoryRouter>
  ).container;

describe("a lift post's hero", () => {
  it("is the drawing of the first lift done that has one", () => {
    const card = renderCard(
      liftPost([
        { name: "My Own Lift", summary: "3×10" },
        { name: "Bench Press", exerciseId: "bench-press", summary: "3×8×60 kg" },
        { name: "Barbell Squat", exerciseId: "squat", summary: "3×5×80 kg" },
      ])
    );
    const drawing = card.querySelector("img[data-lead-drawing]");
    expect(drawing?.getAttribute("src")).toMatch(/form-art\/bench-press\.webp$/);
    // In place of the muscle figure, not beside it.
    expect(
      screen.queryByRole("img", { name: "Muscles trained this session" })
    ).toBeNull();
  });

  it("finds an older post's lift by its name", () => {
    const card = renderCard(
      liftPost([{ name: "Barbell Squat", summary: "3×5×80 kg" }])
    );
    expect(
      card.querySelector("img[data-lead-drawing]")?.getAttribute("src")
    ).toMatch(/form-art\/squat\.webp$/);
  });

  it("keeps the muscle figure for a post with no drawn lift", () => {
    const card = renderCard(liftPost([{ name: "My Own Lift", summary: "3×10" }]));
    expect(card.querySelector("img[data-lead-drawing]")).toBeNull();
    expect(
      screen.getByRole("img", { name: "Muscles trained this session" })
    ).toBeInTheDocument();
  });

  it("carries the volume and the PRs over the drawing, once", () => {
    const card = renderCard(
      liftPost(
        [{ name: "Bench Press", exerciseId: "bench-press", summary: "3×8×60 kg" }],
        { prCount: 2 }
      )
    );
    expect(card.querySelector("img[data-lead-drawing]")).not.toBeNull();
    expect(screen.getAllByText("2 PRs")).toHaveLength(1);
    expect(screen.getAllByText(/kg volume/)).toHaveLength(1);
  });
});
