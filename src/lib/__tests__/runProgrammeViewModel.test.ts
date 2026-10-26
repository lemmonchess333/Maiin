/**
 * runProgrammeViewModel — pure view-model contract for the Programme
 * Run cockpit. Locked 2-state model (Run9a): freeform substrate +
 * optional race-goal overlay. No structured mode.
 */
import { describe, it, expect } from "vitest";
import {
  raceDistanceLabel,
  runStripLabel,
  runStripLines,
  buildRaceCockpitViewModel,
  resolveRunPlanSurface,
  hasHybridInterference,
  runCardStatus,
  defaultRunDayKey,
} from "@/lib/runProgrammeViewModel";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ProgramState } from "@/features/program/programTypes";

const tmpl = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;

describe("raceDistanceLabel", () => {
  it("renders readable labels, not MARATHON machine text", () => {
    expect(raceDistanceLabel("marathon")).toBe("Marathon");
    expect(raceDistanceLabel("half")).toBe("Half Marathon");
    expect(raceDistanceLabel("10k")).toBe("10K");
    expect(raceDistanceLabel("5k")).toBe("5K");
  });
  it("passes through unknown distances unchanged", () => {
    expect(raceDistanceLabel("ultra")).toBe("ultra");
  });
});

describe("runStripLabel", () => {
  // Run21 (2): the week strip names the session. "30m" said neither that a
  // run was easy nor that it ended with strides.
  it("names the session, so an easy run and one with strides read apart", () => {
    expect(runStripLabel(tmpl("easy_30"), "km")).toBe("Easy 30");
    expect(runStripLabel(tmpl("easy_30_strides"), "km")).toBe(
      "Easy 30 + strides"
    );
    expect(runStripLabel(tmpl("tempo_20"), "km")).toBe("20 Min Tempo");
    expect(runStripLabel(tmpl("5x1k"), "km")).toBe("5×1K Intervals");
    expect(runStripLabel(tmpl("long_15k"), "km")).toBe("Long 15K");
    expect(runStripLabel(tmpl("marathon_race"), "km")).toBe("Marathon Race");
  });
  it("falls back to 'Run' when no template", () => {
    expect(runStripLabel(null, "km")).toBe("Run");
  });

  it("names a long run in miles for a reader in miles, and nothing else", () => {
    expect(runStripLabel(tmpl("long_15k"), "mi")).toBe("Long 9.3 mi");
    expect(runStripLabel(tmpl("easy_30"), "mi")).toBe("Easy 30");
    expect(runStripLabel(tmpl("5x1k"), "mi")).toBe("5×1K Intervals");
  });
});

describe("runStripLines", () => {
  // The strip sets a run's name on two lines, each ending in "…" on its own
  // when it doesn't fit, so where the break goes decides what a narrow cell
  // keeps.
  it("breaks where the two lines come out most even", () => {
    expect(runStripLines("Easy 30")).toEqual(["Easy", "30"]);
    expect(runStripLines("20 Min Tempo")).toEqual(["20 Min", "Tempo"]);
    expect(runStripLines("4×1K Intervals")).toEqual(["4×1K", "Intervals"]);
    expect(runStripLines("Long 15K")).toEqual(["Long", "15K"]);
  });
  it("keeps '+ strides' together", () => {
    expect(runStripLines("Easy 30 + strides")).toEqual([
      "Easy 30",
      "+ strides",
    ]);
  });
  it("breaks a hyphenated word after its hyphen", () => {
    expect(runStripLines("Medium-long 60")).toEqual(["Medium-", "long 60"]);
  });
  it("takes the later break on a tie, so a race keeps its own line", () => {
    expect(runStripLines("Half Marathon Race")).toEqual([
      "Half Marathon",
      "Race",
    ]);
  });
  it("keeps a one-word name on one line, and an empty one on none", () => {
    expect(runStripLines("Run")).toEqual(["Run"]);
    expect(runStripLines("")).toEqual([]);
  });
  it("loses nothing of any run's name", () => {
    for (const t of RUN_TEMPLATES) {
      const lines = runStripLines(t.name);
      expect(lines.length, t.name).toBeGreaterThan(0);
      expect(lines.length, t.name).toBeLessThanOrEqual(2);
      const [a, b] = lines;
      const rejoined =
        b === undefined ? a : a.endsWith("-") ? a + b : `${a} ${b}`;
      expect(rejoined).toBe(t.name);
    }
  });
});

