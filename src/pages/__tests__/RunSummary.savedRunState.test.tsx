/**
 * RunSummary state that belongs to one saved run, opened on its receipt.
 *
 * 1. The off-plan prompt's dismissal is stored per saved run. It is read
 *    while rendering, once per run id, so a run already decided never
 *    paints the prompt; the read used to be an effect, which let the
 *    first commit show the prompt and then hid it.
 * 2. The pace insight's loading flag is derived from the inputs the
 *    history was read for (account, run, corrected distance). When they
 *    change, the insight reads as loading from that render until the new
 *    read settles; the flag used to go up one commit late.
 *
 * 3. Save queues the run under one id before any server write, and a
 *    Retry after a later step failed resumes against that id, so the run
 *    is saved once (`completeRun`).
 *
 * The mocked `useProgram` runs at the top of every render, so it records
 * what the previous commit left in the DOM — that is how a commit that
 * showed something for one frame is caught. Firestore runs on the one
 * fake (ADR-0009); the page's heavy children are stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RUN } from "@/test/journeyScreens";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "runner" } },
}));

const h = vi.hoisted(() => ({
  auth: { user: { uid: "runner" }, profile: { displayName: "Runner" } },
  domAtRender: [] as string[],
  paceLoading: [] as boolean[],
  paceEnabled: [] as boolean[],
  paceRuns: [] as { id?: string }[],
  markManualComplete: vi.fn(),
  skipRunDay: vi.fn(),
  track: vi.fn(),
  mapProps: [] as Record<string, unknown>[],
  runPlan: undefined as { currentWeek: number; totalWeeks: number } | undefined,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => h.auth,
  useUid: () => h.auth.user.uid,
  useUidForStorageKey: () => h.auth.user.uid,
}));
vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => {
    h.domAtRender.push(document.body.textContent ?? "");
    return {
      markManualComplete: h.markManualComplete,
      skipRunDay: h.skipRunDay,
      programState: {
        runDays: [{ id: "rd-1", status: "planned" }],
        runPlan: h.runPlan,
      },
    };
  },
}));
vi.mock("@/hooks/usePaceInsight", () => ({
  usePaceInsightFromRuns: (
    runs: { id?: string }[],
    opts: { loading?: boolean; enabled?: boolean }
  ) => {
    h.paceLoading.push(opts.loading ?? false);
    h.paceEnabled.push(opts.enabled ?? true);
    h.paceRuns = runs;
    return { insight: null, accept: vi.fn(), dismiss: vi.fn() };
  },
}));
vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km" as const,
}));
vi.mock("@/hooks/usePrivacyZones", () => ({
  usePrivacyZones: () => ({ zones: [], loading: false, error: null }),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));
vi.mock("@/hooks/useShoes", () => ({
  useShoes: () => ({ updateMileage: vi.fn(), defaultShoe: null }),
}));
const week = vi.hoisted(() => ({
  pulse: null as null | {
    lifts: null;
    runs: { count: number; km: number; planned: number | null };
    streak: null;
  },
}));
vi.mock("@/hooks/useWeekPulse", () => ({ useWeekPulse: () => week.pulse }));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: h.track }));
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
vi.mock("@/components/social/CircleShareSheet", () => ({
  default: () => null,
}));
vi.mock("@/components/workout/CompletionExtras", () => ({
  default: () => null,
}));
vi.mock("@/components/run/PaceInsightCard", () => ({ default: () => null }));
vi.mock("@/components/WeekPulseView", () => ({ default: () => null }));
vi.mock("@/components/social/SavedRunKudos", () => ({ default: () => null }));

import RunSummary from "../RunSummary";
import { benchmarkEffortOf, type EffortRun } from "@/lib/benchmarkEfforts";
import { writeString } from "@/lib/localStore";
import { pendingDocumentWrites } from "@/lib/offlineQueue";
import {
  deferReads,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";
import { Timestamp } from "firebase/firestore";

/** A valid outdoor run, already saved (the receipt), that didn't match
 *  today's planned tempo — the shape that raises the off-plan prompt. */
