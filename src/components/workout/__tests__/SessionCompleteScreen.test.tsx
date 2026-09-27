/**
 * The completion screen's header stats — pinned because they disagreed with
 * each other on a real session.
 *
 * A device screenshot (2026-08-04) showed "Legs — Deadlift Focus" reporting
 * SETS 4 and VOLUME 240kg while the only exercise listed read
 * "Cable Crunch — 10 kg × 12 — 2/2 sets". Three numbers, one session, two
 * different definitions of a set: VOLUME and the per-exercise rows both
 * excluded the auto-generated warm-up ramp, and SETS did not.
 *
 * This file exists because the screen had no test at all, which is how the
 * inconsistency survived — the same reason `stallDetection` and the weekly
 * volume card were untested when their bugs shipped.
 */
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

import SessionCompleteScreen from "../SessionCompleteScreen";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { SetPR } from "@/lib/prTracking";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    profile: { preferredWeightUnit: "kg" },
    user: { uid: "u1" },
  }),
}));
// Not under test here, and it pulls the streaks provider + Firestore in.
vi.mock("@/components/WeekPulseCard", () => ({ default: () => null }));

function exercise(name: string, sets: number): ProgramExercise {
  return {
    name,
    exerciseId: "cable-crunch",
    instanceId: `i-${name}`,
    movementCategory: "core",
    sets,
    reps: 12,
    baseReps: 12,
    weight: 10,
    progressionType: "double",
    lastSuccessfulWeight: 10,
    lastAttemptedWeight: 10,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  } as unknown as ProgramExercise;
}

function renderScreen(
  setLogs: Array<Array<Record<string, unknown>>>,
  exercises: ProgramExercise[] = [exercise("Cable Crunch", 2)]
) {
  return render(
    <SessionCompleteScreen
      dayName="Legs — Deadlift Focus"
      exercises={exercises}
      setLogs={setLogs as never}
      firedPRs={new Map()}
      sessionDurationMinutes={24}
      completing={false}
      onFinish={() => {}}
      onClose={() => {}}
    />
  );
}

