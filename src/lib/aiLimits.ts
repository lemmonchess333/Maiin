/**
 * How many AI food reads each tier gets a day, the client's copy of the
 * server's `DAILY_LIMITS` (functions/lib/aiScanQuota.js, pinned by
 * `aiScanQuota.parity.cross.test.ts`). Its own module so a page that only
 * names the number (the website's Food page, the Pro list) carries no
 * account code; `subscription.ts` re-exports it, where the rest of the
 * app reads it.
 */
export const DAILY_AI_LIMITS = {
  free: { text_ai: 0, image_ai: 0 },
  pro: { text_ai: 100, image_ai: 100 },
} as const;