function savedRun(notes = "") {
  return {
    savedRun: {
      uid: "runner",
      id: "run-1",
      notes,
      relativeEffort: null,
    },
    points: [],
    distance: 5000,
    elapsed: 1500,
    splits: [],
    elevationGain: 0,
    runConfig: {
      activityType: "freerun",
      planMetadata: {
        planMode: "structured",
        planSource: "today_plan",
        plannedRunDayIndex: 2,
        plannedTemplateId: "tempo_run",
        plannedTemplateType: "tempo",
        actualTemplateId: null,
        matchedPlanExact: false,
        matchedPlanType: false,
        offPlan: true,
        planWeekIndex: null,
        planTotalWeeks: null,
        scheduledRunId: "rd-1",
      },
    },
  };
}

function renderSummary() {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: "/run-summary", state: savedRun() }]}
    >
      <Routes>
        <Route path="/run-summary" element={<RunSummary />} />
      </Routes>
      {/* A same-run receipt with edited notes — what RunSummary's own
          notes update replaces the location state with. */}
      <Link to="/run-summary" state={savedRun("Felt strong")}>
        Replace receipt
      </Link>
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  week.pulse = null;
  h.domAtRender.length = 0;
  h.paceLoading.length = 0;
  h.markManualComplete.mockReset();
  h.markManualComplete.mockResolvedValue({ status: "applied" });
  h.skipRunDay.mockReset();
  h.skipRunDay.mockResolvedValue({ status: "applied" });
});
afterEach(() => {
  resumeReads();
  releaseAllReads();
  cleanup();
});

describe("RunSummary — the off-plan prompt's stored dismissal", () => {
  it("an undecided run shows the prompt (the fixture reaches it)", async () => {
    renderSummary();
    expect(await screen.findByText("Off-plan save")).toBeInTheDocument();
  });

  it("a run already dismissed never paints the prompt, not even for one commit", async () => {
    writeString("tropos:reconcileDismissed:run-1", "1");
    renderSummary();
    // POSITIVE anchor: the saved summary is on screen.
    expect(await screen.findByText("Run saved")).toBeInTheDocument();

    expect(screen.queryByText("Off-plan save")).toBeNull();
    expect(
      h.domAtRender.filter((dom) => dom.includes("Off-plan save"))
    ).toEqual([]);
  });
});

describe("RunSummary — the off-plan prompt says only what happened", () => {
  it("marks the planned run complete when the writer did", async () => {
    renderSummary();
    // The E2E journeys answer by this (src/test/journeyScreens.ts).
    fireEvent.click(
      await screen.findByRole("button", { name: RUN.markPlannedDone })
    );
    expect(
      await screen.findByText("Scheduled run marked complete.")
    ).toBeInTheDocument();
    expect(h.markManualComplete).toHaveBeenCalledWith("rd-1");
  });

  it("a refused completion keeps the prompt and claims nothing", async () => {
    // A race is completed by logging it, so the writer refuses and says so.
    // The card used to report "Scheduled run marked complete." regardless.
    h.markManualComplete.mockResolvedValue({
      status: "declined",
      reason: "A race is complete once you log it as a run.",
    });
    renderSummary();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark scheduled run complete" })
    );
    await waitFor(() => expect(h.markManualComplete).toHaveBeenCalled());
    // POSITIVE anchor: the prompt is still there, its buttons usable again.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Mark scheduled run complete" })
      ).toBeEnabled()
    );
    expect(screen.getByText("Off-plan save")).toBeInTheDocument();
    expect(screen.queryByText("Scheduled run marked complete.")).toBeNull();
  });

  it("a refused skip keeps the prompt and claims nothing", async () => {
    h.skipRunDay.mockResolvedValue({ status: "declined", reason: null });
    renderSummary();
    fireEvent.click(
      await screen.findByRole("button", { name: "Skip scheduled run" })
    );
    await waitFor(() => expect(h.skipRunDay).toHaveBeenCalledWith("rd-1"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Skip scheduled run" })
      ).toBeEnabled()
    );
    expect(screen.getByText("Off-plan save")).toBeInTheDocument();
    expect(screen.queryByText("Scheduled run skipped.")).toBeNull();
  });
});