describe("resolveRunPlanSurface", () => {
  it("is freeform with no race goal", () => {
    expect(resolveRunPlanSurface({ runMode: "freeform" }, null)).toEqual({
      kind: "freeform",
      hasRaceGoal: false,
    });
  });
  it("is race_goal only when race_prep AND a goal exists", () => {
    const ps = {
      runPlan: { raceGoal: { distance: "10k", targetDate: "2027-01-01" } },
    } as ProgramState;
    expect(resolveRunPlanSurface({ runMode: "race_prep" }, ps)).toEqual({
      kind: "race_goal",
      hasRaceGoal: true,
    });
  });
  it("a legacy structured user collapses to freeform (no structured surface)", () => {
    expect(
      resolveRunPlanSurface({ runMode: "structured" as never }, null)
    ).toEqual({ kind: "freeform", hasRaceGoal: false });
  });
});

describe("buildRaceCockpitViewModel", () => {
  it("returns null without a race goal", () => {
    expect(
      buildRaceCockpitViewModel({
        raceGoal: null,
        currentWeek: 0,
        totalWeeks: 12,
        compressed: false,
        todayKey: "2026-05-30",
      })
    ).toBeNull();
  });

  it("computes days-out and phase from week/total", () => {
    const vm = buildRaceCockpitViewModel({
      raceGoal: { distance: "marathon", targetDate: "2026-06-09" },
      currentWeek: 0,
      totalWeeks: 12,
      compressed: false,
      todayKey: "2026-05-30",
    })!;
    expect(vm.distanceLabel).toBe("Marathon");
    expect(vm.daysToRace).toBe(10);
    expect(vm.currentWeek).toBe(0);
    expect(vm.totalWeeks).toBe(12);
    // Week 0 of a 12-week marathon is the Base phase.
    expect(vm.phaseLabel).toBe("Base");
  });

  it("never returns a negative countdown for a past race", () => {
    const vm = buildRaceCockpitViewModel({
      raceGoal: { distance: "10k", targetDate: "2026-05-01" },
      currentWeek: 5,
      totalWeeks: 6,
      compressed: true,
      todayKey: "2026-05-30",
    })!;
    expect(vm.daysToRace).toBe(0);
    expect(vm.compressed).toBe(true);
  });

  /**
   * `belowFloor` never reached the cockpit until 2026-08-04, so a
   * finish-safely plan sat under the COMPRESSED copy — which promises
   * "interval work trimmed and the long-run progression shortened". A
   * below-floor plan has no long-run progression: measured, a marathon 3
   * weeks out emits `easy_30` x3 in every non-race week. The card described
   * training the plan did not contain, permanently, while the honest wording
   * existed only in the transient realign toast.
   */
  it("carries belowFloor so the card can say something different", () => {
    const vm = buildRaceCockpitViewModel({
      raceGoal: { distance: "marathon", targetDate: "2026-06-20" },
      currentWeek: 0,
      totalWeeks: 3,
      compressed: true,
      belowFloor: true,
      todayKey: "2026-05-30",
    })!;
    // Both, not either: belowFloor IMPLIES compressed, and a consumer that
    // switched on compressed alone is exactly what produced the wrong copy.
    expect(vm.compressed).toBe(true);
    expect(vm.belowFloor).toBe(true);
  });

  it("defaults belowFloor to false when the caller does not know", () => {
    // A caller that omits it cannot claim the plan is below the floor. The
    // degenerate answer is the safe one — show the compressed copy, not the
    // finish-safely one.
    const vm = buildRaceCockpitViewModel({
      raceGoal: { distance: "half", targetDate: "2026-06-20" },
      currentWeek: 1,
      totalWeeks: 8,
      compressed: true,
      todayKey: "2026-05-30",
    })!;
    expect(vm.belowFloor).toBe(false);
  });
});

describe("hasHybridInterference (scheduler's 'UI can flag it' note, wired)", () => {
  it("flags quality runs sharing a day with a lift", () => {
    for (const runType of ["tempo", "intervals", "long"] as const) {
      expect(hasHybridInterference({ hasLift: true, runType })).toBe(true);
    }
  });

  it("never flags easy runs, race day, run-only or lift-only days", () => {
    expect(hasHybridInterference({ hasLift: true, runType: "easy" })).toBe(
      false
    );
    expect(hasHybridInterference({ hasLift: true, runType: "race" })).toBe(
      false
    );
    expect(hasHybridInterference({ hasLift: false, runType: "long" })).toBe(
      false
    );
    expect(hasHybridInterference({ hasLift: true, runType: null })).toBe(false);
  });
});

