/**
 * A shared card's page (Soc17 calls 1 and 2, the owner's layout of 22 Nov
 * 2026): one line naming the sharer by first name, the card as sent with
 * a run's drawn without its line, one button, "Join Tropos", a line about
 * Tropos, and one page for every card not shown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { SharedCardView } from "@/lib/sharedCardPage";

const load = vi.fn();
vi.mock("@/lib/sharedCardPage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sharedCardPage")>()),
  loadSharedCard: (...a: unknown[]) => load(...a),
}));

import SharedCard from "@/website/pages/SharedCard";
import { APP_STORE_URL } from "@/lib/publicLinks";
import { logger } from "@/lib/logger";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

const RUN: SharedCardView = {
  token: TOKEN,
  firstName: "Sam",
  summary: "Long run: 10.21 km in 52:10 at 5:06 /km.",
  card: {
    template: "run",
    format: "story",
    background: "brand",
    unit: "km",
    liftUnit: "kg",
    handle: "Sam",
    date: "21 Nov 2026",
    headline: "Long run",
    distanceKm: 10.21,
    durationSec: 3130,
    paceSecPerKm: 306,
  },
};

function renderAt() {
  return render(
    <MemoryRouter initialEntries={[`/card/${TOKEN}`]}>
      <Routes>
        <Route path="/card/:token" element={<SharedCard />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  load.mockReset();
});

describe("a shared card's page", () => {
  it("names the sharer and what they shared, and draws a run's card without its line", async () => {
    load.mockResolvedValue(RUN);
    const { container } = renderAt();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Sam shared a run",
      })
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByRole("img", { name: RUN.summary })).toBeInTheDocument();
    expect(container.querySelector("svg path[stroke-linecap]")).toBeNull();
    // Without a code, the one button goes to the App Store.
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Join Tropos"]);
    expect(links[0]).toHaveAttribute("href", APP_STORE_URL);
    expect(
      screen.getByText("Your training and food, planned together.")
    ).toBeInTheDocument();
  });

  it("says only that a card not shown isn’t available", async () => {
    load.mockResolvedValue(null);
    renderAt();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "This card isn’t available",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/private|deleted|blocked|restricted|Sam/i)
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Join Tropos" })).toHaveAttribute(
      "href",
      APP_STORE_URL
    );
  });

  it("offers to try again when the card cannot be read", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    load.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(RUN);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Sam shared a run" })
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