describe("RunSummary — pace history loading follows its inputs", () => {
  it("reads as loading from the render the run changes until the new read settles", async () => {
    renderSummary();
    // POSITIVE anchor: the first history read settled.
    await waitFor(() => expect(h.paceLoading.at(-1)).toBe(false));

    // Hold the next read, then replace the receipt.
    deferReads();
    const from = h.paceLoading.length;
    fireEvent.click(screen.getByRole("link", { name: "Replace receipt" }));

    const afterChange = h.paceLoading.slice(from);
    expect(afterChange.length).toBeGreaterThan(0);
    expect(afterChange.every((loading) => loading)).toBe(true);

    // Then settled again, once the new read lands.
    resumeReads();
    releaseAllReads();
    await waitFor(() => expect(h.paceLoading.at(-1)).toBe(false));
  });
});

describe("RunSummary — the week's runs are counted once", () => {
  afterEach(() => {
    h.runPlan = undefined;
    delete (h.auth.profile as Record<string, unknown>).runMode;
  });

  it("leaves the week's runs to the card, with no second count", async () => {
    week.pulse = {
      lifts: null,
      runs: { count: 2, km: 9.5, planned: 3 },
      streak: null,
    };
    renderSummary();
    expect(await screen.findByText("Run saved")).toBeInTheDocument();
    expect(screen.queryByText("runs this week")).toBeNull();
    expect(screen.queryByText(/2\s*of\s*3/)).toBeNull();
  });

  it("names a race plan's week", async () => {
    (h.auth.profile as Record<string, unknown>).runMode = "race_prep";
    h.runPlan = { currentWeek: 2, totalWeeks: 12 };
    week.pulse = {
      lifts: null,
      runs: { count: 2, km: 9.5, planned: 3 },
      streak: null,
    };
    renderSummary();
    expect(await screen.findByText("Week 3 of 12")).toBeInTheDocument();
    expect(screen.queryByText("runs this week")).toBeNull();
  });
});

describe("RunSummary — Save", () => {
  /** The same run, finished and not yet saved: no receipt. */
  function renderUnsaved() {
    const { savedRun: _receipt, ...run } = savedRun();
    return render(
      <MemoryRouter initialEntries={[{ pathname: "/run-summary", state: run }]}>
        <Routes>
          <Route path="/run-summary" element={<RunSummary />} />
        </Routes>
      </MemoryRouter>
    );
  }
  const queued = () => pendingDocumentWrites("runner", "users/runner/runs");

  let online: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    h.track.mockReset();
    // Offline, the run waits in the queue, where the test can read it.
    online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  });
  afterEach(() => online.mockRestore());

  it("queues the run, then shows it saved", async () => {
    renderUnsaved();
    expect(
      await screen.findByRole("heading", { name: "Nice run", level: 1 })
    ).toBeInTheDocument();
    // The E2E journeys save and leave by these (src/test/journeyScreens.ts).
    fireEvent.click(await screen.findByRole("button", { name: RUN.save }));
    expect(
      await screen.findByRole("button", { name: RUN.done })
    ).toBeInTheDocument();
    expect(queued()).toHaveLength(1);
    expect(queued()[0].data).toMatchObject({
      distance: 5000,
      duration: 1500,
      isInvalid: false,
      scheduledRunId: "rd-1",
    });
    expect(h.track).toHaveBeenCalledWith("run_completed");
    expect(
      screen.getByText("Saved on this phone · waiting to sync")
    ).toBeInTheDocument();
  });

  it("saves the run once when a Retry follows a later step's failure", async () => {
    // The run is queued, then the step after it throws.
    h.track.mockImplementationOnce(() => {
      throw new Error("analytics down");
    });
    renderUnsaved();
    fireEvent.click(await screen.findByRole("button", { name: "Save run" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: "Done" })
    ).toBeInTheDocument();
    expect(queued()).toHaveLength(1);
    // The first run's event fired with the first save, and only then.
    expect(h.track).toHaveBeenCalledTimes(1);
    // The page holds the queued run's id, so it knows the run is waiting.
    expect(
      screen.getByText("Saved on this phone · waiting to sync")
    ).toBeInTheDocument();
  });
});

