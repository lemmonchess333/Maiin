/**
 * A feed card opens its post. The title, the numbers and a run's map
 * lead to `/activity/:id`, as a card does in Strava, Hevy and Garmin;
 * the props, comment and menu buttons, the author and the compare rows
 * stay their own targets, and no link holds another control. On the
 * post's own page nothing links back to itself.
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
  useBlockedUsers: () => ({ addBlocked: vi.fn(), blocked: new Set() }),
}));

const route = [
  { lat: 51.5, lon: -0.12 },
  { lat: 51.501, lon: -0.121 },
  { lat: 51.502, lon: -0.119 },
];

function run(activity: Record<string, unknown> = {}): FeedItem {
  return {
    id: "r1",
    activityId: "r1",
    authorId: "author",
    authorName: "Maya Chen",
    type: "run",
    summary: "",
    createdAt: { toDate: () => new Date() },
    kudosCount: 2,
    activity: {
      authorId: "author",
      authorName: "Maya Chen",
      type: "run",
      runName: "Tempo run",
      distance: 8240,
      duration: 2621,
      avgPace: 318,
      routePreview: route,
      ...activity,
    },
  } as FeedItem;
}

function lift(activity: Record<string, unknown> = {}): FeedItem {
  return {
    id: "w1",
    activityId: "w1",
    authorId: "author",
    authorName: "Maya Chen",
    type: "workout",
    summary: "",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Maya Chen",
      type: "workout",
      workoutName: "Heavy legs",
      duration: 3000,
      exerciseCount: 1,
      exercises: [
        {
          name: "Back Squat",
          summary: "3 x 5 100kg",
          setCount: 3,
          targetReps: 5,
          targetWeightKg: 100,
        },
      ],
      ...activity,
    },
  } as unknown as FeedItem;
}

const renderCard = (item: FeedItem, props: { linkToPost?: boolean } = {}) =>
  render(
    <MemoryRouter>
      <ActivityCard feedItem={item} {...props} />
    </MemoryRouter>
  );

const postLinks = (id: string) =>
  screen
    .queryAllByRole("link")
    .filter((a) => a.getAttribute("href") === `/activity/${id}`);

describe("a feed card opens its post", () => {
  it("from a run's title, its numbers and its map", () => {
    renderCard(run());
    const title = screen.getByText("Tempo run").closest("a");
    expect(title?.getAttribute("href")).toBe("/activity/r1");
    expect(screen.getByText("Time").closest("a")?.getAttribute("href")).toBe(
      "/activity/r1"
    );
    expect(
      screen
        .getByRole("img", { name: "Run route map" })
        .closest("a")
        ?.getAttribute("href")
    ).toBe("/activity/r1");
  });

  it("from a lift's title and its numbers, not its compare rows", () => {
    renderCard(lift());
    expect(
      screen.getByText("Heavy legs").closest("a")?.getAttribute("href")
    ).toBe("/activity/w1");
    expect(screen.getByText("min").closest("a")?.getAttribute("href")).toBe(
      "/activity/w1"
    );
    const compare = screen.getByRole("button", {
      name: "Compare your Back Squat",
    });
    expect(compare.closest("a")).toBeNull();
  });

  it("keeps props, comments, the menu and the author their own targets", () => {
    renderCard(run());
    for (const name of [
      "Give props",
      /props — show list/,
      "View comments",
      "More options",
    ]) {
      expect(screen.getByRole("button", { name }).closest("a")).toBeNull();
    }
    expect(
      screen.getByText("Maya Chen").closest("a")?.getAttribute("href")
    ).toBe("/user/author");
  });

  it("puts no control inside a link to the post", () => {
    renderCard(lift());
    renderCard(run());
    const links = [...postLinks("w1"), ...postLinks("r1")];
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const link of links) {
      expect(
        link.querySelector("a, button, input, [role='button']")
      ).toBeNull();
    }
  });

  it("gives a title on its own the 44 px floor", () => {
    renderCard(lift({ duration: 0, exercises: [], exerciseCount: 0 }));
    const title = screen.getByText("Heavy legs").closest("a");
    expect(title?.className).toMatch(/min-h-11/);
  });

  it("lets one stop in the tab order name the post, not three", () => {
    renderCard(run());
    const focusable = postLinks("r1").filter((a) => a.tabIndex !== -1);
    expect(focusable).toHaveLength(1);
    expect(focusable[0].textContent).toContain("Tempo run");
  });

  it("links nothing to itself on the post's own page", () => {
    renderCard(run(), { linkToPost: false });
    expect(postLinks("r1")).toHaveLength(0);
    expect(screen.getByText("Tempo run")).toBeTruthy();
  });
});
