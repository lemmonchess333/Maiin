import { describe, expect, it } from "vitest";
import { firstWeekAction, firstWeekPriorityTask } from "../firstWeekAction";
import type { TodaySession } from "../todaySession";
import type {
  WorkoutDay,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { liftTargets, runStartTarget } from "@/lib/todaySession";

const rest: TodaySession = {
  type: "rest",
  restContext: {},
  lift: null,
  run: null,
  rest: { kind: "rest", tomorrow: null },
};

const workout = {
  dayName: "Strength A",
  exercises: [],
} as unknown as WorkoutDay;

const scheduledRun = {
  id: "run:1",
  templateId: RUN_TEMPLATES[0].id,
  status: "planned",
} as ScheduledRunDay;

describe("firstWeekAction", () => {
  it("goes where the session says each card's Start goes", () => {
    // Targets only todaySession could have chosen: the first-week card
    // must read them, not work them out again.
    const session: TodaySession = {
      ...rest,
      type: "both",
      rest: null,
      lift: {
        workout,
        index: 2,
        dayTarget: "/program?day=2&from=session",
        startTarget: "/program?day=2&start=1&from=session",
        isStartable: true,
        status: "planned",
        muscleGroups: "",
      },
      run: {
        runDay: scheduledRun,
        startTarget: "/run?scheduledRunId=from-session&start=1",
        completed: false,
        isFirst: true,
        dose: null,
      },
    };
    expect(firstWeekAction("workout", session).target).toBe(
      "/program?day=2&start=1&from=session"
    );
    expect(firstWeekAction("run", session).target).toBe(
      "/run?scheduledRunId=from-session&start=1"
    );
    expect(
      firstWeekAction("run", {
        ...rest,
        rest: { kind: "free-run", startTarget: "/run?start=1&from=session" },
      }).target
    ).toBe("/run?start=1&from=session");
  });

  it("starts today's workout or run using the same address as its card", () => {
    const both: TodaySession = {
      ...rest,
      type: "both",
      rest: null,
      lift: {
        workout,
        index: 2,
        ...liftTargets(2),
        isStartable: true,
        status: "planned",
        muscleGroups: "",
      },
      run: {
        runDay: scheduledRun,
        startTarget: runStartTarget(scheduledRun),
        completed: false,
        isFirst: true,
        dose: null,
      },
    };
    expect(firstWeekAction("workout", both)).toEqual({
      target: "/program?day=2&start=1",
      mode: "start",
      unlockRunSpeech: false,
    });
    expect(firstWeekAction("run", both)).toEqual({
      target: `/run?template=${scheduledRun.templateId}&scheduledRunId=run%3A1&start=1`,
      mode: "start",
      unlockRunSpeech: true,
    });
    expect(firstWeekPriorityTask(both)).toBe("workout");
    // Home draws the run first for a running aim, and the list follows it.
    expect(firstWeekPriorityTask({ ...both, runFirst: true })).toBe("run");
  });

  it("leads with the startable sport on a run-only hybrid day", () => {
    const runOnly: TodaySession = {
      ...rest,
      type: "run",
      rest: null,
      run: {
        runDay: scheduledRun,
        startTarget: runStartTarget(scheduledRun),
        completed: false,
        isFirst: true,
        dose: null,
      },
    };
    expect(firstWeekPriorityTask(runOnly)).toBe("run");
  });

  it("resumes a saved draft before offering another new session", () => {
    const session: TodaySession = {
      ...rest,
      type: "both",
      rest: null,
      lift: {
        workout,
        index: 0,
        ...liftTargets(0),
        isStartable: true,
        status: "planned",
        muscleGroups: "",
      },
      run: {
        runDay: scheduledRun,
        startTarget: runStartTarget(scheduledRun),
        completed: false,
        isFirst: true,
        dose: null,
        inProgress: {
          sport: "run",
          name: "Easy run",
          sets: null,
          elapsedSeconds: 10,
          resumeTarget: "/run?resume=1",
        },
      },
    };
    expect(firstWeekPriorityTask(session)).toBe("run");
    expect(firstWeekAction("run", session)).toEqual({
      target: "/run?resume=1",
      mode: "resume",
      unlockRunSpeech: true,
    });
  });

  it("keeps race-prep rest days on plan details instead of starting an unscheduled run", () => {
    expect(firstWeekAction("run", rest)).toEqual({
      target: "/program?tab=run",
      mode: "details",
      unlockRunSpeech: false,
    });
    const freeRunner: TodaySession = {
      ...rest,
      rest: { kind: "free-run", startTarget: runStartTarget(null) },
    };
    expect(firstWeekAction("run", freeRunner).target).toBe("/run?start=1");
    const firstLifter: TodaySession = {
      ...rest,
      rest: {
        kind: "first-workout",
        workout,
        index: 0,
        ...liftTargets(0),
        ...liftTargets(0),
      },
    };
    expect(firstWeekAction("workout", firstLifter).target).toBe(
      "/program?day=0&start=1"
    );
  });

  it("opens a terminal session's plan instead of relaunching it", () => {
    const completed: TodaySession = {
      ...rest,
      type: "run",
      rest: null,
      run: {
        runDay: { ...scheduledRun, status: "completed_exact" },
        startTarget: runStartTarget({
          ...scheduledRun,
          status: "completed_exact",
        }),
        completed: true,
        isFirst: false,
        dose: null,
      },
    };
    expect(firstWeekAction("run", completed).mode).toBe("details");
    expect(firstWeekPriorityTask(completed)).toBeNull();
  });
});
