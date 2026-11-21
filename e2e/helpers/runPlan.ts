/**
 * Run plan asks someone with no running on their plan how much they run
 * before it shows its goal cards (Add running, TrainWk1 step 6). The seeded
 * test user lifts only, so a spec that plans a race on that account answers
 * it first, as the person would.
 */
import { expect, type Page } from "@playwright/test";
import {
  SETUP_OPTIONS,
  SPORT_CHANGE,
  type SetupOption,
} from "../../src/test/journeyScreens";

export async function answerRunningLevelIfAsked(
  page: Page,
  level: SetupOption<"runners"> = SETUP_OPTIONS.runners[1]
): Promise<void> {
  const question = page.getByRole("heading", {
    name: SPORT_CHANGE.addRunningQuestion,
  });
  const cards = page.getByRole("radiogroup", { name: "Running goal" });
  await expect(question.or(cards).first()).toBeVisible({ timeout: 15_000 });
  if (await question.isVisible())
    await page.getByRole("button", { name: new RegExp(`^${level}`) }).click();
  await expect(cards).toBeVisible();
}
