/**
 * The run card's hero: the route, and the distance numeral beside it.
 *
 * The numeral was laid over the drawing in its bottom-left corner, on
 * ground the drawing left in its own units. The drawing scales to its box
 * and the numeral grows with the text size, so the two disagreed, and a
 * route starting bottom-left drew its start ring on the number (the Social
 * capture, 2026-11-03). The numeral now has a row of its own under the
 * drawing, in the page's flow, so no route can reach it.
 */
import { describe, expect, it, vi } from "vitest";
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
vi.mock("../../../hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

/** An out-and-back that starts and ends at its south-west corner. */
const outAndBack = [
  { lat: 51.5, lon: -0.13 },
  { lat: 51.5, lon: -0.12 },
  { lat: 51.505, lon: -0.11 },
  { lat: 51.5, lon: -0.12 },
  { lat: 51.5, lon: -0.13 },
];

function post(activity: Record<string, unknown>): FeedItem {
  return {
    id: "r1",
    activityId: "r1",
    authorId: "author",
    authorName: "Maya Chen",
    type: "run",
    summary: "Out and back",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Maya Chen",
      type: "run",
      distance: 8240,
      duration: 2621,
      avgPace: 318,
      routePreview: outAndBack,
      ...activity,
    },
  } as FeedItem;
}

const hybrid = {
  type: "workout",
  exercises: [
    {
      name: "Goblet Squat",
      summary: "3×12 @ 24kg",
      setCount: 3,
      targetReps: 12,
      targetWeightKg: 24,
    },
  ],
};

describe("the route hero", () => {
  it.each([
    ["run", {}],
    ["hybrid", hybrid],
  ])(
    "puts the %s card's distance in a row under the route, never over it",
    (_kind, extra) => {
      render(
        <MemoryRouter>
          <ActivityCard feedItem={post(extra)} />
        </MemoryRouter>
      );
      const map = screen.getByRole("img", { name: "Run route map" });
      const numeral = screen.getByText("8.24");
      // Not laid over the hero: nothing between the numeral and the hero
      // is taken out of the flow.
      const hero = map.closest(".border-b") as HTMLElement;
      expect(hero).not.toBeNull();
      expect(hero.contains(numeral)).toBe(true);
      for (let el = numeral.parentElement; el && el !== hero;) {
        expect(el.className).not.toMatch(/(^|\s)absolute(\s|$)/);
        el = el.parentElement;
      }
      // After the drawing's band, outside it.
      const band = map.parentElement as HTMLElement;
      expect(band.contains(numeral)).toBe(false);
      expect(
        band.compareDocumentPosition(numeral) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  );

  it("gives the whole hero to the route when there is no distance to show", () => {
    render(
      <MemoryRouter>
        <ActivityCard feedItem={post({ distance: 0 })} />
      </MemoryRouter>
    );
    const band = screen.getByRole("img", { name: "Run route map" })
      .parentElement as HTMLElement;
    expect(band.nextElementSibling).toBeNull();
  });
});
