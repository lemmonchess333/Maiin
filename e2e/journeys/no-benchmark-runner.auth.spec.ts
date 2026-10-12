/**
 * A runner with no benchmark, through every surface that explains a planned
 * run before it is run.
 *
 * A regular runner sets up a 10K thirteen weeks out and gives setup no
 * recent race time, so the app has no pace of theirs to work from. The
 * journey reads each surface Run21 (and Run20 (1)) set for a planned run:
 *
 * - Home's card states the run's own dose: a long run's distance with no
 *   minutes, which only a confirmed pace can give, and a timed run its time
 *   (E6);
 * - Train's week names each day's run (E2a), and its card gives the run one
 *   feel line, its effort word first (E2c, E1);
 * - "Why this run" says what it is, how it should feel, why it's in the week
 *   and what to do if it feels wrong, then what coaches also call it (E3,
 *   E2c);
 * - no pace anywhere: with no benchmark the sessions say how they feel
 *   instead (R2), on Train, on Home and on the Run page's launch card;
 * - the first quality session, in the build, said the same way.
 *
 * Every line the journey expects comes from the function that writes it
 * (`runSessionName`, `runSessionAbout`, `runDoseLine`, `runWeekLabel`), on
 * the run the plan holds. The run summary's verdict (E9) has no pace to
 * judge without a benchmark (`plannedRunVerdict`), so it stays with its own
 * tests.
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
import { resetNodeClock } from "../helpers/nodeClock";
import type { ScheduledRunDay } from "../../src/features/program/programTypes";
import { runDoseLine } from "../../src/lib/runDose";
import { runSessionAbout, runSessionName } from "../../src/lib/runSessionAbout";
import { RUN_TEMPLATES } from "../../src/lib/workoutTemplates";
import {
  RUN,
  RUN_ABOUT,
  TABS,
  TRAIN,
  runWeekLabel,
  runWeekTabName,
} from "../../src/test/journeyScreens";

function templateOf(run: ScheduledRunDay) {
  const template = RUN_TEMPLATES.find(
    (t) => t.id === (run.userOverride ?? run.templateId)
  );
  if (!template) throw new Error(`no run template "${run.templateId}"`);
  return template;
}

const isQuality = (run: ScheduledRunDay) =>
  ["tempo", "intervals"].includes(templateOf(run).type);

/** Any pace on screen: "5:20 /km", "8:35 /mi". */
const PACE = /\d+:\d\d\s?\/(km|mi)/;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Train's run half, with `run`'s day selected: today, in this journey. */
async function openTrainRun(page: Page): Promise<void> {
  await openTab(page, TABS.train);
  await page
    .getByRole("radiogroup", { name: TRAIN.mode })
    .getByRole("radio", { name: TRAIN.run, exact: true })
    .click();
}

/** What Train says about today's run: its name on the week, its one feel
 *  line on the card, "Why this run" in its parts, and no pace. The plan
 *  says why each of its runs is in the week; the physiology name shows
 *  where coaches use one. */
async function expectTrainExplains(
  page: Page,
  run: ScheduledRunDay
): Promise<void> {
  const template = templateOf(run);
  const about = runSessionAbout(template);
  const parts = [
    RUN_ABOUT.what,
    RUN_ABOUT.feel,
    RUN_ABOUT.why,
    RUN_ABOUT.ifWrong,
    ...(about.alsoCalled ? [RUN_ABOUT.alsoCalled] : []),
  ];
  await openTrainRun(page);
  await expect(
    page.getByRole("tablist", { name: TRAIN.runWeek }).getByRole("tab", {
      name: runWeekTabName(runWeekLabel(template), "today"),
      exact: true,
    })
  ).toBeVisible();
  const card = page.getByRole("region", {
    name: new RegExp(`— ${runSessionName(template)}$`),
  });
  await expect(card.getByRole("heading", { level: 3 })).toHaveText(
    runSessionName(template)
  );
  await expect(
    card.getByText(about.feel, { exact: true }),
    "the run's one feel line"
  ).toHaveCount(1);
  await page.getByText(RUN_ABOUT.open, { exact: true }).click();
  await expect(page.getByRole("term")).toHaveText(parts);
  await expect(
    page.getByRole("definition").filter({ hasText: about.feel })
  ).toHaveCount(1);
  await expect(page.getByText(PACE), "no pace on Train").toHaveCount(0);
}

