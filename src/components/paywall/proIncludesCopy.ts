import { DAILY_AI_LIMITS } from "@/lib/dailyAiLimits";

/** What Pro includes, in the words the Pro page lists it, both for
 *  someone deciding (under the demo, before Continue) and for a Pro
 *  member (on their Pro card). One list, so the two cannot drift. Each
 *  line is a runtime Pro gate: the first three are the gates in
 *  `proFeatures.ts`, and the last is the pace insight (`usePaceInsight`),
 *  which a free account never sees and which opens no paywall of its own,
 *  so it has no registry key; so does readiness's sleep and heart
 *  (`useBodySignals`), which reads only for Pro. It was Pro and missing from this list until
 *  13 November 2026. The activity level offer from a week of steps
 *  (`stepsFeedTheTarget`, Q31) is Pro too, and is the calorie target's
 *  line. The server caps Pro scans (`DAILY_AI_LIMITS`), so the
 *  photo line names the cap, not "unlimited". */
const PHOTO_LOGGING = `AI photo food logging, up to ${DAILY_AI_LIMITS.pro.image_ai} scans a day`;
const TRAINING_MACROS = "Macros that shift with your training";
const READINESS = "Readiness from your sleep and heart rate in Apple Health";

export const PRO_INCLUDES: readonly string[] = [
  PHOTO_LOGGING,
  "A calorie target that adapts to you",
  TRAINING_MACROS,
  "Running paces that follow your fitness",
  READINESS,
  "Charts older than 3 months, and your score’s 12-week chart, average and details",
  "Plans for a half marathon or longer, after their first week",
];

/** What Pro does from the first day, for the trial offer that ends setup
 *  (A6): Pro gates that need no history. The calorie target adapts from 14
 *  days of weigh-ins and meals (Q87), past a 7-day trial; readiness needs
 *  7 earlier nights in Apple Health (`MIN_BASELINE_DAYS`, `bodySignals.ts`);
 *  paces wait on races and sessions, and old charts on old data. A typed
 *  meal is read by Gemini for Pro alone (`Food.tsx`'s `handleNLParse`,
 *  the server's `analyzeFoodText`, 15 a day), from the first meal; a free
 *  account's is read on the phone. */
export const PRO_FROM_DAY_ONE: readonly string[] = [
  PHOTO_LOGGING,
  `Meals you type, read by AI, up to ${DAILY_AI_LIMITS.pro.text_ai} a day`,
  TRAINING_MACROS,
];

/** What stays free, said once under the list on the offer. Each is
 *  ungated: the plan and the run tracker read no tier (a plan for a half
 *  marathon or longer past its first week is the one exception, Q85 and
 *  Run27 (18); a 5K or 10K race plan is free), a typed meal goes to the
 *  on-device parser when there is no Pro (`Food.tsx`), and the barcode
 *  scanner is free on every tier (F2b). */
export const FREE_KEEPS =
  "Free keeps your training plan, 5K and 10K race plans, run tracking, and typed and barcode food logging.";
