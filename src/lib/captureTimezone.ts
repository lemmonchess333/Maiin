/**
 * Device-timezone capture (#962, push arc epic #961).
 *
 * The `profile.timezone` field is read server-side (scan-quota day-keying, and
 * — once #966 ships — the streak-nudge local-hour scheduling) but was never
 * written by any client. This captures the device IANA timezone on app boot and
 * persists it when it changes, so the server has a non-null tz to schedule
 * against. (The streak-nudge predicate #964 skips users whose tz is null, so an
 * unpopulated field silently disables their time-sensitive pushes.)
 *
 * Pure + side-effect-free here; the AuthProvider does the Firestore write.
 */

/** The device IANA timezone (e.g. "Europe/London"), or null if unavailable. */
export function getDeviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

/**
 * Persist only when we have a real device tz that differs from what's stored —
 * idempotent (no write when unchanged), and never clears a stored value with a
 * null read (SSR / blocked Intl).
 */
export function shouldUpdateTimezone(
  stored: string | null | undefined,
  device: string | null
): boolean {
  return device !== null && device !== stored;
}
