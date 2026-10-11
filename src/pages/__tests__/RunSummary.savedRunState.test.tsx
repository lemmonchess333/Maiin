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
  paceRuns: [] as { id?: string; templateId?: string }[],
  markManualComplete: vi.fn(),
  skipRunDay: vi.fn(),
  track: vi.fn(),
  mapProps: [] as Record<string, unknown>[],
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
      programState: { runDays: [{ id: "rd-1", status: "planned" }] },
    };
  },
}));
vi.mock("@/hooks/usePaceInsight", () => ({
  usePaceInsightFromRuns: (
    runs: { id?: string; templateId?: string }[],
    opts: { loading?: boolean }
  ) => {
    h.paceLoading.push(opts.loading ?? false);
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark scheduled run complete" })
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

describe("RunSummary — the plan row counts the week the card counts", () => {
  it("shows the week's runs against the plan's, from the one read", async () => {
    week.pulse = {
      lifts: null,
      runs: { count: 2, km: 9.5, planned: 3 },
      streak: null,
    };
    renderSummary();
    const label = await screen.findByText("runs this week");
    expect(label.parentElement?.textContent).toMatch(/^2of3runs this week/);
  });

  it("has no plan row for a week the plan has no runs in", async () => {
    week.pulse = {
      lifts: null,
      runs: { count: 2, km: 9.5, planned: null },
      streak: null,
    };
    renderSummary();
    expect(await screen.findByText("Run saved")).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "Save run" }));
    expect(
      await screen.findByRole("button", { name: "Done" })
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

  function renderPlanned(templateId: string) {
    const state = {
      ...savedRun(),
      runConfig: {
        activityType: "easy",
        planMetadata: {
          planMode: "race_prep",
          planSource: "today_plan",
          plannedRunDayIndex: 2,
          plannedTemplateId: templateId,
          plannedTemplateType: "easy",
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
    expect(await screen.findByText("Easy 30 complete ✓")).toBeInTheDocument();
    expect(screen.getByText(/Keep the easy days easy/)).toBeInTheDocument();
    easy.unmount();

    renderPlanned("run_walk_1");
    expect(
      await screen.findByText("Run-walk 1 complete ✓")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/easy days easy|on target|Quicker than|Slower than/)
    ).toBeNull();
  });

  it("hands Pace Insight a run-walk as one, so it sets no benchmark", async () => {
    renderPlanned("run_walk_1");
    expect(
      await screen.findByText("Run-walk 1 complete ✓")
    ).toBeInTheDocument();
    expect(h.paceRuns.find((r) => r.id === "run-1")?.templateId).toBe(
      "run_walk_1"
    );
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
