import { expect, type Page } from "@playwright/test";

/**
 * Waits for Social's Together tab to be the tab, not its skeletons.
 *
 * Circles, Challenges and their leaderboards each draw a grey pulsing
 * block while they read, and those blocks are height-stable for as long
 * as the reads take, so a fixed wait shot them as blank cards: the
 * Circles frames and the races directory's two top cards. This waits on
 * the data instead: until nothing in the Community section pulses.
 */
export async function settleCommunity(page: Page): Promise<void> {
  const community = page.getByRole("region", { name: "Community" });
  await community.waitFor({ state: "visible", timeout: 20_000 });
  await expect(community.locator('[class*="animate-pulse"]')).toHaveCount(0, {
    timeout: 20_000,
  });
}