describe("RunSummary — splits, best efforts and the route key", () => {
  /** `n` fixes stepping ~111 m north every `dtSec` seconds. */
  function track(n: number, dtSec: number) {
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
  function lap(km: number, paceSeconds: number) {
    return {
      km,
      time: paceSeconds,
      pace: "",
      paceSeconds,
      elevationGain: 0,
      elevationLoss: 0,
    };
  }
  /** A finished run, not yet saved, with the laps it recorded. */
  function renderFinished(run: Record<string, unknown>) {
    return render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/run-summary",
            state: {
              elevationGain: 0,
              runConfig: { activityType: "freerun" },
              ...run,
            },
          },
        ]}
      >
        <Routes>
          <Route path="/run-summary" element={<RunSummary />} />
        </Routes>
      </MemoryRouter>
    );
  }
  beforeEach(() => {
    h.mapProps.length = 0;
  });

  it("shows the splits once, as one table, with the unit spaced", async () => {
    renderFinished({
      points: [],
      distance: 3200,
      elapsed: 1150,
      splits: [lap(1, 372), lap(2, 364), lap(3, 352)],
    });
    const table = await screen.findByRole("table", { name: "Splits" });
    expect(screen.getAllByRole("table")).toHaveLength(1);
    const [, body] = within(table).getAllByRole("rowgroup");
    const rows = within(body)
      .getAllByRole("row")
      .map((row) =>
        Array.from(row.children)
          .map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim())
          .join(" ")
      );
    expect(rows).toEqual(["1 6:12 /km", "2 6:04 /km", "3, fastest 5:52 /km"]);
    // The second, loose list of the same laps is gone: its "km 1" rows
    // and its "Average" footer.
    expect(screen.queryByText(/^km 1$/)).toBeNull();
    expect(screen.queryByText("Average")).toBeNull();
  });

  it("counts the distance up to the run's, as a lift's finish counts its figures", async () => {
    renderFinished({
      points: [],
      distance: 3200,
      elapsed: 1150,
      splits: [lap(1, 372), lap(2, 364), lap(3, 352)],
    });
    // Every figure it shows from the first paint, however fast the machine.
    const figure = document.querySelector(".text-display") as HTMLElement;
    expect(figure).not.toBeNull();
    const shown = [figure.textContent ?? ""];
    const observer = new MutationObserver(() =>
      shown.push(figure.textContent ?? "")
    );
    observer.observe(figure, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    await waitFor(() => expect(figure.textContent).toMatch(/^3\.20\s*km$/));
    observer.disconnect();
    const values = shown.map((text) => Number.parseFloat(text));
    expect(Math.min(...values)).toBeLessThan(3.2);
  });

  it("lists best efforts from the track and keys the pace-coloured route", async () => {
    const points = track(13, 30);
    renderFinished({
      points,
      distance: 1334,
      elapsed: 360,
      splits: [lap(1, 270)],
    });
    const efforts = await screen.findByRole("region", { name: "Best efforts" });
    expect(
      within(efforts).getByText("1K").nextElementSibling?.textContent
    ).toBe("4:30");
    expect(screen.getByRole("img", { name: /^Route pace/ })).toBeVisible();
    expect(h.mapProps.at(-1)?.paceColored).toBe(true);
  });
});

/* Run20 (5): a run-walk is run by feel. Its average mixes runs and walks,
   so no pace can judge it; an easy run that ran hot still hears so. */
