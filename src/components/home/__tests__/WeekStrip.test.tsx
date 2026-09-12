/**
 * Spec v7 required-test gate #11 — Home future planned day shows
 * planned item.
 *
 * Companion to DayPeekCard.test.tsx — that test pins the
 * tap-through detail. This one pins the always-visible strip
 * itself: future days that have a planned runDay must render the
 * coral planned-run indicator, NOT a blank chip.
 *
 * PR-0c moves the strip's runDay-matching from inline
 * `runDays.find(r => r.dayIndex === dow)` + `inSameWeek` heuristic
 * to the shared training resolver, which enforces date/weekKey-
 * aware matching anchored on today's currentWeekKey. So next-
 * week strip days can no longer borrow this-week's runDay state.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import WeekStrip from "@/components/home/WeekStrip";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";

const emptyClaimMap: Map<string, ClaimState> = new Map();

function claimMapWith(
  entries: Array<[string, Partial<ClaimState>]>
): Map<string, ClaimState> {
  const m = new Map<string, ClaimState>();
  for (const [id, partial] of entries) {
    m.set(id, {
      claimedSavedRunId: undefined,
      manualCompleted: false,
      legacyCompleted: false,
      ...partial,
    });
  }
  return m;
}

function makeSchedule(types: ScheduleDay["type"][]): ScheduleDay[] {
  return types.map((type, day) => ({ day, type }));
}

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: `runday_test_${overrides.dayIndex ?? 0}`,
    dayIndex: 0,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  };
}

function makeProfile(weekSchedule: ScheduleDay[]): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    weekSchedule,
  } as UserProfile;
}

function makeProgramState(runDays: ScheduledRunDay[]): ProgramState {
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
  } as ProgramState;
}

describe("WeekStrip — runDay status precedence (spec gate #11, resolver-aware)", () => {
  it("renders the planned-run rhombus when today's runDay is planned and not completed", () => {
    const today = new Date();
    const todayDow = today.getDay();
    const todayKey = localDateString(today);
    const todayWeekKey = localWeekKey(today);
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);
    const programState = makeProgramState([
      makeRunDay({ dayIndex: todayDow, date: todayKey, weekKey: todayWeekKey }),
    ]);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={programState}
        claimMap={emptyClaimMap}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    // Coral rhombus — planned, not completed.
    const rhombuses = container.querySelectorAll(".rotate-45");
    expect(rhombuses.length).toBeGreaterThan(0);
    // No Check icon — planned (not completed) does not render a check.
    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length).toBe(0);
  });

  it("renders a Check icon for a completed run day (precedence over recurring rhombus)", () => {
    // PR-J chunk B3c — resolver-derived completion. The legacy
    // doc carries status="completed_exact" + the claim map's
    // `legacyCompleted` entry is what surfaces the ✅ (matches
    // what `computeClaims` produces in the real wiring).
    const today = new Date();
    const todayDow = today.getDay();
    const todayKey = localDateString(today);
    const todayWeekKey = localWeekKey(today);
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);
    const legacyRunDay = makeRunDay({
      dayIndex: todayDow,
      date: todayKey,
      weekKey: todayWeekKey,
      completed: true,
      status: "completed_exact",
    });
    const programState = makeProgramState([legacyRunDay]);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([[legacyRunDay.id!, { legacyCompleted: true }]])}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length).toBeGreaterThan(0);
  });

  it("renders a Check icon when the claim map carries a manual completion (B2 writer)", () => {
    // PR-J chunk B3c — the new manualCompletions writer path:
    // runDay.status stays "planned", but the ✅ surfaces because
    // the claim map says manualCompleted.
    const today = new Date();
    const todayDow = today.getDay();
    const todayKey = localDateString(today);
    const todayWeekKey = localWeekKey(today);
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);
    const plannedRunDay = makeRunDay({
      dayIndex: todayDow,
      date: todayKey,
      weekKey: todayWeekKey,
      status: "planned",
    });
    const programState = makeProgramState([plannedRunDay]);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={programState}
        claimMap={claimMapWith([
          [plannedRunDay.id!, { manualCompleted: true }],
        ])}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length).toBeGreaterThan(0);
  });

  it("anchors every strip day on ONE week key, so none can borrow another week's runDay", () => {
    /* The strip renders the calendar week containing today, so all
       seven days share `localWeekKey(today)` and a legacy-shaped runDay
       (no date/weekKey) legitimately matches each of them by dayIndex.
       That is the property worth pinning HERE: one anchor for the whole
       window, which is what makes the resolver's gate meaningful.

       The gate itself — a target date in a DIFFERENT week not matching
       — cannot be exercised from this component any more, because the
       window can no longer contain a next-week date. It keeps its own
       coverage where it lives, in trainingResolver.test.ts: "does NOT
       match the same legacy runDay when target is in a future week —
       THE date-inheritance bug fix". */
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);
    const today = new Date();
    const todayDow = today.getDay();
    // A legacy runDay with NO date/weekKey, dayIndex covering all
    // dows except today's. With the legacy code these would leak
    // status onto every strip day (including next-week dates).
    const runDays = [0, 1, 2, 3, 4, 5, 6]
      .filter((d) => d !== todayDow)
      .map((d) =>
        makeRunDay({
          dayIndex: d,
          date: undefined,
          weekKey: undefined,
          completed: true,
          status: "completed_exact",
        })
      );

    // Claim map carries `legacyCompleted: true` for every legacy
    // doc — the resolver's currentWeekKey gate is what prevents
    // those entries from leaking onto next-week strip positions
    // (the runDay match returns null before the claim map is even
    // consulted).
    const claimMap = claimMapWith(
      runDays.map((rd) => [rd.id!, { legacyCompleted: true }])
    );
    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={makeProgramState(runDays)}
        claimMap={claimMap}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    /* Every day of the week except today carries a legacy runDay, and
       all seven share today's week key — so all six resolve. An anchor
       that drifted per-day (a strip starting mid-week, say, which would
       straddle two week keys) would drop some of them. */
    const checks = container.querySelectorAll(".lucide-check");
    expect(checks.length, `todayDow=${todayDow}`).toBe(6);
  });

  it("renders the recurring rhombus when programState is omitted (back-compat)", () => {
    const schedule = makeSchedule([
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
      "run",
    ]);
    const profile = makeProfile(schedule);

    const { container } = render(
      <WeekStrip
        dayMap={new Map()}
        profile={profile}
        programState={null}
        claimMap={emptyClaimMap}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );

    const rhombuses = container.querySelectorAll(".rotate-45");
    expect(rhombuses.length).toBeGreaterThan(0);
  });
});

