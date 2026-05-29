/**
 * PR-0b-iii + PR-0d + PR-4: ProgrammeRunSection behaviour.
 *
 * Pinned here:
 *
 *  PR-0b-iii (rows):
 *   - race_completed_unlinked rows show passive copy
 *     ("Race completed separately. Review this in History.")
 *     with no template-swap select, no Skip, no Start.
 *   - planned rows show the editable template <select> as before.
 *   - terminal rows (skipped / completed_*) show a disabled
 *     select — the user can read the row but can't change it.
 *
 *  PR-0d (mode-change safety):
 *   - Mode changes never call updateProfile({ runMode }) directly.
 *     All paths route through onOpenConfigurePlan(CONFIGURE_PLAN_RUNNING_STEP).
 *
 *  PR-4 (hero inversion):
 *   - Mode-picker chip row is gone. Mode changes happen via the
 *     footer "Change plan ›" affordance.
 *   - Freeform users see a "Start a run" hero + recent-run summary
 *     (or empty-state copy when no runs).
 *   - Structured / race_prep users with planned runs see a
 *     "Next · {day}" Start card promoted above the per-day list.
 *   - The "Race prep not set up yet" stub remains the hero for
 *     race_prep + no goal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProgrammeRunSection from "../ProgrammeRunSection";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";

// A1c cleanup — the "Change plan" link now deeplinks to
// /settings/training instead of opening the legacy ConfigurePlanModal.
// Mock useNavigate so tests can assert the route.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

beforeEach(() => {
  navigateMock.mockClear();
});

// PR-B: ProgrammeRunSection now consumes useAuth() directly (to
// call updateProfile from the inline mode-change handler). Mock
// it so the component renders standalone.
const mockUpdateProfile = vi.fn(async () => ({ ok: true }) as { ok: true });
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "u-1" },
    profile: { uid: "u-1" },
    updateProfile: mockUpdateProfile,
  }),
}));

// PR-J chunk B3b — ProgrammeRunSection now consumes useClaimMap,
// which calls useProgram + Firestore onSnapshot. Tests render the
// component without a Firestore environment, so we mock useClaimMap
// to return an empty claim map. The hook surface is already covered
// by src/hooks/__tests__/useClaimMap.test.ts.
// Mutable so a test can seed a claim against a planned runDay (Run9 ENG e:
// startability must consult the claim-map, not just stored status).
let mockClaimMap = new Map<
  string,
  {
    claimedSavedRunId?: string;
    manualCompleted: boolean;
    legacyCompleted: boolean;
  }
>();
vi.mock("@/hooks/useClaimMap", () => ({
  useClaimMap: () => ({
    claimMap: mockClaimMap,
    unclaimedByDate: new Map(),
    today: "2026-05-12",
    loading: false,
  }),
}));

// PR-4: ProgrammeRunSection now consumes useRunningStats. Mock it
// so tests don't try to hit Firestore. Per-test override via
// `mockRecentRuns` / `mockWeeklyData` for the freeform-hero cases.
let mockRecentRuns: Array<{
  id: string;
  distance: number;
  duration: number;
  avgPace: number;
  elevationGain: number;
  calories: number;
  activityType: string;
  completedAt: Date;
}> = [];
let mockWeeklyData: Array<{
  week: string;
  totalDistance: number;
  runCount: number;
  avgPace: number;
}> = [];
let mockRunsLoading = false;
vi.mock("@/hooks/useRunningStats", () => ({
  useRunningStats: () => ({
    runs: mockRecentRuns,
    weeklyData: mockWeeklyData,
    loading: mockRunsLoading,
  }),
}));

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    runMode: "race_prep",
    raceGoal: { distance: "10k", targetDate: "2027-04-18" },
    ...overrides,
  } as UserProfile;
}

function makeProgramState(
  runDays: ScheduledRunDay[],
  overrides: Partial<ProgramState> = {}
): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "ppl",
    workouts: [],
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays,
    runPlan: {
      mode: "race_prep",
      raceGoal: { distance: "10k", targetDate: "2027-04-18" },
      totalWeeks: 12,
      currentWeek: 0,
    },
    ...overrides,
  } as ProgramState;
}

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "runday_2026-05-10_2_easy_30",
    dayIndex: 2,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    date: "2026-05-12",
    weekKey: "2026-05-10",
    ...overrides,
  };
}

function commonProps() {
  return {
    profile: makeProfile(),
    runsTarget: 2,
    overrideRunDay: vi.fn(),
    // PR-J Q2 chunk B2: completeRunDay deleted; replaced by
    // markManualComplete which writes to manualCompletions.
    markManualComplete: vi.fn(async () => {}),
    skipRunDay: vi.fn(async () => {}),
    skipWorkoutDay: vi.fn(async () => {}),
    // PR-B: refreshRunSchedule is the composing handler's second
    // half. Tests pass an async no-op since the assertions are on
    // the chip + form behaviour, not the regenerator output.
    refreshRunSchedule: vi.fn(async () => {}),
    skipRecoveryEarly: vi.fn(async () => {}),
  };
}

function renderSection(
  props: ReturnType<typeof commonProps>,
  programState: ProgramState
) {
  return render(
    <MemoryRouter>
      <ProgrammeRunSection {...props} programState={programState} />
    </MemoryRouter>
  );
}

function renderWith(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("ProgrammeRunSection — runDay rendering", () => {
  // Run7 Q3 + Q8: the legacy 7-row dropdown stack was replaced by a
  // compact 7-column week strip (RunWeekStrip). The inline template-
  // swap <select> was a duplicate of DayActionSheet's same picker
  // and is gone. Edit path is now tap-through → DayActionSheet.

  it("renders the compact week strip (no inline template <select>)", () => {
    const programState = makeProgramState([makeRunDay({ status: "planned" })]);
    const { container } = renderSection(commonProps(), programState);
    expect(container.querySelectorAll("select").length).toBe(0);
    expect(screen.getByLabelText(/this week's runs/i)).toBeInTheDocument();
  });

  it("strikes through terminal runs (skipped) in the strip — no passive copy", () => {
    const programState = makeProgramState([makeRunDay({ status: "skipped" })]);
    renderSection(commonProps(), programState);
    // Find the column button for that day and confirm its label is strikethrough.
    const col = screen.getByRole("button", { name: /Tue.*skipped/i });
    const label = col.querySelector(".line-through");
    expect(label).not.toBeNull();
    expect(
      screen.queryByText(/Race completed separately/i)
    ).not.toBeInTheDocument();
  });
});

describe("ProgrammeRunSection — A1c 'Manage Run Plan' deeplink", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("clicking 'Manage Run Plan' deeplinks to /settings/training (freeform)", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([], { runPlan: undefined })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Manage Run Plan/i }));
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/settings/training");
  });

  it("clicking 'Manage Run Plan' deeplinks to /settings/training (structured)", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([makeRunDay()], {
          runPlan: { mode: "structured" },
        })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Manage Run Plan/i }));
    expect(navigateMock).toHaveBeenCalledWith("/settings/training");
  });

  it("clicking 'Manage Run Plan' deeplinks to /settings/training (race_prep with goal)", () => {
    const props = commonProps();
    renderSection(props, makeProgramState([makeRunDay()]));
    fireEvent.click(screen.getByRole("button", { name: /Manage Run Plan/i }));
    expect(navigateMock).toHaveBeenCalledWith("/settings/training");
  });

  // Run8 PR1a — footer is a single muted-gray "Manage Run Plan ›"
  // text-link (was "Change plan ›"). Mode is conveyed by the section
  // subtitle in non-freeform; freeform shows no subtitle and the
  // hero IS the mode reveal.
  it("footer is a single Manage Run Plan link with no 'Running mode:' status prefix", () => {
    renderSection(commonProps(), makeProgramState([makeRunDay()]));
    expect(screen.queryByText(/Running mode:/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Manage Run Plan/i })
    ).toBeInTheDocument();
  });

  // Run7 Q5 — race goal form collapses to a one-line summary when a
  // goal is already saved. Pre-Q5 the row was "Race" + "10K — 2026-04-18"
  // + coral Edit button (two-piece header). New shape: a single text
  // run "Race goal: 10K · 16 Jul 2026" plus a muted-gray Edit chevron.
  it("renders race-goal summary as 'Race goal: <distance> · <human date>' one-liner with muted Edit ›", () => {
    const programState = makeProgramState([makeRunDay()], {
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2027-07-16" },
        totalWeeks: 12,
        currentWeek: 0,
      },
    });
    renderSection(commonProps(), programState);
    // Summary line — order-of-text + human-readable month.
    expect(screen.getByText(/Race goal:/i)).toBeInTheDocument();
    expect(screen.getByText(/10K · 16 Jul 2027/)).toBeInTheDocument();
    // Edit button is muted-gray text-link (Q2 navigation discipline),
    // not coral.
    const editBtn = screen.getByRole("button", { name: /Edit race goal/i });
    expect(editBtn.className).toContain("text-muted-foreground");
    expect(editBtn.style.color).toBe("");
  });
});

describe("ProgrammeRunSection — PR-4 freeform hero", () => {
  beforeEachReset();

  it("renders a 'Start a run' CTA for freeform users", () => {
    mockRecentRuns = [];
    mockWeeklyData = [];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />
    );
    expect(screen.getByText(/Start a run/i)).toBeInTheDocument();
  });

  it("renders the empty-state copy when freeform user has no runs", () => {
    mockRecentRuns = [];
    mockWeeklyData = [];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />
    );
    expect(
      screen.getByText(
        /Track your first run to see weekly distance and pace trends here\./i
      )
    ).toBeInTheDocument();
  });

  it("renders last-run + this-week stats when freeform user has runs", () => {
    mockRecentRuns = [
      {
        id: "r1",
        distance: 5200,
        duration: 1722,
        avgPace: 331,
        elevationGain: 12,
        calories: 320,
        activityType: "run",
        completedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      },
    ];
    // PR-F: "This week" filter now uses `localWeekKey(new Date())`
    // so the fixture must reflect the current calendar week, not
    // a hardcoded historical week. Use the runtime week key.
    const todayWeekKey = (() => {
      const d = new Date();
      const sunday = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() - d.getDay()
      );
      const y = sunday.getFullYear();
      const m = String(sunday.getMonth() + 1).padStart(2, "0");
      const day = String(sunday.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    mockWeeklyData = [
      { week: todayWeekKey, totalDistance: 12.3, runCount: 2, avgPace: 330 },
    ];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />
    );
    expect(screen.getByText(/Last run/i)).toBeInTheDocument();
    expect(screen.getByText(/This week/i)).toBeInTheDocument();
    // "Track your first run" empty state should not render.
    expect(screen.queryByText(/Track your first run/i)).not.toBeInTheDocument();
    // Run9 R2-1: a descriptive cadence headline leads (1 run in the window).
    expect(
      screen.getByText(/You've run 1× in the last 4 weeks/i)
    ).toBeInTheDocument();
  });

  it("Run9 R2-1: lapsed freeform user (no run in the window) sees a re-invite, never '0×'", () => {
    mockRecentRuns = [
      {
        id: "r-old",
        distance: 5000,
        duration: 1700,
        avgPace: 330,
        elevationGain: 0,
        calories: 300,
        activityType: "run",
        // 30 days ago — inside the hook's 30d window but OUTSIDE the 4-week
        // (28d) cadence window → "lapsed".
        completedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      },
    ];
    mockWeeklyData = [];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />
    );
    expect(screen.getByText(/pick it back up/i)).toBeInTheDocument();
    // Never a judgmental "0×" count, and not the cold-start copy.
    expect(screen.queryByText(/0×/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Track your first run/i)).not.toBeInTheDocument();
  });

  it("section is visible for freeform users even with runsTarget === 0 (no early return)", () => {
    mockRecentRuns = [];
    mockWeeklyData = [];
    const props = commonProps();
    const profile = makeProfile({ runMode: "freeform", raceGoal: undefined });
    const { container } = renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />
    );
    expect(container.querySelector("section")).not.toBeNull();
    expect(screen.getByText(/Run training/i)).toBeInTheDocument();
  });
});

describe("ProgrammeRunSection — PR-4 structured / race_prep hero", () => {
  beforeEachReset();

  it("promotes a 'Next' Start card for structured users with planned runs", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState(
          [makeRunDay({ status: "planned", dayIndex: 3 })],
          { runPlan: { mode: "structured" } }
        )}
      />
    );
    expect(screen.getByText(/^Next ·/i)).toBeInTheDocument();
  });

  it("renders 'All runs done this week' badge when every runDay is terminal", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState(
          [makeRunDay({ status: "completed_exact", completed: true })],
          { runPlan: { mode: "structured" } }
        )}
      />
    );
    expect(screen.getByText(/All runs done this week/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Next ·/i)).not.toBeInTheDocument();
  });

  it("Run9 ENG e: a claim-completed runDay still on 'planned' status is NOT promoted as Next", () => {
    // The slot's stored status is "planned" (the claim-map reframe never flips
    // it), but a saved run claimed it. Pre-fix this promoted an already-run slot
    // as "Next ·" and "all runs done" never fired. The claim-aware nextStartable
    // must treat it as complete.
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    const claimedDay = makeRunDay({ status: "planned", dayIndex: 3 });
    mockClaimMap = new Map([
      [
        claimedDay.id!,
        {
          claimedSavedRunId: "saved-run-1",
          manualCompleted: false,
          legacyCompleted: false,
        },
      ],
    ]);
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={makeProgramState([claimedDay], {
          runPlan: { mode: "structured" },
        })}
      />
    );
    expect(screen.queryByText(/^Next ·/i)).not.toBeInTheDocument();
    expect(screen.getByText(/All runs done this week/i)).toBeInTheDocument();
  });

  it("renders 'Configure your runs' CTA for non-freeform users with runsTarget=0 and no race goal", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "structured", raceGoal: undefined });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: { mode: "structured" } })}
      />
    );
    expect(screen.getByText(/Configure your runs/i)).toBeInTheDocument();
  });
});

// Run7 Q6 + Q10 — banners hoisted ABOVE the section label, severity-
// ordered, with the shared <Banner> primitive. State-derived banners
// (raceCompressed, inRecovery) are non-dismissible; action-prompting
// raceElapsed is dismissible per-week via localStorage.
describe("ProgrammeRunSection — Q10 banner system", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("Run9 (k): compressed shows as a calm RaceHeader note, NOT an amber alert banner", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep" });
    const programState = makeProgramState([], {
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2099-01-01" },
        totalWeeks: 12,
        currentWeek: 0,
        compressed: true,
      },
    });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={programState}
      />
    );
    // The compressed note lives in the persistent header now — a plain note,
    // not an alert/Banner, and not dismissible.
    expect(screen.getByText(/Compressed plan/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dismiss/i })
    ).not.toBeInTheDocument();
  });

  it("race-elapsed banner is dismissible and persists via localStorage for the week", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep" });
    // Past race date with no recovery / no-show state → triggers
    // the legacy elapsed fallback.
    const programState = makeProgramState([], {
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "5k", targetDate: "2020-01-01" },
        totalWeeks: 12,
        currentWeek: 12,
      },
    });
    const { unmount } = renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={programState}
      />
    );
    const dismissBtn = screen.getByRole("button", {
      name: /Dismiss race elapsed banner/i,
    });
    expect(screen.getByText(/Race day has passed/i)).toBeInTheDocument();
    fireEvent.click(dismissBtn);
    // Hidden after dismiss.
    expect(screen.queryByText(/Race day has passed/i)).not.toBeInTheDocument();
    // Remount → still hidden (localStorage persisted).
    unmount();
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={programState}
      />
    );
    expect(screen.queryByText(/Race day has passed/i)).not.toBeInTheDocument();
  });

  it("malformed-plan warning hosts the Configure plan CTA inside the banner action slot", () => {
    const props = commonProps();
    const profile = makeProfile({
      runMode: "structured",
      raceGoal: undefined,
      weeklyRunDaysTarget: 0,
    });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        runsTarget={0}
        programState={makeProgramState([], { runPlan: undefined })}
      />
    );
    expect(screen.getByText(/Configure your runs/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Configure plan$/i })
    ).toBeInTheDocument();
  });

  it("no-show prompt renders when the race-day runDay is race_no_show", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep" });
    const programState = makeProgramState(
      [
        makeRunDay({
          date: "2027-04-18",
          templateId: "race",
          type: "race",
          status: "race_no_show",
        }),
      ],
      {
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: "2027-04-18" },
          totalWeeks: 12,
          currentWeek: 12,
        },
      }
    );
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={programState}
      />
    );
    expect(screen.getByText(/We marked this as no-show/i)).toBeInTheDocument();
  });

  it("recovery-complete prompt renders when the recovery window has elapsed", () => {
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep" });
    const programState = makeProgramState([], {
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2027-04-18" },
        phase: "recovery",
        recoveryEndDate: "2020-01-01", // long past → recoveryEnded
        totalWeeks: 12,
        currentWeek: 12,
      },
    });
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={programState}
      />
    );
    expect(screen.getByText(/Recovery complete/i)).toBeInTheDocument();
  });

  it("Run9 (f): contextual slot shows ONLY no-show when no-show + recovery-complete both qualify", () => {
    // Both conditions true at once — the single slot must surface no-show
    // (higher precedence) and suppress recovery-complete. Pre-collapse both
    // banners rendered independently and stacked.
    const props = commonProps();
    const profile = makeProfile({ runMode: "race_prep" });
    const programState = makeProgramState(
      [
        makeRunDay({
          date: "2027-04-18",
          templateId: "race",
          type: "race",
          status: "race_no_show",
        }),
      ],
      {
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "10k", targetDate: "2027-04-18" },
          phase: "recovery",
          recoveryEndDate: "2020-01-01",
          totalWeeks: 12,
          currentWeek: 12,
        },
      }
    );
    renderWith(
      <ProgrammeRunSection
        {...props}
        profile={profile}
        programState={programState}
      />
    );
    expect(screen.getByText(/We marked this as no-show/i)).toBeInTheDocument();
    expect(screen.queryByText(/Recovery complete/i)).not.toBeInTheDocument();
  });
});

// Reset the useRunningStats mock between tests so the freeform-hero
// cases see fresh fixture data each time.
function beforeEachReset() {
  beforeEach(() => {
    mockRecentRuns = [];
    mockWeeklyData = [];
    mockRunsLoading = false;
    mockClaimMap = new Map();
  });
}

// beforeEach is imported at the top of the file (used by both
// the PR-B chip suite and the freeform-hero reset helper).
