/**
 * The day the AI scan quota counts against: the UTC day, for everyone.
 *
 * The server keys each count by the UTC date (`quotaDayKey` in
 * functions/lib/aiScanQuota.js, which allows or refuses the scan), and this
 * is the copy the app reads the count by. Pinned to one day by
 * aiScanQuota.parity.cross.test.ts. Not the person's own date: the only
 * zone the server has is the profile's `timezone`, which the client
 * writes, so a quota keyed on it would start a fresh day whenever the
 * client changed zone.
 *
 * So the count starts again at 00:00 UTC, which is 13:00 in Auckland and
 * 16:00 or 17:00 in California. Anywhere the count is shown, say that time
 * (`nextScanQuotaReset`), not "midnight" and not "today".
 */

/** The UTC date at `now`, as `YYYY-MM-DD`. */
export function scanQuotaDayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The moment the count next starts again: the next 00:00 UTC. */
export function nextScanQuotaReset(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
}
