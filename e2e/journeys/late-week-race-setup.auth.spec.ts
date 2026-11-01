/**
 * A marathon set up late in the week, from about 3 km a run.
 *
 * The owner, 1 November 2026: they had just run 2.85 km, then set up a
 * marathon 25 weeks out on a Sunday evening with every default, and Train
 * said "Week 1/26" and "Due today: Long 12K". Set up the same way now, on
 * the week's last run day (a Saturday: a runner's six days leave Sunday
 * free), the week it is made in is a lead-in (D): that day holds an easy
 * run no longer than the longest run given, Train says when the first week
 * starts, and the race's 25 weeks start on the Monday. The first week's long
 * run comes from the running given at setup (R5), not the race plan's
 * 12 km.
 */
import { test, expect } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  advanceTo,
  deleteAccount,
  nextWeekday,
  openJourney,
  openTab,
  pageErrors,
  plusDays,
  programme,
  setUpPlan,
  signUp,
  type JourneyAccount,
} from "../helpers/journey";
import { resetNodeClock } from "../helpers/nodeClock";
import { plannedSize } from "../helpers/journeyRun";
import { runHeaderLine } from "../../src/lib/runHeaderLine";
import { parseLocalDate } from "../../src/lib/dateHelpers";
import { formatDayMonth } from "../../src/utils/formatters";
import { RUN_TEMPLATES } from "../../src/lib/workoutTemplates";
import { TABS } from "../../src/test/journeyScreens";
import type { ScheduledRunDay } from "../../src/features/program/programTypes";

const typeOf = (run: ScheduledRunDay) =>
  RUN_TEMPLATES.find((t) => t.id === (run.userOverride ?? run.templateId))
    ?.type;

const RACE = { distance: "marathon", targetDate: "" };

test("a marathon set up late in the week, from about 3 km a run", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(10 * 60_000);
  const saturday = nextWeekday(6);
  const monday = plusDays(saturday, 2);
  // A Saturday, 25 weeks after the Monday.
  const raceDay = plusDays(monday, 24 * 7 + 5);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, saturday);
    account = await signUp(page, "lateweek");
    await setUpPlan(page, {
      aim: "Support my running",
      activity: "Running",
      runner: "Occasional runner",
      race: {
        distance: "Full",
        date: raceDay,
        runsPerWeek: 6,
        running: { weekMinutes: 25, longestRun: 25 },
      },
      weightKg: 75,
      heightCm: 178,
      sex: "Male",
      age: "35–44",
    });

    const made = await programme(account.uid);
    // The race's weeks are counted from the Monday: 25, as setup said.
    expect(made.runPlan?.totalWeeks).toBe(25);
    expect(made.runPlan?.leadInWeek).toBe(plusDays(monday, -7));
    const thisWeek = (made.runDays ?? []).filter(
      (run) => run.date && run.date < monday
    );
    // Today's run and nothing before it: easy, no longer than the longest
    // run given.
    expect(thisWeek.map((run) => run.date)).toEqual([saturday]);
    for (const run of thisWeek) {
      expect(typeOf(run), "the lead-in holds easy running").toBe("easy");
      expect(plannedSize(run).minutes).toBeLessThanOrEqual(25);
    }
    // Train says when the first week starts: "Starts Mon 9 Nov" (a
    // browser's en-GB may put a comma after the weekday).
    await openTab(page, TABS.train);
    await expect(
      page.getByText(
        new RegExp(
          `^Race prep · Marathon · Starts \\w+,? ${formatDayMonth(parseLocalDate(monday))}$`
        )
      )
    ).toBeVisible();

    // The Monday: the plan's first week, its long run the Sunday's, from
    // the 25 minutes given.
    const week1 = await advanceTo(page, account, monday);
    expect(week1.runPlan?.currentWeek).toBe(0);
    expect(week1.runPlan?.leadInWeek ?? null).toBeNull();
    const firstWeek = (week1.runDays ?? []).filter(
      (run) => run.date && run.date >= monday
    );
    expect(firstWeek.length).toBeGreaterThan(0);
    for (const run of firstWeek)
      expect(
        plannedSize(run).minutes,
        `${run.date} ${run.templateId}`
      ).toBeLessThanOrEqual(25);
    expect(
      firstWeek.some((run) => run.templateId === "long_12k"),
      "not the race plan's 12 km"
    ).toBe(false);
    await openTab(page, TABS.train);
    await expect(
      page.getByText(
        runHeaderLine({
          runMode: "race_prep",
          raceGoal: { ...RACE, targetDate: raceDay },
          currentWeek: 0,
          totalWeeks: 25,
          runsTarget: 6,
        }),
        { exact: true }
      )
    ).toBeVisible();
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
