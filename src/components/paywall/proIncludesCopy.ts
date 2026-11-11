import { DAILY_AI_LIMITS } from "@/lib/subscription";

/** What Pro includes, in the words the Pro page lists it, both for
 *  someone deciding (under the demo, before Continue) and for a Pro
 *  member (on their Pro card). One list, so the two cannot drift. Each
 *  line is one of the runtime gates in `proFeatures.ts`. The server caps
 *  Pro scans (`DAILY_AI_LIMITS`), so the photo line names the cap, not
 *  "unlimited". */
export const PRO_INCLUDES: readonly string[] = [
  `AI photo food logging, up to ${DAILY_AI_LIMITS.pro.image_ai} scans a day`,
  "A calorie target that adapts to you",
  "Macros that shift with your training",
];

/** What stays free, said once under the list on the offer. Each is
 *  ungated: the plan and the run tracker read no tier, a typed meal goes
 *  to the on-device parser when there is no Pro (`Food.tsx`), and the
 *  barcode scanner is free on every tier (F2b). */
export const FREE_KEEPS =
  "Free keeps your training plan, run tracking, and typed and barcode food logging.";