/**
 * Accessible name + selection state.
 *
 * The strip renders four distinct training signals — a purple dot for a
 * lift, a coral rhombus for a planned run, a check for a completed one, a
 * faded rhombus for a skipped one — and, before this, none of them reached
 * the accessible name. What did reach it was "(activity logged)", derived
 * from `dayMap`, which counts MEALS: `Food.tsx` is the only writer of
 * `users/{uid}/logs` and it writes `workouts: 0` unconditionally.
 *
 * So the one signal with no visual counterpart was announced in place of
 * every signal that had one. A screen-reader user heard nothing for a day
 * they had trained, and "activity logged" for a day they had only eaten.
 *
 * Selection was worse than undescribed: the strip is a 7-way selector and
 * the chosen day was conveyed by fill colour alone, with no `aria-pressed`
 * and no textual equivalent — unusable rather than merely terse.
 */
describe("WeekStrip — accessible name and selection state", () => {
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  /** Render a strip whose EVERY day carries `type`, so whichever cell is
   *  today is the one under test. */
  function renderAllDays(
    type: ScheduleDay["type"],
    opts: {
      runDays?: ScheduledRunDay[];
      claimMap?: Map<string, ClaimState>;
      dayMap?: Map<
        string,
        { workouts: number; meals: number; caloriesHit: boolean }
      >;
      selectedDate?: string | null;
    } = {}
  ) {
    const profile = makeProfile(makeSchedule(DOW.map(() => type)));
    return render(
      <WeekStrip
        dayMap={opts.dayMap ?? new Map()}
        profile={profile}
        programState={makeProgramState(opts.runDays ?? [])}
        claimMap={opts.claimMap ?? emptyClaimMap}
        selectedDate={opts.selectedDate ?? null}
        onDayTap={vi.fn()}
      />
    );
  }

  /** Today's position in the strip. The strip renders the CALENDAR week
   *  containing today, Monday-first (`localWeekKey` is Monday-anchored),
   *  so today sits at its own weekday slot rather than at 0 — and that
   *  slot is NOT `getDay()`, which still numbers from Sunday. Monday 1 → 0
   *  … Sunday 0 → 6. */
  const todayIndex = () => (new Date().getDay() + 6) % 7;

  /** Today's cell. */
  const todayCell = (container: HTMLElement) =>
    container.querySelectorAll("button")[todayIndex()];

  /** Any cell that is NOT today — a fixed index like 3 would BE today one
   *  day in seven, which is the kind of weekday-dependent flake that only
   *  shows up midweek. Index 0 is Monday, so it is only today on a Monday. */
  const nonTodayCell = (container: HTMLElement) => {
    const cells = container.querySelectorAll("button");
    return cells[todayIndex() === 0 ? 1 : 0];
  };

  /* The capture spec `surfaces.screens.capture.spec.ts` opens the day
     peek by selecting a day cell on its accessible NAME — it needs a
     non-today cell, to keep the frame's subject from drifting with the
     weekday CI runs on. Its regex had rotted: it anchored the date to
     end-of-name,
     which stopped being true once the training label was appended, so
     it matched nothing and that step timed out on every screenshot run.
     Nothing failed locally, because the tests above assert only the
     training-label FRAGMENT.

     These pin the whole shape the selector depends on: weekday, date,
     training label, and "(today)" present on exactly one cell. */
  it("labels a day cell as weekday, date, then training label", () => {
    const { container } = renderAllDays("rest");
    const label = todayCell(container).getAttribute("aria-label") ?? "";
    // en-GB day-before-month ("Saturday 23 August, …") — the app's one
    // date treatment, applied to the label 2026-08-22.
    expect(label).toMatch(/^\w+day \d+ \w+, /);
  });

  it("marks today, and only today, with the (today) suffix", () => {
    const { container } = renderAllDays("rest");
    const cells = Array.from(container.querySelectorAll("button"));
    const labels = cells.map((c) => c.getAttribute("aria-label") ?? "");
    expect(labels.filter((l) => l.includes("(today)"))).toHaveLength(1);
    /* This deliberately does NOT re-assert the capture spec's regex.
       It used to carry a hand-written copy of the pattern, described as
       "the same predicate, so this fails when that selector would" —
       which holds only while somebody keeps the two literals in sync by
       hand, and a copy of a selector is the same shape of bug as the
       rotted selector it was written to catch.

       `weekStripCaptureSelector.test.tsx` reads the LIVE regex out of
       the spec file and runs it against these same names: six non-today
       matches, never today. That cannot drift. What stays here is the
       label shape itself, which is what the selector depends on and is
       this suite's own business. */
  });

  it("names a rest day, a lift day and a run day", () => {
    for (const [type, expected] of [
      ["rest", /rest day/i],
      ["lift", /lift day/i],
      ["run", /run day/i],
    ] as const) {
      const { container, unmount } = renderAllDays(type);
      expect(
        todayCell(container).getAttribute("aria-label"),
        `scheduleType ${type}`
      ).toMatch(expected);
      unmount();
    }
  });

  it("names both disciplines on a combined day", () => {
    const { container } = renderAllDays("both");
    const label = todayCell(container).getAttribute("aria-label") ?? "";
    expect(label).toMatch(/lift/i);
    expect(label).toMatch(/run/i);
  });

  it("says a run was completed, not merely that one was planned", () => {
    /* This is the pairing that matters: the check and the rhombus are
       different marks on screen, and before this they produced the SAME
       accessible name. */
    const today = new Date();
    const runDay = makeRunDay({
      dayIndex: today.getDay(),
      date: localDateString(today),
      weekKey: localWeekKey(today),
    });
    const planned = renderAllDays("run", { runDays: [runDay] });
    expect(todayCell(planned.container).getAttribute("aria-label")).not.toMatch(
      /completed/i
    );
    planned.unmount();

    const done = renderAllDays("run", {
      runDays: [runDay],
      claimMap: claimMapWith([[runDay.id!, { manualCompleted: true }]]),
    });
    expect(todayCell(done.container).getAttribute("aria-label")).toMatch(
      /completed/i
    );
  });

  it("says a run was skipped", () => {
    const today = new Date();
    const runDay = makeRunDay({
      dayIndex: today.getDay(),
      date: localDateString(today),
      weekKey: localWeekKey(today),
      status: "skipped",
    });
    const { container } = renderAllDays("run", { runDays: [runDay] });
    expect(todayCell(container).getAttribute("aria-label")).toMatch(/skipped/i);
  });

  it("exposes which day is selected", () => {
    /* The gap that made the strip unusable rather than merely terse.
       Asserted as a pair so "always pressed" cannot pass. */
    const todayKey = localDateString(new Date());
    const selected = renderAllDays("rest", { selectedDate: todayKey });
    expect(todayCell(selected.container).getAttribute("aria-pressed")).toBe(
      "true"
    );
    selected.unmount();

    const unselected = renderAllDays("rest", { selectedDate: null });
    expect(todayCell(unselected.container).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("calls the meal count food, and only when meals were logged", () => {
    /* `dayMap` is meals. Announcing it as "activity" claimed something the
       collection does not carry — `workouts` is hardcoded 0 by its only
       writer — right next to the training state it was displacing. */
    const todayKey = localDateString(new Date());
    const withFood = renderAllDays("rest", {
      dayMap: new Map([
        [todayKey, { workouts: 0, meals: 3, caloriesHit: false }],
      ]),
    });
    const fedLabel = todayCell(withFood.container).getAttribute("aria-label");
    expect(fedLabel).toMatch(/food logged/i);
    expect(fedLabel).not.toMatch(/activity logged/i);
    withFood.unmount();

    const without = renderAllDays("rest");
    expect(todayCell(without.container).getAttribute("aria-label")).not.toMatch(
      /food logged/i
    );
  });

  it("still leads with the date, and marks today", () => {
    // The parts that already worked must survive the rewrite.
    const { container } = renderAllDays("rest");
    const label = todayCell(container).getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^[A-Z][a-z]+day \d{1,2} [A-Z][a-z]+/);
    expect(label).toMatch(/\(today\)/);
    // …and a day that is not today does not claim to be.
    const other = nonTodayCell(container);
    expect(other.getAttribute("aria-label")).not.toMatch(/\(today\)/);
  });
});

describe("WeekStrip — the week you are in, not the week ahead", () => {
  /* Home labels this section "This week" while the strip ran
     today..today+6, so on a Wednesday it read Wed-Tue: two calendar
     weeks under a heading claiming one, with the days already gone
     simply absent. That absence also put DayPeekCard's nutrition row
     out of reach — every date the card could be handed was in the
     future, and a future day has no meals to summarise. */
  /* Render order, Monday-first — `WEEK_STARTS_ON` is 1. */
  const dows = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  /** Today's slot in that Monday-first order. `getDay()` still numbers from
   *  Sunday, so the two disagree by one everywhere: Monday 1 → 0, Sunday
   *  0 → 6. */
  const todayIndex = () => (new Date().getDay() + 6) % 7;

  function labels(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("button")).map(
      (b) => b.getAttribute("aria-label") ?? ""
    );
  }

  function renderStrip() {
    return render(
      <WeekStrip
        dayMap={new Map()}
        profile={makeProfile(makeSchedule(Array(7).fill("rest")))}
        programState={makeProgramState([])}
        claimMap={emptyClaimMap}
        selectedDate={null}
        onDayTap={vi.fn()}
      />
    );
  }

  it("starts on Monday and runs the full calendar week", () => {
    /* Which weekday it starts on is forced by the data model rather than
       chosen: the strip begins at `localWeekKey(today)`, and the resolver
       derives the week key that gates its legacy fallback from the
       window's start. A strip starting on any other day would straddle
       two keys. `WEEK_STARTS_ON` is 1, so that first day is Monday. */
    const { container } = renderStrip();
    const got = labels(container);
    expect(got).toHaveLength(7);
    got.forEach((label, i) => {
      expect(label, `cell ${i}`).toMatch(new RegExp(`^${dows[i]} `));
    });
  });

  it("shows the days already gone, which is the point", () => {
    /* The assertion has to survive being run on a Monday, when the
       current week genuinely has no past day — so it is expressed as
       "exactly the days before today", not "at least one". */
    const { container } = renderStrip();
    const slot = todayIndex();
    const got = labels(container);

    const past = got.slice(0, slot);
    expect(past).toHaveLength(slot);
    for (const label of past) {
      expect(label).not.toMatch(/\(today\)/);
    }
    expect(got[slot]).toMatch(/\(today\)/);
  });

  it("still reaches the end of the week, so a plan stays visible", () => {
    /* The trade this makes: lookahead shrinks from a fixed 6 days to
       whatever is left of the week. Pinned so a future change cannot
       quietly turn the strip into pure history. */
    const { container } = renderStrip();
    const slot = todayIndex();
    const got = labels(container);
    expect(got.slice(slot + 1)).toHaveLength(6 - slot);
    // The last cell is the week's last day — Sunday, under the Monday anchor.
    expect(got[6]).toMatch(/^Sunday /);
  });
});
