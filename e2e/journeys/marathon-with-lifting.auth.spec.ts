/**
 * A marathon a year out, with lifting.
 *
 * One person sets up a marathon 52 weeks away with three lift days at the
 * experienced level, then does every planned run and every lift as the
 * weeks come. The journey reads Train where a race block turns:
 *
 * - the first build week, the first to hold a quality session;
 * - a step-back week, whose long run is shorter than the week before's and
 *   where the lifts take their lighter week (Lift4 (9));
 * - the taper, with less running than the block's biggest week;
 * - race week (Lift4 (10)), the race on its day;
 * - the week after, the race's recovery.
 *
 * Each week Train shows the week's label, `liftWeekLabel` on the plan the
 * store holds, and every run of the week under its short name
 * (`runWeekLabel`). The race run is saved on race day, and the server's
 * step on it (recovery entry, `onRunCreated`) runs here (`serverSteps.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "../helpers/emulator";
import {
  advanceTo,
  deleteAccount,
  moveDay,
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
import {
  expectTrainShowsSession,
  fastForwardLift,
} from "../helpers/journeyLift";
import { fastForwardRun, plannedSize } from "../helpers/journeyRun";
import { emulatorAdmin } from "../helpers/realCallables";
import { resetNodeClock } from "../helpers/nodeClock";
import { serverOnRunCreated } from "../helpers/serverSteps";
import { nextUpIndex } from "../../src/features/program/nextUpCursor";
import { getPhaseForWeek } from "../../src/features/program/runPlanTiming";
import type {
  Experience,
  ProgramState,
  ScheduledRunDay,
} from "../../src/features/program/programTypes";
import { liftWeekLabel } from "../../src/lib/liftWeekLabel";
import { RUN_TEMPLATES } from "../../src/lib/workoutTemplates";
import {
  LIFT_WEEK_BANNER,
  RUN_RECOVERY,
  TABS,
  TRAIN,
  runWeekLabel,
  runWeekTabName,
} from "../../src/test/journeyScreens";

/** Weeks from setup's Monday to race week's: a year. */
const WEEKS_TO_RACE = 52;

function templateOf(run: ScheduledRunDay) {
  const template = RUN_TEMPLATES.find(
    (t) => t.id === (run.userOverride ?? run.templateId)
  );
  if (!template) throw new Error(`no run template "${run.templateId}"`);
  return template;
}

/** The week the plan holds, read for the journey's questions. */
function planWeek(state: ProgramState, monday: string) {
  const plan = state.runPlan;
  const runs = (state.runDays ?? []).filter(
    (run) => run.date && run.date >= monday && run.date <= plusDays(monday, 6)
  );
  const types = runs.map((run) => templateOf(run).type);
  const long = runs.find((run) => templateOf(run).type === "long");
  return {
    phase:
      plan?.phase === "recovery"
        ? ("after" as const)
        : getPhaseForWeek(
            plan?.currentWeek ?? 0,
            plan?.totalWeeks ?? 1,
            "marathon"
          ),
    runs,
    quality: types.some((type) => type === "tempo" || type === "intervals"),
    longKm: long ? (templateOf(long).config.targetDistanceKm ?? 0) : null,
    minutes: runs.reduce((sum, run) => sum + plannedSize(run).minutes, 0),
    mainSets: state.workouts[0]?.exercises[0]?.sets ?? 0,
  };
}

/** Train's lift half shows the week's label, and the label says `word`. */
async function expectTrainWeek(
  page: Page,
  state: ProgramState,
  monday: string,
  experience: Experience | undefined,
  word: string
): Promise<void> {
  const label = liftWeekLabel(state, monday, experience);
  expect(label, `Train names the week "${word}"`).toMatch(
    new RegExp(` · ${word}$`)
  );
  await openTab(page, TABS.train);
  await page
    .getByRole("radiogroup", { name: TRAIN.mode })
    .getByRole("radio", { name: TRAIN.lift, exact: true })
    .click();
  await expect(page.getByText(label!, { exact: true })).toBeVisible();
}

/** Train's run half shows every run of the week by its short name. */
async function expectRunWeek(
  page: Page,
  runs: ScheduledRunDay[],
  today: string
): Promise<void> {
  await openTab(page, TABS.train);
  await page
    .getByRole("radiogroup", { name: TRAIN.mode })
    .getByRole("radio", { name: TRAIN.run, exact: true })
    .click();
  const week = page.getByRole("tablist", { name: TRAIN.runWeek });
  for (const run of runs) {
    const name = runWeekTabName(
      runWeekLabel(templateOf(run), "km"),
      run.date === today ? "today" : undefined
    );
    // A day's tab shows its day of the month: a week's easy runs can share
    // a name.
    const day = String(Number(run.date!.slice(8)));
    await expect(
      week
        .getByRole("tab", { name, exact: true })
        .filter({ hasText: new RegExp(`^${day}$`) }),
      `Train's run week shows ${run.date}'s run as "${name}"`
    ).toBeVisible();
  }
}

/** The lift days of the week of `monday`, in order: where the week's
 *  sessions are dated as they are done. */
