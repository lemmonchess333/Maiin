/**
 * The medal reveal (Soc15): read from the person's own medals, shown once
 * per medal and tier on this device, through the surface coordinator
 * (ADR-0004), and never while one of the page's own overlays is open.
 *
 * Firestore runs on the one fake (ADR-0009). The medals are dated from
 * the clock, inside the reveal's fortnight, so the +90-day run moves them
 * with it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("canvas-confetti", () => ({ default: vi.fn() }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { SurfaceCoordinatorProvider } from "@/components/SurfaceCoordinatorProvider";
import MedalRevealGate from "../MedalRevealGate";
import { useMedalReveal } from "../useMedalReveal";
import { revealedMedals } from "../medalReveals";
import { MEDAL_REVEAL_WINDOW_DAYS } from "../medals";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { remove, scopedKey } from "@/lib/localStore";

const UID = "medal-owner";
const DAY = 86_400_000;

function medalDoc(over: Record<string, unknown> = {}) {
  return {
    challengeId: "monthly-x",
    name: "November Mileage",
    metric: "total_km",
    type: "monthly",
    tier: "gold",
    value: 52.4,
    goal: 50,
    startDate: "2026-11-01",
    endDate: "2026-12-01",
    earnedAt: new Date(Date.now() - DAY).toISOString(),
    reachedAt: {},
    ...over,
  };
}

beforeEach(() => {
  resetFirestore();
  remove(scopedKey("medalReveals", UID));
});
afterEach(cleanup);

function renderGate(held = false) {
  return render(
    <SurfaceCoordinatorProvider>
      <MedalRevealGate uid={UID} held={held} />
    </SurfaceCoordinatorProvider>
  );
}

const reveal = () =>
  screen.findByRole(
    "dialog",
    { name: "Gold · November Mileage" },
    { timeout: 2000 }
  );

describe("useMedalReveal", () => {
  it("offers a medal reached in the last fortnight, once", async () => {
    seedFirestore({ [`users/${UID}/medals/monthly-x`]: medalDoc() });
    const first = renderHook(() => useMedalReveal(UID));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    const medal = first.result.current.medal;
    expect(medal?.challengeId).toBe("monthly-x");
    act(() => first.result.current.markRevealed(medal!));
    expect(revealedMedals(UID)).toEqual({ "monthly-x": 3 });
    first.unmount();

    const again = renderHook(() => useMedalReveal(UID));
    await waitFor(() => expect(again.result.current.ready).toBe(true));
    expect(again.result.current.medal).toBeNull();
  });

  it("offers a silver again after its bronze was revealed", async () => {
    seedFirestore({
      [`users/${UID}/medals/monthly-x`]: medalDoc({ tier: "silver" }),
    });
    const { result } = renderHook(() => useMedalReveal(UID));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.markRevealed({ ...result.current.medal!, tier: "bronze" })
    );
    expect(revealedMedals(UID)).toEqual({ "monthly-x": 1 });
  });

  it("does not offer one reached before the window", async () => {
    seedFirestore({
      [`users/${UID}/medals/monthly-x`]: medalDoc({
        earnedAt: new Date(
          Date.now() - (MEDAL_REVEAL_WINDOW_DAYS + 2) * DAY
        ).toISOString(),
      }),
    });
    const { result } = renderHook(() => useMedalReveal(UID));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.medal).toBeNull();
  });
});

describe("MedalRevealGate", () => {
  it("reveals the medal full-screen with its figure, and Done closes it for good", async () => {
    seedFirestore({ [`users/${UID}/medals/monthly-x`]: medalDoc() });
    renderGate();
    const dialog = await reveal();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.textContent).toMatch(/52\.4\s*km/);
    expect(dialog.textContent).toMatch(/1–30 November 2026/);
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    // Recorded as it shows.
    expect(revealedMedals(UID)).toEqual({ "monthly-x": 3 });

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByTestId("medal-reveal")).toBeNull()
    );

    // The next visit to Social: no reveal.
    cleanup();
    const next = renderHook(() => useMedalReveal(UID));
    await waitFor(() => expect(next.result.current.ready).toBe(true));
    expect(next.result.current.medal).toBeNull();
  });

  it("closes on Escape", async () => {
    seedFirestore({ [`users/${UID}/medals/monthly-x`]: medalDoc() });
    renderGate();
    await reveal();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByTestId("medal-reveal")).toBeNull()
    );
  });

  it("waits while an overlay on the page is open, and opens once it closes", async () => {
    seedFirestore({ [`users/${UID}/medals/monthly-x`]: medalDoc() });
    const { rerender } = renderGate(true);
    // Past the coordinator's settle window, held.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(screen.queryByTestId("medal-reveal")).toBeNull();
    expect(revealedMedals(UID)).toEqual({});
    rerender(
      <SurfaceCoordinatorProvider>
        <MedalRevealGate uid={UID} held={false} />
      </SurfaceCoordinatorProvider>
    );
    await reveal();
  });
});
