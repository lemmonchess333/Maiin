/**
 * The medal reveal (Soc15): read from the person's own medals, shown once
 * per medal and tier on this device, through the surface coordinator
 * (ADR-0004), and never while one of the page's own overlays is open.
 * It opens as a new badge does, on the sealed capsule, tapped open
 * (useSealBreak, SealStage); the medal, Share and Done come after.
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

import confetti from "canvas-confetti";
import { haptic } from "@/lib/haptic";
import { SurfaceCoordinatorProvider } from "@/components/SurfaceCoordinatorProvider";
import MedalReveal from "../MedalReveal";
import MedalRevealGate from "../MedalRevealGate";
import { useMedalReveal } from "../useMedalReveal";
import { revealedMedals } from "../medalReveals";
import { MEDAL_REVEAL_WINDOW_DAYS, parseMedal } from "../medals";
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

/** The reveal as it opens: sealed, as a new badge arrives. Found once
 *  the seal has taken focus, so its effects have run: the dialog is in
 *  the document a beat before they do, and an Escape pressed in that
 *  beat (under a loaded run) finds no listener yet. */
const SEALED = "New gold medal. Tap the seal to break it open";
async function sealed() {
  const dialog = await screen.findByRole(
    "dialog",
    { name: SEALED },
    { timeout: 2000 }
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /break the seal/i })
    ).toHaveFocus()
  );
  return dialog;
}

/** Three taps on the seal (motion is on under jsdom), then the
 *  confetti's three volleys thrown, so none lands in a later test. */
async function breakSeal() {
  const thrown = vi.mocked(confetti).mock.calls.length;
  for (let i = 0; i < 3; i++) {
    fireEvent.click(screen.getByRole("button", { name: /break the seal/i }));
  }
  await waitFor(() =>
    expect(vi.mocked(confetti).mock.calls.length).toBe(thrown + 3)
  );
}

/** The reveal opened: the seal tapped through to the medal. */
async function reveal() {
  await sealed();
  await breakSeal();
  return screen.getByRole("dialog", { name: "Gold · November Mileage" });
}

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

  it("closes on Escape, sealed or not", async () => {
    seedFirestore({ [`users/${UID}/medals/monthly-x`]: medalDoc() });
    renderGate();
    await sealed();
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
    await sealed();
  });
});

describe("MedalReveal — opened as a badge is", () => {
  const realMatchMedia = window.matchMedia;
  const medal = () => parseMedal("monthly-x", medalDoc())!;
  const seal = () => screen.getByRole("button", { name: /break the seal/i });
  const kinds = () => vi.mocked(haptic).mock.calls.map(([kind]) => kind);

  beforeEach(() => {
    vi.mocked(haptic).mockClear();
    vi.mocked(confetti).mockClear();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    vi.unstubAllGlobals();
  });

  it("opens on the sealed capsule in the medal's tier, with nothing of the medal's in reach", () => {
    render(<MedalReveal medal={medal()} onDone={() => {}} />);
    expect(screen.getByRole("dialog", { name: SEALED })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Break the seal to reveal your new gold medal (tap 0 of 3)",
      })
    ).toHaveFocus();
    expect(screen.getByText("New medal")).toBeInTheDocument();
    expect(screen.getByText("Tap to break the seal")).toBeInTheDocument();
    expect(
      document.querySelector("image[data-seal-art]")?.getAttribute("href")
    ).toMatch(/badges\/seal_gold\.webp$/);
    expect(haptic).toHaveBeenCalledWith("light");
    // The title, Share and Done are laid out under the seal, unseen.
    expect(
      screen.queryByRole("heading", { name: "Gold · November Mileage" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("cracks on two taps and breaks on the third, and then the medal, Share and Done are there", async () => {
    const onDone = vi.fn();
    render(<MedalReveal medal={medal()} onDone={onDone} />);
    fireEvent.click(seal());
    expect(seal()).toHaveAccessibleName(/tap 1 of 3/);
    expect(screen.getByText("Keep tapping…")).toBeInTheDocument();
    fireEvent.click(seal());
    expect(seal()).toHaveAccessibleName(/tap 2 of 3/);
    expect(document.querySelectorAll("[data-seal-crack]")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    expect(confetti).not.toHaveBeenCalled();

    fireEvent.click(seal());
    expect(
      screen.queryByRole("button", { name: /break the seal/i })
    ).toBeNull();
    const dialog = screen.getByRole("dialog", {
      name: "Gold · November Mileage",
    });
    expect(dialog.textContent).toMatch(/52\.4\s*km/);
    // Focus goes from the seal to what was inside it.
    expect(
      screen.getByRole("heading", { name: "Gold · November Mileage" })
    ).toHaveFocus();
    expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
    expect(kinds()).toEqual(["light", "light", "medium", "heavy"]);
    await waitFor(() => expect(confetti).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("counts a tap beside the seal as one on it, and a tap on it once", async () => {
    render(<MedalReveal medal={medal()} onDone={() => {}} />);
    fireEvent.click(screen.getByText("New medal"));
    expect(seal()).toHaveAccessibleName(/tap 1 of 3/);
    fireEvent.click(seal());
    expect(seal()).toHaveAccessibleName(/tap 2 of 3/);
    fireEvent.click(screen.getByTestId("medal-reveal"));
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    await waitFor(() => expect(confetti).toHaveBeenCalledTimes(3));
  });

  it("ticks higher on each crack and chimes on the break, as a badge's does", async () => {
    const tones: number[] = [];
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      createOscillator() {
        return {
          type: "",
          frequency: {
            set value(hz: number) {
              tones.push(hz);
            },
          },
          connect() {},
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          gain: { value: 0, exponentialRampToValueAtTime() {} },
          connect() {},
        };
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    render(<MedalReveal medal={medal()} onDone={() => {}} />);
    fireEvent.click(seal());
    fireEvent.click(seal());
    expect(tones).toEqual([410, 500]);
    fireEvent.click(seal());
    expect(tones).toEqual([410, 500, 523, 659]);
    await waitFor(() => expect(confetti).toHaveBeenCalledTimes(3));
  });

  it("opens on one tap under Reduce Motion, and throws nothing", async () => {
    window.matchMedia = ((query: string) => ({
      ...realMatchMedia(query),
      matches: query.includes("prefers-reduced-motion: reduce"),
    })) as typeof window.matchMedia;
    render(<MedalReveal medal={medal()} onDone={() => {}} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Break the seal to reveal your new gold medal (tap 0 of 1)",
      })
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    expect(kinds()).toEqual(["light", "heavy"]);
    // Past the point a lazy confetti load would have landed.
    await act(async () => {
      await import("canvas-confetti");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(confetti).not.toHaveBeenCalled();
  });
});