function liftDays(
  schedule: { day: number; type: string }[],
  monday: string
): string[] {
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((day) =>
      schedule.some(
        (slot) =>
          slot.day === day && (slot.type === "lift" || slot.type === "both")
      )
    )
    .map((day) => plusDays(monday, (day + 6) % 7));
}

test("a marathon a year out, with lifting", async ({ page }) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(30 * 60_000);
  const start = nextWeekday(1);
  const raceDay = plusDays(start, WEEKS_TO_RACE * 7 + 6);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "marathon");
    await setUpPlan(page, {
      aim: "Support my running",
      activity: "Both",
      liftDays: "3",
      liftMinutes: "45 min",
      runner: "Regular runner",
      race: { distance: "Full", date: raceDay, runsPerWeek: 4 },
      equipment: "Full gym",
      experience: "Experienced",
      weightKg: 72,
      heightCm: 178,
      sex: "Male",
      age: "35–44",
    });
    const profile =
      (await emulatorAdmin().db.doc(`users/${account.uid}`).get()).data() ?? {};
    const experience = profile.experience as Experience | undefined;
    const schedule = (profile.weekSchedule ?? []) as {
      day: number;
      type: string;
    }[];

    let previous: ReturnType<typeof planWeek> | null = null;
    let sawQuality = false;
    let peakMinutes = 0;
    const seen = { build: false, stepBack: false, taper: false, race: false };
    let monday = start;
    for (let w = 0; ; w++) {
      expect(w, "the race and its recovery came").toBeLessThan(
        WEEKS_TO_RACE + 3
      );
      const state =
        w === 0
          ? await programme(account.uid)
          : await advanceTo(page, account, monday);
      const week = planWeek(state, monday);

      if (week.phase === "build" && !seen.build) {
        seen.build = true;
        expect(sawQuality, "no quality session before the build").toBe(false);
        expect(week.quality, "the first build week holds one").toBe(true);
        await expectTrainWeek(page, state, monday, experience, "Build");
        await expectRunWeek(page, week.runs, monday);
      } else if (
        seen.build &&
        !seen.stepBack &&
        week.phase === "build" &&
        previous?.longKm &&
        week.longKm !== null &&
        week.longKm < previous.longKm
      ) {
        seen.stepBack = true;
        // The lifts' lighter week falls on the runs' step-back week.
        expect(week.mainSets, "the lighter week's sets").toBeLessThan(
          previous.mainSets
        );
        await expectTrainWeek(page, state, monday, experience, "Lighter week");
        await expect(
          page.getByRole("region", { name: LIFT_WEEK_BANNER.lighter })
        ).toBeVisible();
        await expectTrainShowsSession(page, state.workouts[nextUpIndex(state)]);
        await expectRunWeek(page, week.runs, monday);
      } else if (week.phase === "taper" && !seen.taper) {
        seen.taper = true;
        expect(week.minutes, "less running than the biggest week").toBeLessThan(
          peakMinutes
        );
        await expectTrainWeek(page, state, monday, experience, "Taper");
        await expectRunWeek(page, week.runs, monday);
      } else if (week.phase === "race" && !seen.race) {
        seen.race = true;
        expect(
          week.runs.find((run) => run.date === raceDay),
          "the race on its day"
        ).toBeTruthy();
        await expectTrainWeek(page, state, monday, experience, "Race");
        await expect(
          page.getByRole("region", { name: LIFT_WEEK_BANNER.race })
        ).toBeVisible();
        await expectRunWeek(page, week.runs, monday);
      } else if (week.phase === "after") {
        expect(seen, "every turn of the block on the way").toEqual({
          build: true,
          stepBack: true,
          taper: true,
          race: true,
        });
        expect(
          week.runs.length,
          "the runs go on through recovery"
        ).toBeGreaterThan(0);
        expect(
          week.runs.every((run) => templateOf(run).id === "easy_30"),
          "every run an easy 30 minutes"
        ).toBe(true);
        await expectTrainWeek(page, state, monday, experience, "Recovery");
        await expect(
          page.getByRole("region", { name: LIFT_WEEK_BANNER.recovery })
        ).toBeVisible();
        await expectRunWeek(page, week.runs, monday);
        await expect(page.getByText(RUN_RECOVERY)).toBeVisible();
        break;
      }
      sawQuality ||= week.quality;
      if (week.phase === "build")
        peakMinutes = Math.max(peakMinutes, week.minutes);

      // The week, done: every run on its day, every lift the plan leaves,
      // all logged by Sunday. Race week's plan has already rested the lifts
      // in the race's last days, at the week's turn.
      const sunday = plusDays(monday, 6);
      await moveDay(page, sunday);
      const plan = await programme(account.uid);
      for (const run of planWeek(plan, monday).runs) {
        if (run.status && run.status !== "planned") continue;
        const runId = await fastForwardRun(account, run, plan, "race_prep");
        if (templateOf(run).type === "race")
          await serverOnRunCreated(account.uid, runId);
      }
      const days = liftDays(schedule, monday);
      for (
        let session = 0;
        session < 7 && nextUpIndex(await programme(account.uid)) >= 0;
        session++
      )
        await fastForwardLift(
          account,
          days[Math.min(session, days.length - 1)] ?? sunday
        );

      previous = week;
      monday = plusDays(monday, 7);
    }
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
