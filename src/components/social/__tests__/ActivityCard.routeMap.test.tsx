/**
 * A run card's map image (Soc15 call 5): the route on a real street map,
 * as Strava, Nike Run Club and Garmin draw a run in the feed.
 *
 * The post names an image in each theme (`routeMap`). The card shows the
 * one for the theme on screen in a box of the image's own ratio, fades it
 * in over the drawn route, and keeps the drawing when the image fails.
 * The image carries the line, so the drawing is never shown over it, and
 * the distance keeps its row under the map, as it does under the drawing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActivityCard from "../ActivityCard";
import type { FeedItem } from "../../../hooks/useSocialFeed";
import { ROUTE_MAP_CSS_SIZE } from "@/lib/routeMapGeometry";

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

const BUCKET =
  "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/";
const ROUTE_MAP = {
  light: `${BUCKET}route-maps%2Fauthor%2Fr1%2Flight.jpg?alt=media&token=a`,
  dark: `${BUCKET}route-maps%2Fauthor%2Fr1%2Fdark.jpg?alt=media&token=b`,
};

const loop = [
  { lat: 51.5, lon: -0.13 },
  { lat: 51.5, lon: -0.12 },
  { lat: 51.505, lon: -0.11 },
  { lat: 51.5, lon: -0.13 },
];

function post(activity: Record<string, unknown>): FeedItem {
  return {
    id: "r1",
    activityId: "r1",
    authorId: "author",
    authorName: "Maya Chen",
    type: "run",
    summary: "Loop",
    createdAt: { toDate: () => new Date() },
    kudosCount: 0,
    activity: {
      authorId: "author",
      authorName: "Maya Chen",
      type: "run",
      distance: 8240,
      duration: 2621,
      avgPace: 318,
      routePreview: loop,
      routeMap: ROUTE_MAP,
      ...activity,
    },
  } as FeedItem;
}

function renderCard(extra: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <ActivityCard feedItem={post(extra)} />
    </MemoryRouter>
  );
}

const mapImage = (container: HTMLElement) =>
  container.querySelector("img[data-route-map]") as HTMLImageElement | null;

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("a run card with a map image", () => {
  it("shows the drawn route until the image is in, then the image in its place", () => {
    const { container } = renderCard();
    const image = mapImage(container)!;
    expect(image.getAttribute("loading")).toBe("lazy");
    // Loading: the drawing is what is on screen and what is read out.
    expect(image.className).toMatch(/opacity-0/);
    expect(screen.getByRole("img", { name: "Run route map" }).tagName).toBe(
      "svg"
    );

    fireEvent.load(image);

    expect(image.className).toMatch(/opacity-100/);
    const shown = screen.getByRole("img", { name: "Run route map" });
    expect(shown).toBe(image);
    // The drawing is under the image, never over it.
    const drawing = container.querySelector("svg")!;
    expect(
      drawing.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("fades in, and not for someone who asked for less motion", () => {
    const { container } = renderCard();
    expect(mapImage(container)!.className).toMatch(
      /transition-opacity.*motion-reduce:transition-none/
    );
  });

  it("shows the theme on screen's image, and follows the theme when it flips", async () => {
    const { container } = renderCard();
    expect(mapImage(container)!.getAttribute("src")).toBe(
      `blob:${ROUTE_MAP.light}`
    );
    await act(async () => {
      document.documentElement.classList.add("dark");
    });
    expect(mapImage(container)!.getAttribute("src")).toBe(
      `blob:${ROUTE_MAP.dark}`
    );
  });

  it("keeps the drawn route when the image will not load", () => {
    const { container } = renderCard();
    fireEvent.error(mapImage(container)!);
    expect(mapImage(container)).toBeNull();
    expect(screen.getByRole("img", { name: "Run route map" }).tagName).toBe(
      "svg"
    );
  });

  it("keeps the distance in a row under the map, never over it", () => {
    const { container } = renderCard();
    const image = mapImage(container)!;
    fireEvent.load(image);
    const box = image.parentElement as HTMLElement;
    const numeral = screen.getByText("8.24");
    expect(box.contains(numeral)).toBe(false);
    expect(
      box.compareDocumentPosition(numeral) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    for (let el = numeral.parentElement; el && el !== box.parentElement;) {
      expect(el.className).not.toMatch(/(^|\s)absolute(\s|$)/);
      el = el.parentElement;
    }
  });

  it("draws the map in a box of the image's own ratio, so nothing is cropped", () => {
    const { container } = renderCard();
    const box = mapImage(container)!.parentElement as HTMLElement;
    const ratio = box.className.match(/aspect-\[(\d+)\/(\d+)\]/);
    expect(ratio).toBeTruthy();
    expect(Number(ratio![1]) / Number(ratio![2])).toBeCloseTo(
      ROUTE_MAP_CSS_SIZE.width / ROUTE_MAP_CSS_SIZE.height
    );
    expect(mapImage(container)!.className).toMatch(/object-cover/);
  });

  it.each([
    ["no map", undefined],
    ["a map in one theme only", { light: ROUTE_MAP.light }],
    ["a map that is not a web address", { light: "javascript:x", dark: "x" }],
  ])("keeps the drawn hero for a post with %s", (_case, routeMap) => {
    const { container } = renderCard({ routeMap });
    expect(mapImage(container)).toBeNull();
    expect(screen.getByRole("img", { name: "Run route map" }).tagName).toBe(
      "svg"
    );
  });
});

describe("the card loads no map library", () => {
  it("draws a map image with an <img>, never MapLibre", () => {
    for (const file of ["ActivityCard.tsx", "RouteMapHero.tsx"]) {
      const src = readFileSync(resolve(__dirname, "..", file), "utf8");
      expect(src, file).not.toMatch(/maplibre|routeMapImage/);
    }
  });
});

vi.mock("@/hooks/useActivityMedia", () => ({
  useActivityMedia: (url: string) => (url ? `blob:${url}` : undefined),
}));