describe("runCardStatus", () => {
  // A week from Monday 19 October: runs on Tuesday, Wednesday and Saturday.
  const keys = { today: "2026-10-19", tomorrow: "2026-10-20" };
  const day = (
    dateKey: string,
    run: "none" | "to do" | "done" | "skipped" = "none"
  ) => ({
    dateKey,
    run: {
      runDay: run === "none" ? null : { id: dateKey },
      isCompleted: run === "done",
      isTerminal: run === "done" || run === "skipped",
    },
  });
  const week = [
    day("2026-10-19"),
    day("2026-10-20", "to do"),
    day("2026-10-21", "to do"),
    day("2026-10-22"),
    day("2026-10-23"),
    day("2026-10-24", "to do"),
    day("2026-10-25"),
  ];

  /* Tomorrow's run is "Up next" when nothing comes before it, as the Lift
     tab's next session is: the tab opens on it from a lift or rest day,
     and its eyebrow reads "Up next · Tue 20 Oct". It said "Tomorrow". */
  it("says Up next for one run only: the first still to do", () => {
    expect(runCardStatus("2026-10-20", keys, week)).toBe("Up next");
    expect(runCardStatus("2026-10-21", keys, week)).toBe("Upcoming");
    expect(runCardStatus("2026-10-24", keys, week)).toBe("Upcoming");
  });

  it("says Tomorrow when today's run still comes first", () => {
    const today = [day("2026-10-19", "to do"), ...week.slice(1)];
    expect(runCardStatus("2026-10-20", keys, today)).toBe("Tomorrow");
  });

  it("gives Up next to a later run when nothing comes before it", () => {
    const later = [
      day("2026-10-19"),
      day("2026-10-20"),
      day("2026-10-21"),
      day("2026-10-22", "to do"),
      day("2026-10-23"),
      day("2026-10-24", "to do"),
    ];
    expect(runCardStatus("2026-10-22", keys, later)).toBe("Up next");
    expect(runCardStatus("2026-10-24", keys, later)).toBe("Upcoming");
  });

  it("passes over runs already done or skipped", () => {
    const cleared = [
      day("2026-10-19", "done"),
      day("2026-10-20"),
      day("2026-10-21", "skipped"),
      day("2026-10-22", "to do"),
    ];
    expect(runCardStatus("2026-10-22", keys, cleared)).toBe("Up next");
  });

  it("counts today's run still to do as the one up next", () => {
    const today = [day("2026-10-19", "to do"), ...week.slice(1)];
    expect(runCardStatus("2026-10-19", keys, today)).toBe("Due today");
    expect(runCardStatus("2026-10-21", keys, today)).toBe("Upcoming");
  });

  it("leaves a missed run from earlier in the week out of it", () => {
    const missed = [
      day("2026-10-17", "to do"),
      day("2026-10-19"),
      day("2026-10-20"),
      day("2026-10-21", "to do"),
    ];
    expect(runCardStatus("2026-10-17", keys, missed)).toBe("Pending");
    expect(runCardStatus("2026-10-21", keys, missed)).toBe("Up next");
  });
});

describe("defaultRunDayKey", () => {
  const today = "2026-10-19";
  const day = (
    dateKey: string,
    run: "none" | "to do" | "done" | "skipped" = "none"
  ) => ({
    dateKey,
    run: {
      isStartable: run === "to do",
      isCompleted: run === "done",
    },
  });

  it("opens on today when today holds a run to start", () => {
    const week = [day("2026-10-19", "to do"), day("2026-10-20", "to do")];
    expect(defaultRunDayKey(week, today)).toBe(today);
  });

  /* A lift day or a rest day opened on a small "No run scheduled" card
     while the week's next run sat a tap away. The tab opens on that run,
     as the Lift tab opens on its next session. */
  it("opens on the next run to start when today has none", () => {
    const week = [
      day("2026-10-19"),
      day("2026-10-20"),
      day("2026-10-21", "to do"),
      day("2026-10-24", "to do"),
    ];
    expect(defaultRunDayKey(week, today)).toBe("2026-10-21");
  });

  it("passes over today's run once it is done, and earlier days", () => {
    const week = [
      day("2026-10-17", "to do"),
      day("2026-10-19", "done"),
      day("2026-10-20", "skipped"),
      day("2026-10-22", "to do"),
    ];
    expect(defaultRunDayKey(week, today)).toBe("2026-10-22");
  });

  it("stays on today when the rest of the week has no run", () => {
    const week = [day("2026-10-17", "to do"), day("2026-10-19")];
    expect(defaultRunDayKey(week, today)).toBe(today);
  });
});
