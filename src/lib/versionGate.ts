/**
 * Min-supported-version kill switch (account table-stakes pass, 2026-07).
 *
 * The operator writes `config/client.minSupportedVersion` (a string like
 * "1.3.0") in the Firestore console; clients below it render the blocking
 * upgrade screen instead of the app. Lives in the existing client-readable
 * kill-switch collection (`config/{doc}` — same home as `geminiEnabled`),
 * so no rules change; the deletion-executor switch stays Admin-SDK-only in
 * `system/config`.
 *
 * Why it exists: the web build self-updates, but the native iOS/Android
 * shells don't — once real users hold old binaries, a billing bug, security
 * fix, or breaking Firestore-rules change needs a way to strand outdated
 * clients safely (App Store review lag means "ship a fix" can take days).
 *
 * Fail-open like the deletion kill switch's lock-out defence: missing doc,
 * missing field, unparseable version, or a read error must NEVER block the
 * app — the gate only engages on an explicit, well-formed operator value.
 */

/** "1.2.3" / "v1.2" / "2" → [major, minor, patch]; null when unparseable. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/**
 * True only when BOTH versions parse and `current` sorts strictly below
 * `min`. Any parse failure → false (fail open).
 */
export function isVersionBelow(current: string, min: string): boolean {
  const c = parseVersion(current);
  const m = parseVersion(min);
  if (!c || !m) return false;
  for (let i = 0; i < 3; i++) {
    if (c[i] !== m[i]) return c[i] < m[i];
  }
  return false;
}

/** Shape of the client-readable config doc. */
export interface ClientConfig {
  minSupportedVersion?: unknown;
}

/**
 * Resolve whether `currentVersion` must upgrade, given a raw config-doc
 * value. Tolerates any malformed data (fail open).
 */
export function upgradeRequired(
  currentVersion: string,
  config: ClientConfig | undefined
): boolean {
  const min = config?.minSupportedVersion;
  if (typeof min !== "string" || min.trim() === "") return false;
  return isVersionBelow(currentVersion, min);
}
