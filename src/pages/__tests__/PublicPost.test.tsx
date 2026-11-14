/**
 * A shared post's public page, signed out (App1 Q51): the card, who shared
 * it, Get Tropos, and nothing that leads further into the app. Anything
 * not shown is one page that never says why.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PublicPostView } from "@/lib/publicPost";

const load = vi.fn();
vi.mock("@/lib/publicPost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/publicPost")>()),
  loadPublicPost: (...a: unknown[]) => load(...a),
}));

import PublicPost from "../PublicPost";
import { APP_STORE_URL } from "@/lib/publicLinks";
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

afterEach(() => {
  cleanup();
  load.mockReset();
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
