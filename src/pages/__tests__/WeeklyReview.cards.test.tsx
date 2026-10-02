/**
 * The weekly recap as cards (DS3): the week in numbers, its best moment
 * when a new best was set, and the week ahead. Everything the single
 * scroll carried is still here, one card at a time.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UserProfile } from "@/lib/auth";

let mockProfile: Partial<UserProfile> | null = null;
let mockReview: unknown = null;
let mockLoading = false;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u-1" }, profile: mockProfile }),
  useUid: () => "u-1",
}));

vi.mock("@/hooks/useWeeklyReview", () => ({
  useWeeklyReview: () => ({
    loading: mockLoading,
    review: mockReview,
    weekKey: "2026-W27",
  }),
  reviewViewedKey: (weekKey: string) => `tropos-review-viewed:${weekKey}`,
}));

/* The first card's counts count up as the recap opens (DS3). These tests
   read the figures, so they run with Reduce Motion on, where each is
   plain text from the first paint. */
const motionPref = vi.hoisted(() => ({ reduce: true }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motionPref.reduce,
}));

// The real MomentumCheckinCard reads Firestore; the one fake (ADR-0009).
vi.mock("firebase/firestore");

vi.mock("@/hooks/useDismissOnce", () => ({
  useDismissOnce: () => ({ dismiss: vi.fn(), dismissed: false }),
}));

/* The share sheet renders the card off-screen to export it; here it only
   needs to show what it was handed. */
vi.mock("@/components/share/ShareCardSheet", () => ({
  default: ({ open, data }: { open: boolean; data: unknown }) =>
    open ? <pre data-testid="share-sheet">{JSON.stringify(data)}</pre> : null,
}));

import WeeklyReview from "../WeeklyReview";

const BEST = {
  exerciseId: "bench-press",
  exerciseName: "Bench Press",
  weight: 80,
  reps: 8,
  date: "2026-07-02",
  previous: { weight: 77.5, reps: 8, date: "2026-06-11" },
};

function normal(overrides: Record<string, unknown> = {}) {
  return {
    kind: "normal",
    weekKey: "2026-06-29",
    range: { start: "2026-06-29", end: "2026-07-05" },
    headline: {
      pi: 92,
      delta: 2,
      verdict: "Load has run high.",
      deload: false,
    },
    training: {
      lifts: { done: 2, planned: 3, tonnageKg: 13280 },
      runs: { count: 2, km: 11, longestKm: 6.2, planned: null },
      prsHit: 1,
      best: BEST,
    },
    nutrition: {
      daysLogged: 5,
      avgCalories: 2150,
      target: 2200,
      retuned: false,
    },
    body: null,
    weekAhead: { lifts: 3, runs: 2, phaseNote: null },
    ...overrides,
  };
}