describe("RunSummary — the pace verdict leaves a run-walk alone", () => {
  const auth = h.auth as { profile: Record<string, unknown> };
  const profile = auth.profile;
  afterEach(() => {
    auth.profile = profile;
  });

  function renderPlanned(
    templateId: string,
    run: {
      activityType?: string;
      segments?: Record<string, unknown>[];
      workPortion?: { seconds: number; meters: number };
    } = {}
  ) {
    const activityType = run.activityType ?? "easy";
    const state = {
      ...savedRun(),
      ...(run.workPortion ? { workPortion: run.workPortion } : {}),
      runConfig: {
        activityType,
        ...(run.segments ? { segments: run.segments } : {}),
        planMetadata: {
          planMode: "race_prep",
          planSource: "today_plan",
          plannedRunDayIndex: 2,
          plannedTemplateId: templateId,
          plannedTemplateType: activityType,
          actualTemplateId: templateId,
          matchedPlanExact: true,
          matchedPlanType: true,
          offPlan: false,
          planWeekIndex: 0,
          planTotalWeeks: 10,
          scheduledRunId: "rd-1",
        },
      },
    };
    return render(
      <MemoryRouter initialEntries={[{ pathname: "/run-summary", state }]}>
        <Routes>
          <Route path="/run-summary" element={<RunSummary />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("judges a planned easy run on pace, and a run-walk on nothing", async () => {
    auth.profile = {
      displayName: "Runner",
      runFitness: {
        benchmark: { distanceM: 5000, timeS: 25 * 60 },
        vdot: 38.3,
      },
    };
    // 5 km in 25 minutes: 5:00 /km, quicker than a 25-minute 5K's easy.
    const easy = renderPlanned("easy_30");
    // The E2E journeys read a planned run's summary by its heading
    // (src/test/journeyScreens.ts).
    expect(
      await screen.findByRole("heading", {
        name: RUN.summary("Easy 30"),
        level: 1,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Faster than easy today: 5:00 \/km/)
    ).toBeInTheDocument();
    easy.unmount();

    renderPlanned("run_walk_1");
    expect(
      await screen.findByText("Run-walk 1 complete ✓")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/on target|Faster than|Slower than|Quicker than/)
    ).toBeNull();
  });

  /* Pgm8 R1: Pace Insight reads efforts only. The summary hands over the
     run it just saved with what decides that: its type, and a tempo's
     work, the part a benchmark comes from. */
  it("hands Pace Insight a run-walk as the easy run it is, so it sets no benchmark", async () => {
    renderPlanned("run_walk_1");
    expect(
      await screen.findByText("Run-walk 1 complete ✓")
    ).toBeInTheDocument();
    const handed = h.paceRuns.find((r) => r.id === "run-1") as EffortRun;
    expect(handed).toMatchObject({ activityType: "easy" });
    expect(benchmarkEffortOf(handed)).toBeNull();
  });

  it("does not judge manually entered distance against a planned run's pace", async () => {
    auth.profile = {
      displayName: "Runner",
      runFitness: {
        benchmark: { distanceM: 5000, timeS: 25 * 60 },
        vdot: 38.3,
      },
    };
    renderPlanned("easy_30", { activityType: "manual" });
    expect(await screen.findByText("Easy 30 complete ✓")).toBeVisible();
    expect(
      screen.queryByText(/on target|Faster than|Slower than|Quicker than/)
    ).toBeNull();
    expect(
      benchmarkEffortOf(h.paceRuns.find((r) => r.id === "run-1") as EffortRun)
    ).toBeNull();
  });

  it("hands Pace Insight a tempo with its work, which a benchmark comes from", async () => {
    const block = (pinned: boolean) => [
      { type: "warmup", target: { kind: "duration", seconds: 300 } },
      {
        type: "moderate",
        target: { kind: "duration", seconds: 1200 },
        ...(pinned ? { paceTarget: 300, pacePinned: true } : {}),
      },
      { type: "cooldown", target: { kind: "duration", seconds: 300 } },
    ];
    const workPortion = { seconds: 1200, meters: 4000 };
    const tempo = renderPlanned("tempo_20", {
      activityType: "tempo",
      segments: block(false),
      workPortion,
    });
    expect(await screen.findByText("20 Min Tempo complete ✓")).toBeVisible();
    const handed = h.paceRuns.find((r) => r.id === "run-1") as EffortRun;
    expect(handed).toMatchObject({ workPortion, workPacePinned: false });
    expect(benchmarkEffortOf(handed)).toMatchObject({
      kind: "tempo",
      distanceM: 4000,
      timeS: 1200,
    });
    tempo.unmount();

    // A goal-pace tempo's blocks were run at the race goal, not the
    // runner's threshold.
    renderPlanned("tempo_20", {
      activityType: "tempo",
      segments: block(true),
      workPortion,
    });
    expect(await screen.findByText("20 Min Tempo complete ✓")).toBeVisible();
    const pinned = h.paceRuns.find((r) => r.id === "run-1") as EffortRun;
    expect(pinned.workPacePinned).toBe(true);
    expect(benchmarkEffortOf(pinned)).toBeNull();
  });

  it("gives a run-walk no pace trend against runs", async () => {
    // Eight 5 km runs at 5:30 /km: this 5:00 /km is a PR for a run, and
    // nothing for a run-walk, whose pace includes its walks.
    seedFirestore(
      Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `users/runner/runs/past-${i}`,
          {
            completedAt: Timestamp.fromMillis(
              Date.now() - (i + 2) * 86_400_000
            ),
            distance: 5000,
            duration: 1650,
            avgPace: 330,
            activityType: "freerun",
          },
        ])
      )
    );
    const easy = renderPlanned("easy_30");
    expect(await screen.findByText("PR!")).toBeInTheDocument();
    easy.unmount();

    renderPlanned("run_walk_1");
    expect(
      await screen.findByText("Run-walk 1 complete ✓")
    ).toBeInTheDocument();
    // The history has been read and judged by the time the insight settles.
    await waitFor(() => expect(h.paceLoading.at(-1)).toBe(false));
    expect(screen.queryByText("PR!")).toBeNull();
  });
});

