/**
 * Keep first-use coach marks out of screenshot captures.
 *
 * Twenty capture specs each carried their own copy of this:
 *
 *   const BASE = "tropos-coach-marks-dismissed";
 *   for (const k of [BASE, `${BASE}:social-find-invite`, ...])
 *     window.localStorage.setItem(k, "1");
 *
 * Two problems with hand-listing the keys, and the second is why this
 * file exists.
 *
 * 1. The lists rot. Several still named `extras-pill-v1`, whose coachmark
 *    was deleted with `HybridWeekRail` in #1882 — inert entries that read
 *    as coverage. Nothing tells a spec its pre-dismissal stopped matching
 *    anything, because a write to an unread key is silent.
 *
 * 2. Dismissals are now scoped per account (`<uid>:<key>`), so a device
 *    shared by two people can't have one person's dismissals silence the
 *    other's coach marks. That is correct for the app and fatal for this
 *    approach: an `addInitScript` runs BEFORE sign-in, so it cannot know
 *    the uid to write under. Every one of those twenty blocks would write
 *    a key nothing reads.
 *
 * So this suppresses by SHAPE instead of by key. `getItem` answers "1"
 * for any key ending in the coach-mark base, whatever account prefix the
 * app puts in front of it. That is honest about what a capture rig
 * actually wants — "no coach marks in this shot, whoever signs in" —
 * which was never really "this account dismissed them".
 *
 * Test-side only: no production code knows this exists, and the patch
 * lives in the page context for the life of the capture run.
 */
import type { Page } from "@playwright/test";

/** The suffix every coach-mark key ends with — see src/hooks/useCoachMarks.ts. */
const COACHMARK_BASE = "tropos-coach-marks-dismissed";

export async function suppressCoachmarks(page: Page): Promise<void> {
  await page.addInitScript((base: string) => {
    try {
      const real = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        // Matches both the unkeyed flag and every `:name` variant, under
        // any `<uid>:` prefix. Deliberately narrow — it keys off the
        // coach-mark base, so nothing else in storage is affected.
        if (key.includes(base)) return "1";
        return real.call(this, key);
      };
    } catch {
      /* storage unavailable — the capture just shows the coachmark */
    }
  }, COACHMARK_BASE);
}
