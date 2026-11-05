/**
 * A league week's result (Soc15 call 3): revealed full screen the first
 * time Social opens after Monday's turn, once per result on this device,
 * through the surface coordinator (ADR-0004), and never while one of the
 * page's own overlays is open. A rise throws confetti; a fall and Reduce
 * Motion do not. Escape, Done and See your league close it.
 *
 * Firestore runs on the one fake (ADR-0009). The result is last week's,
 * from the clock, so the +90-day run moves it with it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import confetti from "canvas-confetti";
import { SurfaceCoordinatorProvider } from "@/components/SurfaceCoordinatorProvider";
import LeagueResultGate from "../LeagueResultGate";
import { revealedLeagueWeeks } from "../leagueResultReveals";
import {
  readsAt,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { remove, scopedKey } from "@/lib/localStore";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

const UID = "league-member";
const LAST_WEEK = localDateString(
  addLocalDays(parseLocalDate(localWeekKey(new Date())), -7)
);

function result(over: Record<string, unknown> = {}) {
  return {
    weekKey: LAST_WEEK,
    tier: "bronze",
    newTier: "silver",
    rank: 2,
    of: 14,
    points: 100,
    outcome: "up",
    ...over,
  };
}

function renderGate(held = false) {
  return render(
    <MemoryRouter initialEntries={["/social"]}>
      <SurfaceCoordinatorProvider>
        <Routes>
          <Route
            path="/social"
            element={<LeagueResultGate uid={UID} held={held} />}
          />
          <Route path="/league" element={<p>League page</p>} />
        </Routes>
      </SurfaceCoordinatorProvider>
    </MemoryRouter>
  );
}

const RESULTS = `users/${UID}/leagueResults`;

/** The gate's read has been answered `n` times in all, and the
 *  coordinator's settle window (400 ms) has passed since: anything it was
 *  going to open is open. Anchors the "nothing opens" checks below. */
async function settled(n: number) {
  await waitFor(() => expect(readsAt(RESULTS)).toHaveLength(n));
  await new Promise((r) => setTimeout(r, 600));
}

/** The reveal, once its effects have run: the headline holds focus. */
async function revealed(name: string) {
  const dialog = await screen.findByRole("dialog", { name }, { timeout: 2000 });
  await waitFor(() =>
    expect(screen.getByRole("heading", { name })).toHaveFocus()
  );
  return dialog;
}

let reduce = false;
beforeEach(() => {
  resetFirestore();
  remove(scopedKey("leagueReveals", UID));
  vi.mocked(confetti).mockClear();
  reduce = false;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
});
afterEach(cleanup);

describe("the league result", () => {
  it("is revealed once: the new tier, the place and the points", async () => {
    seedFirestore({ [`users/${UID}/leagueResults/${LAST_WEEK}`]: result() });
    renderGate();
    const dialog = await revealed("You moved up to Silver");
    expect(dialog.textContent).toContain("2nd of 14");
    expect(dialog.textContent).toContain("100 points");
    expect(revealedLeagueWeeks(UID)).toEqual([LAST_WEEK]);
    await waitFor(() => expect(vi.mocked(confetti)).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    cleanup();
    renderGate();
    // The read is answered again, and nothing opens a second time.
    await settled(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a fall says what happened, with no confetti", async () => {
    seedFirestore({
      [`users/${UID}/leagueResults/${LAST_WEEK}`]: result({
        tier: "gold",
        newTier: "silver",
        rank: 13,
        points: 0,
        outcome: "down",
      }),
    });
    renderGate();
    const dialog = await revealed("You moved down to Silver");
    expect(dialog.textContent).toContain("A new week has started");
    expect(vi.mocked(confetti)).not.toHaveBeenCalled();
  });

  it("under Reduce Motion a rise throws nothing", async () => {
    reduce = true;
    seedFirestore({ [`users/${UID}/leagueResults/${LAST_WEEK}`]: result() });
    renderGate();
    await revealed("You moved up to Silver");
    expect(vi.mocked(confetti)).not.toHaveBeenCalled();
  });

  it("Escape closes it", async () => {
    seedFirestore({
      [`users/${UID}/leagueResults/${LAST_WEEK}`]: result({
        newTier: "bronze",
        outcome: "stay",
      }),
    });
    renderGate();
    await revealed("You stayed in Bronze");
    await waitFor(() => {
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("See your league opens the league", async () => {
    seedFirestore({ [`users/${UID}/leagueResults/${LAST_WEEK}`]: result() });
    renderGate();
    await revealed("You moved up to Silver");
    fireEvent.click(screen.getByRole("button", { name: "See your league" }));
    expect(await screen.findByText("League page")).toBeInTheDocument();
  });

  it("waits while one of the page's overlays is open, and opens once it closes", async () => {
    seedFirestore({ [`users/${UID}/leagueResults/${LAST_WEEK}`]: result() });
    const view = renderGate(true);
    await settled(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(revealedLeagueWeeks(UID)).toEqual([]);
    view.rerender(
      <MemoryRouter initialEntries={["/social"]}>
        <SurfaceCoordinatorProvider>
          <Routes>
            <Route path="/social" element={<LeagueResultGate uid={UID} />} />
          </Routes>
        </SurfaceCoordinatorProvider>
      </MemoryRouter>
    );
    await revealed("You moved up to Silver");
  });

  it("an old result is not revealed", async () => {
    const old = localDateString(
      addLocalDays(parseLocalDate(localWeekKey(new Date())), -21)
    );
    seedFirestore({
      [`users/${UID}/leagueResults/${old}`]: result({ weekKey: old }),
    });
    renderGate();
    await settled(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
