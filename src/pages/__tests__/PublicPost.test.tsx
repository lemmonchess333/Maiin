/**
 * A shared post's public page, signed out (App1 Q51): the card, who shared
 * it, a run's map with its ends cut off when the server sent one, Get
 * Tropos, and nothing that leads further into the app. Anything not shown
 * is one page that never says why.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PublicPostView } from "@/lib/publicPost";

const load = vi.fn();
vi.mock("@/lib/publicPost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/publicPost")>()),
  loadPublicPost: (...a: unknown[]) => load(...a),
}));

/* The map is the app's (MapLibre needs WebGL, which jsdom has not): a
   stand-in that shows what the page asked it to draw, and can fail as a
   browser with no WebGL does. */
const mapState = { fail: false };
vi.mock("@/components/run/RunMap", () => ({
  default: (props: {
    points: { lat: number; lon: number }[];
    interactive?: boolean;
    endMarkers?: boolean;
  }) => {
    if (mapState.fail) throw new Error("WebGL unavailable");
    return (
      <div
        data-testid="run-map"
        data-first={`${props.points[0].lat},${props.points[0].lon}`}
        data-count={props.points.length}
        data-interactive={String(props.interactive)}
        data-end-markers={String(props.endMarkers)}
      />
    );
  },
}));

import PublicPost from "../PublicPost";
import { APP_STORE_URL } from "@/lib/publicLinks";
import { logger } from "@/lib/logger";
import { formatDayMonthYear } from "@/utils/formatters";

const RUN: PublicPostView = {
  id: "run1",
  type: "run",
  authorName: "Sam",
  title: "Long run",
  createdAt: Date.UTC(2026, 10, 12, 12),
  unit: "km",
  liftUnit: "kg",
  distanceM: 10210,
  durationSec: 3130,
  paceSecPerKm: 306,
  summary: "Long run: 10.21 km in 52:10 at 5:06 /km.",
};

function renderAt(id = "run1") {
  return render(
    <MemoryRouter initialEntries={[`/activity/${id}`]}>
      <Routes>
        <Route path="/activity/:activityId" element={<PublicPost />} />
      </Routes>
    </MemoryRouter>
  );
}

/** The line the server sent: the route less its first and last 400 m. */
const ROUTE = [
  { lat: 51.5036, lon: -0.12 },
  { lat: 51.51, lon: -0.121 },
  { lat: 51.52, lon: -0.118, breakBefore: true },
  { lat: 51.5306, lon: -0.12 },
];

afterEach(() => {
  cleanup();
  load.mockReset();
  mapState.fail = false;
});

describe("a public post", () => {
  it("shows who shared it, the card and Get Tropos", async () => {
    load.mockResolvedValue(RUN);
    renderAt();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sam’s run" })
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("run1");
    // In the visitor's own day, whatever their time zone (the card's
    // footer says it too).
    expect(
      screen.getAllByText(formatDayMonthYear(new Date(RUN.createdAt!))).length
    ).toBeGreaterThan(0);
    // The card, named for a screen reader by its figures.
    expect(
      screen.getByRole("img", {
        name: "Long run: 10.21 km in 52:10 at 5:06 /km.",
      })
    ).toBeInTheDocument();
    const get = screen.getByRole("link", { name: "Get Tropos" });
    expect(get).toHaveAttribute("href", APP_STORE_URL);
  });

  it("leads nowhere further into the app: one link, no props or comments", async () => {
    load.mockResolvedValue(RUN);
    renderAt();
    await screen.findByRole("heading", { level: 1, name: "Sam’s run" });
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    ).toEqual([APP_STORE_URL]);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText(/props|comment/i)).toBeNull();
  });
});

describe("a run's map", () => {
  it("draws the line the server sent under the card, still and without end dots", async () => {
    load.mockResolvedValue({ ...RUN, route: ROUTE });
    renderAt();
    const map = await screen.findByTestId("run-map");
    expect(map).toHaveAttribute("data-count", "4");
    expect(map).toHaveAttribute("data-first", "51.5036,-0.12");
    expect(map).toHaveAttribute("data-interactive", "false");
    expect(map).toHaveAttribute("data-end-markers", "false");
    expect(screen.getByText("Start and finish hidden")).toBeInTheDocument();
    // Under the card, before Get Tropos.
    const card = screen.getByRole("img", { name: RUN.summary });
    const get = screen.getByRole("link", { name: "Get Tropos" });
    expect(
      card.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      map.compareDocumentPosition(get) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // Still nothing that leads into the app.
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href"))
    ).toEqual([APP_STORE_URL]);
  });

  it("draws none when the server sent no route", async () => {
    load.mockResolvedValue(RUN);
    renderAt();
    await screen.findByRole("img", { name: RUN.summary });
    expect(screen.queryByTestId("run-map")).toBeNull();
    expect(screen.queryByText("Start and finish hidden")).toBeNull();
  });

  it("gives way to the card alone when the map cannot be drawn", async () => {
    mapState.fail = true;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    load.mockResolvedValue({ ...RUN, route: ROUTE });
    renderAt();
    // Anchored on the failure itself, not on the map's absence.
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[public-post] map not drawn",
        expect.any(Error)
      )
    );
    expect(screen.queryByText("Start and finish hidden")).toBeNull();
    // The page itself carries on.
    expect(screen.getByRole("img", { name: RUN.summary })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get Tropos" })
    ).toBeInTheDocument();
    warn.mockRestore();
    quiet.mockRestore();
  });
});

describe("a post that is not shown", () => {
  it("says only that it isn’t available, with Get Tropos", async () => {
    load.mockResolvedValue(null);
    renderAt();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This post isn’t available",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/private|followers|deleted|blocked|restricted/i)
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Get Tropos" })).toHaveAttribute(
      "href",
      APP_STORE_URL
    );
  });
});

describe("a read that fails", () => {
  it("offers to try again", async () => {
    load.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(RUN);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sam’s run" })
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