test("a runner with no benchmark, through every surface that explains a planned run", async ({
  page,
}) => {
  test.skip(!emulatorActive, "needs the local emulators");
  test.setTimeout(10 * 60_000);
  const start = nextWeekday(1);
  let account: JourneyAccount | null = null;
  try {
    await openJourney(page, start);
    account = await signUp(page, "nobench");
    await setUpPlan(page, {
      aim: "Support my running",
      activity: "Running",
      runner: "Regular runner",
      race: {
        distance: "10K",
        date: plusDays(start, 12 * 7 + 5),
        runsPerWeek: 4,
      },
      weightKg: 70,
      heightCm: 175,
      sex: "Male",
      age: "25–34",
    });
    const profile = await programme(account.uid);
    // The first week's long run. Setup's default week gives it a weekend
    // day (Run20 (2)), so the journey moves the day to it.
    const first = profile.runDays?.find(
      (run) =>
        run.date !== undefined &&
        run.date >= start &&
        templateOf(run).type === "long"
    );
    expect(first, "the first week holds a long run").toBeTruthy();
    await moveDay(page, first!.date!);

    // Home: the long run, by name, with its distance and no minutes: no
    // pace of the runner's own to give them from.
    await openTab(page, TABS.home);
    const long = templateOf(first!);
    const longDose = runDoseLine(long, null);
    expect(longDose, "a long run's dose with no pace").not.toMatch(/min/);
    await expect(
      page.getByText(runSessionName(long), { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText(longDose, { exact: true })).toBeVisible();
    await expect(page.getByText(PACE), "no pace on Home").toHaveCount(0);

    await expectTrainExplains(page, first!);

    // On to the first week with a quality session, and to its day.
    let monday = start;
    let quality: ScheduledRunDay | undefined;
    for (let week = 1; week < 12 && !quality; week++) {
      monday = plusDays(start, week * 7);
      const state = await advanceTo(page, account, monday);
      quality = state.runDays?.find(isQuality);
    }
    expect(quality, "the build brings a quality session").toBeTruthy();
    await moveDay(page, quality!.date!);
    const session = templateOf(quality!);

    // Home: its name and its time, the prescription.
    await openTab(page, TABS.home);
    await expect(
      page.getByText(runSessionName(session), { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText(runDoseLine(session, null), { exact: true })
    ).toBeVisible();
    await expect(page.getByText(PACE), "no pace on Home").toHaveCount(0);

    await expectTrainExplains(page, quality!);

    // The Run page's launch card: the session by name and its one feel line,
    // where a pace would be with one.
    await openTab(page, TABS.home);
    await page
      .getByRole("button", { name: RUN.homeStart, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: runSessionName(session), level: 1 })
    ).toBeVisible();
    // One line says how it should feel, its effort word first (E2c). R2's
    // own effort line beside it said the same thing again ("Hard, and even
    // across every rep" over "Hard, and even: …"). "Why this run" repeats
    // the feel line inside, one tap away, in its own list.
    const feel = runSessionAbout(session).feel;
    const effortWord = feel.split(/[,:]/)[0];
    await expect(
      page.getByText(feel, { exact: true }).and(page.locator("p")),
      "the session's feel line"
    ).toHaveCount(1);
    await expect(
      page
        .locator("p")
        .filter({ hasText: new RegExp(`^${escapeRegExp(effortWord)}\\b`) }),
      `one line on the card says "${effortWord}"`
    ).toHaveCount(1);
    await expect(
      page.getByText(PACE),
      "no pace on the launch card"
    ).toHaveCount(0);
    expect(pageErrors(page), "no error on the page").toEqual([]);
  } finally {
    resetNodeClock();
    if (account) await deleteAccount(page, account);
  }
});