/* Run21 (6): the summary speaks only when a run didn't match its type.
   An easy run inside its window gets no line; one run hard gets one. */
describe("RunSummary — the pace line speaks only when the run didn't match", () => {
  const auth = h.auth as { profile: Record<string, unknown> };
  const profile = auth.profile;
  afterEach(() => {
    auth.profile = profile;
  });

  function renderPlannedEasy(elapsed: number) {
    const state = {
      ...savedRun(),
      elapsed,
      runConfig: {
        activityType: "easy",
        planMetadata: {
          planMode: "race_prep",
          planSource: "today_plan",
          plannedRunDayIndex: 2,
          plannedTemplateId: "easy_30",
          plannedTemplateType: "easy",
          actualTemplateId: "easy_30",
          matchedPlanExact: true,
          matchedPlanType: true,
          offPlan: false,
          planWeekIndex: 0,
          planTotalWeeks: 10,
          scheduledRunId: "rd-1",
        },
      },
    };
    return render(
      <MemoryRouter initialEntries={[{ pathname: "/run-summary", state }]}>
        <Routes>
          <Route path="/run-summary" element={<RunSummary />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("says nothing for an easy run at easy pace, and one line for one run hard", async () => {
    // A 25-minute 5K: an easy window of about 6:13–6:52 /km.
    auth.profile = {
      displayName: "Runner",
      runFitness: {
        benchmark: { distanceM: 5000, timeS: 25 * 60 },
        vdot: 38.3,
      },
    };
    // 5 km in 32 minutes: 6:24 /km, inside the window.
    const easy = renderPlannedEasy(32 * 60);
    expect(await screen.findByText("Easy 30 complete ✓")).toBeInTheDocument();
    expect(screen.queryByText(/on target|Faster than easy/)).toBeNull();
    easy.unmount();

    // 5 km in 25 minutes: 5:00 /km, an easy run run hard.
    renderPlannedEasy(25 * 60);
    expect(await screen.findByText("Easy 30 complete ✓")).toBeInTheDocument();
    expect(
      screen.getByText(/^Faster than easy today: 5:00 \/km/)
    ).toBeInTheDocument();
  });
});

/* Pgm8: the treadmill is where a run is done, not a run type. A planned
   run done on one is the planned run: the summary names it complete and
   asks nothing about the planned run, its pace (typed in, not measured)
   is not judged, its typed distance can still be corrected, and it is
   saved as the plan's type, on the treadmill. */
describe("RunSummary — a planned run on the treadmill (Pgm8)", () => {
  const auth = h.auth as { profile: Record<string, unknown> };
  const profile = auth.profile;
  const queued = () => pendingDocumentWrites("runner", "users/runner/runs");
  let online: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // Offline, the run waits in the queue, where the test can read it.
    online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    // A 25-minute 5K: an easy window of about 6:13–6:52 /km.
    auth.profile = {
      displayName: "Runner",
      runFitness: {
        benchmark: { distanceM: 5000, timeS: 25 * 60 },
        vdot: 38.3,
      },
    };
  });
  afterEach(() => {
    online.mockRestore();
    auth.profile = profile;
  });

  /** Today's planned easy run, finished on the treadmill (or, with
   *  `outdoors`, out on the GPS) and not yet saved: 5 km after 25
   *  minutes, 5:00 /km. */
  function renderTreadmillRun(outdoors = false) {
    const state = {
      points: [],
      distance: 5000,
      elapsed: 25 * 60,
      splits: [],
      elevationGain: 0,
      runConfig: {
        activityType: "easy",
        ...(outdoors ? {} : { place: "treadmill" }),
        planMetadata: {
          planMode: "race_prep",
          planSource: "today_plan",
          plannedRunDayIndex: 2,
          plannedTemplateId: "easy_30",
          plannedTemplateType: "easy",
          actualTemplateId: "easy_30",
          matchedPlanExact: true,
          matchedPlanType: true,
          offPlan: false,
          planWeekIndex: 0,
          planTotalWeeks: 10,
          scheduledRunId: "rd-1",
        },
      },
    };
    return render(
      <MemoryRouter initialEntries={[{ pathname: "/run-summary", state }]}>
        <Routes>
          <Route path="/run-summary" element={<RunSummary />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("is the planned run, complete, with nothing to ask about it", async () => {
    renderTreadmillRun();
    expect(
      await screen.findByRole("heading", {
        name: RUN.summary("Easy 30"),
        level: 1,
      })
    ).toBeInTheDocument();
    // The distance was typed in, so it can be corrected before Save.
    expect(
      screen.getByRole("button", { name: "Edit distance" })
    ).toBeInTheDocument();
    // Its pace is not judged: outdoors, 5:00 /km on this easy day hears
    // "Faster than easy today" (the run-walk describe above).
    expect(
      screen.queryByText(/on target|Faster than|Slower than|Quicker than/)
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: RUN.save }));
    // POSITIVE anchor: the run is saved, which is when the summary would
    // ask about the planned run.
    expect(
      await screen.findByRole("button", { name: RUN.done })
    ).toBeInTheDocument();
    expect(queued()).toHaveLength(1);
    expect(queued()[0].data).toMatchObject({
      activityType: "easy",
      place: "treadmill",
      matchedPlanType: true,
      offPlan: false,
      scheduledRunId: "rd-1",
      paceVerdictTone: null,
    });
    expect(screen.queryByText("Off-plan save")).toBeNull();
    expect(
      screen.queryByRole("button", { name: RUN.markPlannedDone })
    ).toBeNull();
    expect(h.markManualComplete).not.toHaveBeenCalled();
  });

  it("gives a typed pace no trend against outdoor runs", async () => {
    // Eight outdoor 5 km runs at 5:30 /km: this 5:00 /km is a PR outdoors,
    // and nothing on the treadmill, whatever the run's type.
    seedFirestore(
      Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `users/runner/runs/past-${i}`,
          {
            completedAt: Timestamp.fromMillis(
              Date.now() - (i + 2) * 86_400_000
            ),
            distance: 5000,
            duration: 1650,
            avgPace: 330,
            activityType: "easy",
          },
        ])
      )
    );
    const outdoors = renderTreadmillRun(true);
    expect(await screen.findByText("PR!")).toBeInTheDocument();
    outdoors.unmount();

    renderTreadmillRun();
    expect(
      await screen.findByRole("heading", {
        name: RUN.summary("Easy 30"),
        level: 1,
      })
    ).toBeInTheDocument();
    // The history has been read and judged by the time the insight settles.
    await waitFor(() => expect(h.paceLoading.at(-1)).toBe(false));
    expect(screen.queryByText("PR!")).toBeNull();
  });

  it("suggests no new benchmark from a typed pace, as an outdoor run's can", async () => {
    renderTreadmillRun();
    fireEvent.click(await screen.findByRole("button", { name: RUN.save }));
    expect(
      await screen.findByRole("button", { name: RUN.done })
    ).toBeInTheDocument();
    expect(h.paceEnabled.at(-1)).toBe(false);
    cleanup();

    // The same run outdoors, saved, is one the Pro insight reads.
    resetFirestore();
    renderTreadmillRun(true);
    fireEvent.click(await screen.findByRole("button", { name: RUN.save }));
    expect(
      await screen.findByRole("button", { name: RUN.done })
    ).toBeInTheDocument();
    expect(h.paceEnabled.at(-1)).toBe(true);
  });
});