describe("SessionCompleteScreen — header stats agree with each other", () => {
  it("shows the result before Save without opening Session details", async () => {
    renderScreen([
      [{ reps: 12, weight: 10, completed: true, type: "working" }],
    ]);
    await waitFor(() => expect(screen.getByText("24")).toBeVisible());
    expect(screen.getByText("120")).toBeVisible();
    expect(screen.getByText("1")).toBeVisible();
    expect(screen.getByText("24").closest("details")).toBeNull();
    expect(
      screen
        .getByText("24")
        .compareDocumentPosition(
          screen.getByRole("button", { name: "Save workout" })
        ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("SETS counts working sets only, not the warm-up ramp", () => {
    // The production shape: two warm-up rows the ramp generated, two working
    // sets the user actually prescribed. Pre-fix this rendered SETS 4.
    renderScreen([
      [
        { reps: 10, weight: 5, completed: true, type: "warmup" },
        { reps: 10, weight: 7.5, completed: true, type: "warmup" },
        { reps: 12, weight: 10, completed: true, type: "working" },
        { reps: 12, weight: 10, completed: true, type: "working" },
      ],
    ]);

    // The per-exercise row is the number the user reads as authoritative.
    expect(screen.getByText("2/2 sets")).toBeInTheDocument();
    // The header stat must now say the same thing.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("4")).toBeNull();
  });

  it("does not count sets the user never completed", () => {
    renderScreen([
      [
        { reps: 12, weight: 10, completed: true, type: "working" },
        { reps: 12, weight: 10, completed: false, type: "working" },
      ],
    ]);
    expect(screen.getByText("1/2 sets")).toBeInTheDocument();
  });

  it("VOLUME excludes a timed hold, and agrees with what gets saved", () => {
    /* A hold's `reps` is a DURATION, so weight × reps is not a weight
       moved. Every writer excludes timed exercises from the `totalVolume`
       it persists — but this stat FLATTENED `setLogs`, throwing away the
       exercise each set belonged to, and `repUnit` lives on the exercise.
       So the headline the user reads on finishing and the figure saved
       moments later disagreed by the whole hold: 240 vs "1.4k" here. */
    const plank = {
      ...exercise("Weighted Plank", 1),
      exerciseId: "weighted-plank",
      repUnit: "seconds",
    } as unknown as ProgramExercise;

    renderScreen(
      [
        [
          { reps: 12, weight: 10, completed: true, type: "working" },
          { reps: 12, weight: 10, completed: true, type: "working" },
        ],
        [{ reps: 60, weight: 20, completed: true, type: "working" }],
      ],
      [exercise("Cable Crunch", 2), plank]
    );

    expect(screen.getByText("240")).toBeInTheDocument();
    expect(screen.queryByText("1.4k")).toBeNull();
    // The hold still happened: it counts toward SETS (3) and is listed.
    expect(screen.getByText("Weighted Plank")).toBeInTheDocument();
    expect(screen.getByText("20 kg × 60 s")).toBeInTheDocument();
  });

  it("shows the highest completed bodyweight rep count, excluding warm-ups", () => {
    renderScreen(
      [
        [
          { reps: 20, weight: 0, completed: true, type: "warmup" },
          { reps: 6, weight: 0, completed: true, type: "working" },
          { reps: 10, weight: 0, completed: true, type: "working" },
          { reps: 30, weight: 0, completed: false, type: "working" },
        ],
      ],
      [exercise("Push-up", 2)]
    );
    expect(screen.getByText("10 reps")).toBeInTheDocument();
    expect(screen.getByText("2/2 sets")).toBeInTheDocument();
  });

  it("shows the longest completed unweighted hold in seconds", () => {
    renderScreen(
      [
        [
          { reps: 30, weight: 0, completed: true, type: "working" },
          { reps: 60, weight: 0, completed: true, type: "working" },
        ],
      ],
      [{ ...exercise("Plank", 2), repUnit: "seconds" }]
    );
    expect(screen.getByText("60 s")).toBeInTheDocument();
  });

  it("keeps the loaded best set based on weight times reps", () => {
    renderScreen(
      [
        [
          { reps: 5, weight: 80, completed: true, type: "working" },
          { reps: 10, weight: 60, completed: true, type: "working" },
          { reps: 50, weight: 0, completed: true, type: "working" },
        ],
      ],
      [exercise("Squat", 3)]
    );
    expect(screen.getByText("60 kg × 10")).toBeInTheDocument();
  });

  it("still counts a loaded exercise that is not timed", () => {
    /* The guard keys on repUnit, and the type admits "reps" as an
       explicit value — so a truthiness check would drop ordinary work.
       An exclusion that over-fires costs what the omission did. */
    const repsMarked = {
      ...exercise("Cable Row", 1),
      repUnit: "reps",
    } as unknown as ProgramExercise;

    renderScreen(
      [[{ reps: 10, weight: 50, completed: true, type: "working" }]],
      [repsMarked]
    );
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("renders the day name without the raw dayType suffix", () => {
    // Guards the 2026-08-04 fix: this used to render
    // "Legs — Deadlift Focus · legs", and "· full_body" on full-body days.
    renderScreen([
      [{ reps: 12, weight: 10, completed: true, type: "working" }],
    ]);
    expect(
      screen.getByRole("heading", { name: "Review workout" })
    ).toBeInTheDocument();
    expect(screen.getByText("Legs · Deadlift focus")).toBeInTheDocument();
  });
});

/**
 * No share affordance on this screen — the phantom-post regression pin.
 *
 * Until 2026-08-04 this screen carried "Share Workout" (image card) and
 * "Share to circle". Both fired BEFORE the save, because "Save workout" is a
 * separate button — so "Share to circle" → "Close without saving" published
 * a `session_completed` event for a session that was never written. Sharing
 * moved to `/workout/:id`, where the record exists first and that sequence
 * is impossible.
 *
 * This asserts absence, which is normally a weak test. It earns its place
 * because the thing it forbids is a defect that already shipped once, and
 * the natural instinct when adding a feature here is to put a share button
 * back on the celebration screen.
 */
describe("SessionCompleteScreen — sharing lives on the saved record", () => {
  const twoWorking = [
    [
      { reps: 12, weight: 10, completed: true, type: "working" },
      { reps: 12, weight: 10, completed: true, type: "working" },
    ],
  ];

  it("offers no way to share a session that has not been saved yet", () => {
    renderScreen(twoWorking);

    expect(screen.queryByRole("button", { name: /share/i })).toBeNull();
    expect(screen.queryByText(/share to circle/i)).toBeNull();
  });

  it("still offers exactly Save and Close", () => {
    renderScreen(twoWorking);

    expect(screen.getByRole("button", { name: /save workout/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /close without saving/i })
    ).toBeTruthy();
  });
});

describe("save comes before session detail", () => {
  it("labels the unsaved state and keeps details collapsed", () => {
    renderScreen([
      [{ reps: 12, weight: 10, completed: true, type: "working" }],
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("Not saved yet");
    const detail = screen.getByText("Session details").closest("details")!;
    expect(detail.open).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Save workout" })
        .compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
  it("prevents save and close while persistence is pending", () => {
    const finish = vi.fn(),
      close = vi.fn();
    render(
      <SessionCompleteScreen
        dayName="Upper"
        exercises={[]}
        setLogs={[]}
        firedPRs={new Map()}
        sessionDurationMinutes={20}
        completing
        onFinish={finish}
        onClose={close}
      />
    );
    const save = screen.getByRole("button", { name: /Save workout/ });
    expect(save).toBeDisabled();
    const cancel = screen.getByRole("button", { name: "Close without saving" });
    expect(cancel).toBeDisabled();
    fireEvent.click(save);
    fireEvent.click(cancel);
    expect(finish).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

/**
 * DS3's finish screen: the numbers as plain figures over the words that say
 * what they count, new bests in gold with their drawing, and the muscles the
 * session worked.
 */
describe("SessionCompleteScreen — what the session did (DS3)", () => {
  const benchBest = {
    kind: "best",
    bucket: "8rm",
    weight: 80,
    reps: 8,
    previousBest: { weight: 77.5, reps: 8, date: "2026-09-20" },
  } as unknown as SetPR;

  function renderWith(
    props: Partial<Parameters<typeof SessionCompleteScreen>[0]>,
    setLogs: Array<Array<Record<string, unknown>>> = [
      [{ reps: 12, weight: 10, completed: true, type: "working" }],
    ],
    exercises: ProgramExercise[] = [exercise("Cable Crunch", 2)]
  ) {
    return render(
      <SessionCompleteScreen
        dayName="Push — Chest Focus"
        exercises={exercises}
        setLogs={setLogs as never}
        firedPRs={new Map()}
        sessionDurationMinutes={24}
        completing={false}
        onFinish={() => {}}
        onClose={() => {}}
        {...props}
      />
    );
  }

  it("names each number by what it counts", () => {
    renderWith({});
    expect(screen.getByText("minutes")).toBeInTheDocument();
    expect(screen.getByText("kg lifted")).toBeInTheDocument();
    expect(screen.getByText("set")).toBeInTheDocument();
  });

  it("writes an hour or more as hours and minutes", () => {
    renderWith({ sessionDurationMinutes: 65 });
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(screen.getByText("hours")).toBeInTheDocument();
  });

  it("gives a bodyweight session its reps rather than 0 kg lifted", () => {
    renderWith({}, [
      [
        { reps: 8, weight: 0, completed: true, type: "working" },
        { reps: 7, weight: 0, completed: true, type: "working" },
      ],
    ]);
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("reps")).toBeInTheDocument();
    expect(screen.queryByText("kg lifted")).toBeNull();
  });

  it("puts a new best in gold, with its drawing and what it beat", () => {
    const bench = {
      ...exercise("Bench Press", 3),
      exerciseId: "bench-press",
      movementCategory: "horizontal_push",
    } as ProgramExercise;
    renderWith(
      { prResults: new Map([["Bench Press:8rm", benchBest]]) },
      [[{ reps: 8, weight: 80, completed: true, type: "working" }]],
      [bench]
    );
    const heading = screen.getByRole("heading", { name: /New bests/ });
    const card = heading.parentElement!;
    expect(card).toHaveTextContent("Bench Press");
    expect(within(card).getByText("80 kg × 8")).toHaveClass(
      "text-achievement-strong"
    );
    expect(card).toHaveTextContent("Was 77.5 kg × 8");
    expect(card.querySelector('[data-thumb="drawing"]')).not.toBeNull();
  });

  it("reports a first set in a rep range without the gold", () => {
    const first = {
      kind: "bucket-first",
      bucket: "3rm",
      weight: 90,
      reps: 3,
      previousBest: { weight: 80, reps: 8, date: "2026-09-20" },
    } as unknown as SetPR;
    renderWith({ prResults: new Map([["Cable Crunch:3rm", first]]) });
    expect(screen.queryByRole("heading", { name: /New bests/ })).toBeNull();
    const line = screen.getByText(/First time at/).closest("p")!;
    expect(line).toHaveTextContent("Cable Crunch · First time at 2–3 reps.");
    expect(line.querySelector(".text-achievement-strong")).toBeNull();
  });

  it("counts working sets by muscle group, most first, warm-ups left out", () => {
    const press = {
      ...exercise("Bench Press", 3),
      exerciseId: "bench-press",
      movementCategory: "horizontal_push",
    } as ProgramExercise;
    const dips = {
      ...exercise("Dips", 2),
      exerciseId: "dips",
      movementCategory: "arms_triceps",
    } as ProgramExercise;
    renderWith(
      {},
      [
        [
          { reps: 10, weight: 40, completed: true, type: "warmup" },
          { reps: 8, weight: 80, completed: true, type: "working" },
          { reps: 8, weight: 80, completed: true, type: "working" },
          { reps: 8, weight: 80, completed: true, type: "working" },
        ],
        [{ reps: 10, weight: 0, completed: true, type: "working" }],
      ],
      [press, dips]
    );
    const heading = screen.getByRole("heading", { name: "Muscles worked" });
    const rows = within(heading.parentElement!).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Chest3 sets",
      "Triceps1 set",
    ]);
    expect(
      screen.getByRole("img", { name: "Muscles trained this session" })
    ).toBeInTheDocument();
  });
});
