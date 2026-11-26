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
import { runTitle } from "@/lib/runLabels";
import type { PlacedRun } from "@/lib/runPlacings";
import { isPaceEligible } from "@/lib/runStatsEligibility";

const h = vi.hoisted(() => ({
  run: null as Record<string, unknown> | null,
  mapProps: [] as Record<string, unknown>[],
  segmentRows: [] as unknown[],
  placings: [] as unknown[],
  placingCalls: [] as unknown[][],
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "runner" },
    profile: { displayName: "Runner", darkMode: false },
  }),
  useUid: () => "runner",
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
vi.mock("@/hooks/useShoes", () => ({
  useShoes: () => ({
    shoes: [],
    activeShoes: [],
    defaultShoe: null,
    loading: false,
  }),
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
// Run26 call 3: the run's segment efforts, read from the server in their
// own hook (useRunSegmentEfforts.test.ts); the page only draws them.
vi.mock("@/hooks/useRunSegmentEfforts", () => ({
  useRunSegmentEfforts: () => ({
    loading: false,
    failed: false,
    rows: h.segmentRows,
  }),
}));
// Run29: the run's top three, from a read of every saved run in its own
// hook (useRunPlacings.test.ts); the page hands it the run and draws them.
vi.mock("@/hooks/useRunPlacings", () => ({
  useRunPlacings: (...args: unknown[]) => {
    h.placingCalls.push(args);
    return h.placings;
  },
}));
const renameRun = vi.hoisted(() => vi.fn());
vi.mock("@/lib/runRename", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/runRename")>()),
  renameRun,
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
  h.segmentRows = [];
  h.placings = [];
  h.placingCalls.length = 0;
});
afterEach(() => cleanup());

describe("RunDetail — recorded day", () => {
  it("shows the original run day when saving happened later", () => {
    h.run = savedRun({ date: "2026-09-20" });
    renderDetail();
    expect(screen.getByText(/20 September 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/3 October 2026/)).toBeNull();
  });
});

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

  it("marks an effort that placed among the runs before it (Run29)", () => {
    h.run = savedRun({
      bestEfforts: [{ distance: 1000, time: 262, label: "1K" }],
    });
    h.placings = [{ meters: 1000, seconds: 262, place: 3, bestSeconds: 248 }];
    renderDetail();
    const card = screen.getByRole("region", { name: "Best efforts" });
    expect(within(card).getByText("Your 3rd best")).toBeVisible();
    // The hook ranks the time the card shows, for this account and run.
    const [uid, run] = h.placingCalls.at(-1) as [
      string,
      { id: string; bestEfforts: { distance: number; time: number }[] },
    ];
    expect(uid).toBe("runner");
    expect(run.id).toBe("run-1");
    expect(run.bestEfforts).toEqual([
      { distance: 1000, time: 262, label: "1K" },
    ]);
  });

  it("hands the hook a legacy run as ranking and Bests read it (Run29)", () => {
    /* No activityType: the saved-run reader reads it as a free run, so
       it ranks other runs and sits on Bests; its own page places it by
       the same rule, ordered by when it started. */
    const started = new Date(2026, 9, 3, 8, 0);
    h.run = savedRun({
      activityType: undefined,
      avgPace: 277,
      startedAt: { toDate: () => started },
      bestEfforts: [{ distance: 1000, time: 262, label: "1K" }],
    });
    renderDetail();
    // POSITIVE anchor: the saved run rendered.
    expect(screen.getByRole("region", { name: "Best efforts" })).toBeVisible();
    const [, run] = h.placingCalls.at(-1) as [string, PlacedRun];
    expect(run.activityType).toBe("freerun");
    expect(run.startedAt).toEqual(started);
    expect(isPaceEligible(run)).toBe(true);
  });

  it("does not list a 1K timed across a step faster than any runner (1 Nov)", () => {
    /* Saved before #3036, the finish timed "1K 4:29" across the catch-up
       a gap in the fixes made. The kept trace still has the step (445 m
       more in 30 s), so the saved figure is not believed, and with the
       step refused no 1K is left in the trace. */
    const points = track(13, 30).map((p, i) =>
      i >= 7 ? { ...p, lat: p.lat + 0.004, rawLat: p.rawLat + 0.004 } : p
    );
    h.run = savedRun({
      points,
      distance: totalDistance(points),
      bestEfforts: [{ distance: 1000, time: 269, label: "1K" }],
    });
    renderDetail();
    // POSITIVE anchor: the saved run rendered, splits and all.
    expect(screen.getByRole("region", { name: "Splits" })).toBeVisible();
    expect(screen.queryByText("4:29")).toBeNull();
    expect(screen.queryByRole("region", { name: "Best efforts" })).toBeNull();
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

describe("RunDetail — grade-adjusted pace", () => {
  /* Owner, 1 Nov 2026: "Grade-adjusted pace 8:44 /km — flat-equivalent
     for this climb". A statement and its explanation joined by a dash is
     the rhythm the house voice retires (DESIGN_GUIDE §3g); the dash was
     never a genuine aside here. */
  it("says what the pace is in one sentence, with no dash", () => {
    h.run = savedRun({ elevationGain: 60 });
    renderDetail();
    const line = screen.getByText(/^Grade-adjusted pace/);
    expect(line.textContent).toMatch(
      /^Grade-adjusted pace \d+:\d{2} \/km: the flat-ground equivalent of this climb$/
    );
    expect(line.textContent).not.toContain("\u2014");
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

/* Mob2 call 1: a saved run can be renamed on its page. The page heads
   with the name the run was saved and posted under. */
describe("RunDetail — the run's name", () => {
  beforeEach(() => {
    renameRun.mockReset();
  });

  it("heads the page with the run's name", () => {
    h.run = savedRun({ name: "Parkrun with Sam" });
    renderDetail();
    expect(screen.getByText("Parkrun with Sam")).toBeVisible();
  });

  it("reads a run saved before runs were named as its type", () => {
    h.run = savedRun({ activityType: "tempo" });
    renderDetail();
    expect(screen.getByText(runTitle({ activityType: "tempo" }))).toBeVisible();
  });

  it("says a named treadmill run was on the treadmill", () => {
    h.run = savedRun({ name: "Morning run", place: "treadmill" });
    renderDetail();
    expect(screen.getByText(/· Treadmill$/)).toBeVisible();
  });

  it("renames the run from a sheet, and heads the page with the new name", async () => {
    renameRun.mockImplementation(
      async (_uid: string, _id: string, typed: string) => typed.trim()
    );
    h.run = savedRun({ name: "Morning run" });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Rename run" }));
    const field = await screen.findByRole("textbox", { name: "Run name" });
    expect(field).toHaveValue("Morning run");
    // Save waits for a name that differs from the run's.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(field, { target: { value: " Hill reps " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(renameRun).toHaveBeenCalledTimes(1);
    expect(renameRun).toHaveBeenCalledWith("runner", "run-1", " Hill reps ");
    expect(await screen.findByText("Hill reps")).toBeVisible();
  });

  it("says a shared run's post takes the new name", async () => {
    h.run = savedRun({ name: "Morning run", sharedActivityId: "post-1" });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Rename run" }));
    expect(
      await screen.findByText("Your post takes the new name too.")
    ).toBeVisible();
  });
});

describe("RunDetail — a goal race against its prediction", () => {
  const record = (predictions: unknown[]) => ({
    v: 1,
    distance: "5k",
    targetDate: "2026-10-03",
    entry: "race",
    goalTimeS: null,
    predictions,
  });
  const prediction = {
    at: "2026-09-26T08:00:00.000Z",
    reason: "race-week",
    predictedS: 340,
    vdot: 40,
    source: "race",
    weeksDone: 5,
    planWeeks: 6,
    daysToRace: 7,
  };

  it("shows what the finish screen showed, from the saved run", () => {
    h.run = savedRun({ racePrediction: record([prediction]) });
    renderDetail();
    expect(screen.getByText(/Tropos predicted/)).toHaveTextContent(
      "Tropos predicted 5:40. You ran 6:00, 0:20 slower."
    );
  });

  it("compares the race on its elapsed time, not its moving time (Run28 call 4)", () => {
    // 6:00 moving; 7:10 from the clock's start to the finish.
    const startMs = Date.UTC(2026, 9, 3, 8, 0, 0);
    h.run = savedRun({
      racePrediction: record([prediction]),
      recordingStartedAt: { toMillis: () => startMs },
      recordingEndedAt: { toMillis: () => startMs + 430_000 },
    });
    renderDetail();
    expect(screen.getByText(/Tropos predicted/)).toHaveTextContent(
      "Tropos predicted 5:40. You ran 7:10, 1:30 slower."
    );
  });

  it("says nothing for a goal race with no prediction, or any other run", () => {
    h.run = savedRun({ racePrediction: record([]) });
    renderDetail();
    // POSITIVE anchor: the rest of the page is there.
    expect(screen.getByRole("region", { name: "Best efforts" })).toBeVisible();
    expect(screen.queryByText(/Tropos predicted/)).toBeNull();
  });
});

describe("RunDetail — elapsed time beside moving time (Run28 call 2)", () => {
  const startMs = Date.UTC(2026, 9, 3, 8, 0, 0);
  /** The saved run (6:00 moving), stamped `wallS` seconds start to finish. */
  const stamped = (wallS: number) =>
    savedRun({
      recordingStartedAt: { toMillis: () => startMs },
      recordingEndedAt: { toMillis: () => startMs + wallS * 1000 },
    });

  it("shows the elapsed time when it is a minute or more over the moving time", () => {
    h.run = stamped(360 + 60);
    renderDetail();
    expect(
      screen.getByText("Moving time").nextElementSibling
    ).toHaveTextContent("6:00");
    expect(screen.getByText(/Elapsed time/)).toHaveTextContent(
      "Elapsed time 7:00"
    );
    expect(screen.queryByText("Time")).toBeNull();
  });

  it("stays one figure under a minute apart, or without both stamps", () => {
    for (const run of [stamped(360 + 59), savedRun()]) {
      h.run = run;
      renderDetail();
      expect(screen.getByText("Time").nextElementSibling).toHaveTextContent(
        "6:00"
      );
      expect(screen.queryByText(/Elapsed time/)).toBeNull();
      expect(screen.queryByText("Moving time")).toBeNull();
      cleanup();
    }
  });
});

describe("RunDetail — segments (Run26 call 3)", () => {
  const lastMap = () => h.mapProps[h.mapProps.length - 1];

  it("lists the segments the run was timed on, with its place among your own", async () => {
    h.run = savedRun();
    h.segmentRows = [
      {
        effort: {
          id: "run-1_hill_1",
          segmentId: "hill",
          runId: "run-1",
          lap: 1,
          elapsedSeconds: 251,
          startedAtMs: 1,
          day: "2026-10-03",
        },
        segment: {
          id: "hill",
          name: "Common hill",
          lengthMeters: 800,
          points: [],
        },
        rank: 2,
        of: 5,
      },
    ];
    renderDetail();
    const card = await screen.findByRole("region", { name: "Segments" });
    const row = within(card).getByRole("link", { name: /Common hill/ });
    expect(row).toHaveAttribute("href", "/segment/hill");
    expect(row).toHaveTextContent("800 m");
    expect(row).toHaveTextContent("4:11");
    expect(row).toHaveTextContent("Your 2nd best");
  });

  it("opens the maker under the map, which draws the stretch and moves its nearer end to a tap", async () => {
    h.run = savedRun();
    renderDetail();
    expect(lastMap().highlight).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Make a segment" }));
    const maker = await screen.findByRole("region", { name: "Make a segment" });
    // Points 111 m apart: the first past 1,000 m is the ninth (1,001 m).
    expect(lastMap().highlight).toEqual({ from: 0, to: 9 });
    expect(maker).toHaveTextContent("Length 1.0 km");

    const points = (h.run as { points: GPSPoint[] }).points;
    const tap = (i: number) =>
      act(() => {
        (lastMap().onMapTap as (at: { lat: number; lon: number }) => void)({
          lat: points[i].lat,
          lon: points[i].lon,
        });
      });
    tap(6); // nearer the end
    expect(lastMap().highlight).toEqual({ from: 0, to: 6 });
    tap(3); // as near both: the start moves
    expect(lastMap().highlight).toEqual({ from: 3, to: 6 });
    expect(
      within(maker).getByText("A segment needs to be at least 400 m.")
    ).toBeVisible();
    expect(
      within(maker).getByRole("button", { name: "Save segment" })
    ).toBeDisabled();

    fireEvent.click(within(maker).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Make a segment" })).toBeNull();
    expect(lastMap().highlight).toBeNull();
  });

  it("offers no segment from a treadmill run or one saved despite invalid figures", () => {
    h.run = savedRun({ place: "treadmill" });
    const { unmount } = renderDetail();
    // POSITIVE anchor: the page drew.
    expect(screen.getByRole("region", { name: "Best efforts" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Make a segment" })).toBeNull();
    unmount();
    h.run = savedRun({ isInvalid: true });
    renderDetail();
    expect(screen.getByText("Saved despite invalid metrics")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Make a segment" })).toBeNull();
  });
});
