/**
 * F1b — daily AI scan limits, per action. Mirror of
 * `functions/lib/aiScanQuota.js DAILY_LIMITS`. Both must move
 * together if the lock is renegotiated — pinned by
 * `aiScanQuota.parity.cross.test.ts` (drift fails CI). AI is Pro-only
 * (free=0 for both: the App Store trial is the taste); the Scan
 * Meal CTA on the Food page reads `image_ai.limit === 0` to render an
 * upgrade prompt instead of the camera button for free users.
 */
export const DAILY_AI_LIMITS = {
  free: { text_ai: 0, image_ai: 0 },
  pro: { text_ai: 100, image_ai: 100 },
} as const;
