/**
 * A saved run's page shows what its finish screen showed: best efforts
 * (searched in the track the run kept), the splits as one table, and what
 * the runner said about it (how it felt, their notes). Each section shows
 * only when the run has something for it.
 *
 * The page reads its run through `useSessionDoc`, stubbed here to hand it
 * a stored document; its map, elevation chart and sheets are stubbed out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { restoreRealTimers } from "@/test/fakeTimers";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { totalDistance, type GPSPoint } from "@/lib/gps";

const h = vi.hoisted(() => ({
  run: null as Record<string, unknown> | null,
  mapProps: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "runner" },
    profile: { displayName: "Runner", darkMode: false },
  }),
}));
vi.mock("@/hooks/useSessionDoc", () => ({
  useSessionDoc: () => ({
    status: h.run ? "ready" : "loading",
    data: h.run,
    retry: vi.fn(),
  }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/hooks/usePrivacyZones", () => ({
  usePrivacyZones: () => ({ zones: [], loading: false, error: null }),
}));
vi.mock("@/hooks/useShareRoute", () => ({ useShareRoute: () => vi.fn() }));
vi.mock("@/hooks/useSavedRoutes", () => ({
  useSavedRoutes: () => ({ save: vi.fn() }),
}));
vi.mock("@/components/run/RunMapLazy", () => ({
  default: (props: Record<string, unknown>) => {
    h.mapProps.push(props);
    return null;
  },
}));
vi.mock("@/components/analytics/ElevationProfile", () => ({
  default: () => null,
}));
vi.mock("@/components/share/ShareCardSheet", () => ({
  default: () => null,
  ShareCardSheet: () => null,
}));
vi.mock("@/components/session/DeleteSessionAction", () => ({
  default: () => null,
}));

import RunDetail from "../RunDetail";

/** `n` fixes stepping ~111 m north every `dtSec` seconds. */
function track(n: number, dtSec: number): GPSPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    lat: 51.5 + i * 0.001,
    lon: 0,
    rawLat: 51.5 + i * 0.001,
    rawLon: 0,
    altitude: null,
    accuracy: 5,
    speed: null,
    timestamp: 1_700_000_000_000 + i * dtSec * 1000,
  }));
}