function renderRecap() {
  return render(
    <MemoryRouter initialEntries={["/review"]}>
      <Routes>
        <Route path="/review" element={<WeeklyReview />} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const slides = () =>
  screen.getAllByRole("group").map((el) => el.getAttribute("aria-label"));

afterEach(() => {
  cleanup();
  mockProfile = null;
  mockReview = null;
  mockLoading = false;
});

describe("WeeklyReview — the recap as cards", () => {
  it("tells the week in three cards when a new best was set", () => {
    mockReview = normal();
    renderRecap();
    expect(slides()).toEqual([
      "Your week, 1 of 3",
      "Best moment, 2 of 3",
      "The week ahead, 3 of 3",
    ]);
  });

  it("skips the best moment when there was none", () => {
    mockReview = normal({
      training: { ...normal().training, prsHit: null, best: null },
    });
    renderRecap();
    expect(slides()).toEqual(["Your week, 1 of 2", "The week ahead, 2 of 2"]);
    expect(
      screen.getByRole("button", { name: "The week ahead" })
    ).toBeInTheDocument();
  });

  it("gives the week's numbers big, each over what it counts", () => {
    mockReview = normal();
    renderRecap();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(
      screen.getByText("sessions, 2 of 3 lifts and 2 runs")
    ).toBeInTheDocument();
    expect(screen.getByText("kg lifted")).toBeInTheDocument();
    expect(screen.getByText("11.0")).toBeInTheDocument();
    expect(screen.getByText("km run, longest 6.2 km")).toBeInTheDocument();
    expect(screen.getByText("5 of 7")).toBeInTheDocument();
    expect(screen.getByText("days with food logged")).toBeInTheDocument();
  });

  it("counts the week's numbers up as it opens, when motion is allowed", async () => {
    motionPref.reduce = false;
    try {
      mockReview = normal();
      renderRecap();
      const lifted = screen.getByText("kg lifted").previousElementSibling!;
      expect(lifted.textContent).toBe("0");
      await waitFor(() =>
        expect(lifted.textContent).toBe((13280).toLocaleString())
      );
    } finally {
      motionPref.reduce = true;
    }
  });

  it("closes the first card on the week's index and its verdict", () => {
    mockReview = normal();
    renderRecap();
    const line = screen.getByText(/performance, up/);
    expect(line.textContent).toBe("92 performance, up 2");
    expect(screen.getByText("Load has run high.")).toBeInTheDocument();
  });

  it("shows the best moment: the lift, the figure, what it beat", () => {
    mockReview = normal({
      training: { ...normal().training, prsHit: 3 },
    });
    renderRecap();
    expect(screen.getByText("Best moment")).toBeInTheDocument();
    expect(screen.getByText("New best")).toBeInTheDocument();
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText(/Previous best/).textContent).toMatch(
      /^Previous best 77\.5 kg × 8, 11 Jun$/
    );
    expect(screen.getByText(/more new bests this week/).textContent).toBe(
      "And 2 more new bests this week"
    );
  });

  it("keeps hide-the-number: the weight trend in words, never a figure", () => {
    mockProfile = { hideWeightNumber: true } as Partial<UserProfile>;
    mockReview = normal({
      body: {
        hidden: true,
        deltaKg: null,
        direction: "down",
        projectionDate: null,
      },
    });
    renderRecap();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByText("weight trend this week")).toBeInTheDocument();
    expect(screen.queryByText(/kg, weight trend/)).toBeNull();
  });

  it("says a quiet week plainly, then the week ahead", () => {
    mockReview = {
      kind: "quiet",
      range: { start: "2026-06-29", end: "2026-07-05" },
      headline: null,
      training: null,
      nutrition: null,
      body: null,
      weekAhead: { lifts: null, runs: null, phaseNote: null },
    };
    renderRecap();
    expect(slides()).toEqual([
      "A quiet week, 1 of 2",
      "The week ahead, 2 of 2",
    ]);
    expect(
      screen.getByText("Train when it suits you — log it and it counts.")
    ).toBeInTheDocument();
  });

  it("before any review, one card that says when the first appears", () => {
    mockReview = null;
    renderRecap();
    expect(slides()).toEqual(["Your first review, 1 of 1"]);
  });

  describe("moving between cards", () => {
    const scrollTo = vi.fn();
    beforeEach(() => {
      scrollTo.mockClear();
      // jsdom lays nothing out and scrolls no element; give the track a
      // phone's width and a scrollTo to observe.
      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get: () => 393,
      });
      Object.defineProperty(HTMLElement.prototype, "scrollTo", {
        configurable: true,
        value: scrollTo,
      });
    });
    afterEach(() => {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
      delete (HTMLElement.prototype as { clientWidth?: unknown }).clientWidth;
      vi.unstubAllGlobals();
    });

    it("Next moves to the next card and leaves the glide to CSS", () => {
      mockReview = normal();
      renderRecap();
      fireEvent.click(screen.getByRole("button", { name: "Your best moment" }));
      expect(scrollTo).toHaveBeenCalledWith({ left: 393 });
      // No behaviour of its own: an explicit one beats Reduce Motion's
      // reset by spec. The track glides by CSS, where motion is allowed.
      expect(scrollTo.mock.calls[0][0]).not.toHaveProperty("behavior");
      expect(screen.getByRole("region", { name: "Weekly recap" })).toHaveClass(
        "motion-safe:scroll-smooth"
      );
    });

    it("the progress bars follow a swipe", () => {
      mockReview = normal();
      const { container } = renderRecap();
      const seen = () => container.querySelectorAll("[data-seen]").length;
      expect(seen()).toBe(1);
      const track = screen.getByRole("region", { name: "Weekly recap" });
      track.scrollLeft = 786;
      fireEvent.scroll(track);
      expect(seen()).toBe(3);
    });
  });

  it("closes to Home when there is nowhere to go back to", () => {
    mockReview = normal();
    renderRecap();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("Home page")).toBeInTheDocument();
  });
});

describe("WeeklyReview — sharing the week", () => {
  /* "Share your week" lived at the top of the Social feed as a "Build
     recap" card until 2026-10-01, where it pushed every post down. It
     moved here, onto the week it describes. */
  it("shares the week it reviews, in its own numbers", () => {
    mockProfile = { displayName: "Sam" };
    mockReview = normal();
    renderRecap();
    fireEvent.click(screen.getByRole("button", { name: "Share your week" }));
    expect(
      JSON.parse(screen.getByTestId("share-sheet").textContent ?? "{}")
    ).toEqual({
      template: "recap",
      handle: "Sam",
      date: "29 Jun – 5 Jul",
      sessionsCount: 4,
      distanceKm: 11,
      totalVolumeKg: 13280,
    });
  });

  it("offers nothing to share for a quiet week", () => {
    mockReview = normal({ kind: "quiet", training: null });
    renderRecap();
    expect(
      screen.queryByRole("button", { name: "Share your week" })
    ).toBeNull();
  });
});