/** A 1.3 km run at a steady 4:30 /km, as the finish screen saves it. */
function savedRun(extra: Record<string, unknown> = {}) {
  const points = track(13, 30);
  const distance = totalDistance(points);
  return {
    id: "run-1",
    activityType: "freerun",
    distance,
    duration: 360,
    elevationGain: 0,
    calories: 90,
    completedAt: { toDate: () => new Date(2026, 9, 3, 8, 30) },
    points,
    splits: [
      {
        km: 1,
        time: 270,
        pace: "4:30",
        paceSeconds: 270,
        elevationGain: 0,
        elevationLoss: 0,
      },
    ],
    notes: "",
    relativeEffort: null,
    isInvalid: false,
    ...extra,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/run/run-1"]}>
      <Routes>
        <Route path="/run/:runId" element={<RunDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.run = null;
  h.mapProps.length = 0;
});
afterEach(() => cleanup());

describe("RunDetail — best efforts", () => {
  it("lists the efforts found in the kept track", () => {
    h.run = savedRun();
    renderDetail();
    const card = screen.getByRole("region", { name: "Best efforts" });
    // The fastest 1,000 m window of a steady 270 s/km track: nine 111 m
    // steps of 30 s each.
    expect(within(card).getByText("1K")).toBeVisible();
    expect(within(card).getByText("1K").nextElementSibling?.textContent).toBe(
      "4:30"
    );
  });

  it("shows the efforts saved with the run, worked out from the full trace", () => {
    // The kept track alone would say 4:30; the saved figure is the finish
    // screen's, from every fix.
    h.run = savedRun({
      bestEfforts: [{ distance: 1000, time: 262, label: "1K" }],
    });
    renderDetail();
    const card = screen.getByRole("region", { name: "Best efforts" });
    expect(within(card).getByText("1K").nextElementSibling?.textContent).toBe(
      "4:22"
    );
  });

  it("does not search a thinned track for a run saved before efforts were kept", () => {
    /* 500 kept points of a longer run: a stretch can only start and end
       on one, so its times read slow. A slow figure under "Best efforts"
       is worse than none. */
    h.run = savedRun({ points: track(500, 30) });
    renderDetail();
    // POSITIVE anchor: the saved run rendered, splits and all.
    expect(screen.getByRole("region", { name: "Splits" })).toBeVisible();
    expect(screen.queryByText("Best efforts")).toBeNull();
  });

  it("has none for a run with no track", () => {
    h.run = savedRun({ points: [], splits: [] });
    renderDetail();
    // POSITIVE anchor: the saved run rendered.
    expect(screen.getByText("Average pace")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Best efforts" })).toBeNull();
    expect(screen.queryByText("Best efforts")).toBeNull();
  });

  it("has none for a run saved despite invalid figures", () => {
    h.run = savedRun({ isInvalid: true, invalidReason: "too-short" });
    renderDetail();
    // POSITIVE anchor: the page says why the run is set apart.
    expect(screen.getByText("Saved despite invalid metrics")).toBeVisible();
    expect(screen.queryByText("Best efforts")).toBeNull();
  });
});

describe("RunDetail — what the runner said", () => {
  it("shows how it felt and the notes when the run has them", () => {
    h.run = savedRun({
      relativeEffort: "harder",
      notes: "Legs heavy on the hill.\nHeld the pace anyway.",
    });
    renderDetail();
    expect(screen.getByText("How it felt")).toBeVisible();
    expect(screen.getByText("Harder than expected")).toBeVisible();
    expect(screen.getByText("Notes")).toBeVisible();
    expect(screen.getByText(/^Legs heavy on the hill\./).textContent).toBe(
      "Legs heavy on the hill.\nHeld the pace anyway."
    );
  });

  it("says nothing when the runner said nothing", () => {
    h.run = savedRun({ notes: "   ", relativeEffort: null });
    renderDetail();
    // POSITIVE anchor: the rest of the page is there.
    expect(screen.getByRole("region", { name: "Best efforts" })).toBeVisible();
    expect(screen.queryByText("How it felt")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
  });

  it("shows the effort alone, and reads a stored value it does not know as none", () => {
    h.run = savedRun({ relativeEffort: "matched" });
    renderDetail();
    expect(screen.getByText("About right")).toBeVisible();
    expect(screen.queryByText("Notes")).toBeNull();
    cleanup();

    h.run = savedRun({ relativeEffort: "constructor", notes: "Windy." });
    renderDetail();
    expect(screen.getByText("Windy.")).toBeVisible();
    expect(screen.queryByText("How it felt")).toBeNull();
  });
});

describe("RunDetail — splits and the route key", () => {
  it("shows the splits as the one table, not a chart", () => {
    h.run = savedRun();
    renderDetail();
    const table = screen.getByRole("table", { name: "Splits" });
    expect(within(table).getByText("4:30")).toBeVisible();
    expect(screen.getAllByRole("table")).toHaveLength(1);
  });

  it("keys the pace-coloured route, and draws a plain one with no average", () => {
    h.run = savedRun();
    renderDetail();
    expect(screen.getByRole("img", { name: /^Route pace/ })).toBeVisible();
    expect(h.mapProps.at(-1)?.paceColored).toBe(true);
    cleanup();

    // No time recorded: no average pace to colour the route against.
    h.run = savedRun({ duration: 0 });
    renderDetail();
    expect(screen.getByText("Average pace")).toBeVisible();
    expect(h.mapProps.at(-1)?.paceColored).toBe(false);
    expect(screen.queryByRole("img", { name: /^Route pace/ })).toBeNull();
  });
});

/* Pgm8: a treadmill run keeps its session's type, with the treadmill as
   where it was run. Its page says so, as it does for one saved before, so
   no treadmill run reads as an outdoor run. */
describe("RunDetail — a treadmill run says so", () => {
  /** A run typed in on the treadmill: no track, no splits, 6 km. */
  function onTreadmill(extra: Record<string, unknown>) {
    return savedRun({
      points: [],
      splits: [],
      distance: 6000,
      duration: 2160,
      ...extra,
    });
  }

  it("titles a planned long run done there with its type and the treadmill", () => {
    h.run = onTreadmill({ activityType: "long", place: "treadmill" });
    renderDetail();
    expect(screen.getByText("Long run · Treadmill")).toBeInTheDocument();
    expect(screen.getByText("Splits · No GPS route")).toBeInTheDocument();
  });

  it("titles one saved before Pgm8, under the old treadmill type, Treadmill", () => {
    h.run = onTreadmill({ activityType: "treadmill" });
    renderDetail();
    expect(screen.getByText("Treadmill")).toBeInTheDocument();
  });

  it("titles the same long run outdoors by its type alone", () => {
    h.run = savedRun({ activityType: "long", place: null });
    renderDetail();
    expect(screen.getByText("Long run")).toBeInTheDocument();
    expect(screen.queryByText(/Treadmill/)).toBeNull();
  });
});

describe("RunDetail — the route replay", () => {
  it("leaves no timer behind when the page closes as a replay ends", async () => {
    h.run = savedRun();
    vi.useFakeTimers();
    const pending = new Set<unknown>();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const setSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number
    ) => {
      const id = realSet(() => {
        pending.delete(id);
        fn();
      }, ms);
      if (ms === 600) pending.add(id);
      return id;
    }) as typeof setTimeout);
    const clearSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(((
      id: unknown
    ) => {
      pending.delete(id);
      realClear(id as ReturnType<typeof setTimeout>);
    }) as typeof clearTimeout);
    try {
      const { unmount } = renderDetail();
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /Replay/ }));
      });
      // Thirteen fixes, one a frame: the replay reaches its end and the
      // button's short wait before it resets begins.
      act(() => {
        vi.advanceTimersByTime(13 * 50);
      });
      expect(pending.size).toBe(1);
      unmount();
      expect(pending.size).toBe(0);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
      await restoreRealTimers();
    }
  });
});

/* The basemap draws the theme on screen. The profile here says light
   (`darkMode: false`) while the page renders dark, which is what a capture
   of the dark theme does, and what any other writer of the `dark` class
   would do: read from the profile, the map drew the light basemap inside a
   dark page. */
describe("RunDetail — the map follows the theme on screen", () => {
  afterEach(() => document.documentElement.classList.remove("dark"));

  it("draws the dark basemap in a dark page whatever the profile says", () => {
    document.documentElement.classList.add("dark");
    h.run = savedRun();
    renderDetail();
    expect(h.mapProps.at(-1)?.darkMode).toBe(true);
  });

  it("follows the theme when it flips", async () => {
    h.run = savedRun();
    renderDetail();
    expect(h.mapProps.at(-1)?.darkMode).toBe(false);
    await act(async () => {
      document.documentElement.classList.add("dark");
      // The class is watched by a MutationObserver, which reports in a
      // microtask.
      await Promise.resolve();
    });
    expect(h.mapProps.at(-1)?.darkMode).toBe(true);
  });
});
