/**
 * Privacy redaction for analytics params.
 *
 * Tropos handles health-sensitive data — food text, GPS tracks, injury
 * notes, email. None of it may reach a third-party analytics provider.
 * Every event flows through `analyticsClient.emit()`, which runs its
 * metadata through `sanitizeAnalyticsParams` here before delivery, so
 * this is the single chokepoint that keeps PII out of analytics even
 * when a future call site is careless about what it passes.
 *
 * Defence is two-layered:
 *   1. Key denylist — drop any key whose name signals PII (email, gps /
 *      coordinates, address, phone, injury/notes free-text, names, uid,
 *      secrets/tokens).
 *   2. Value coercion — only primitives survive. Objects/arrays are
 *      dropped (they can smuggle nested PII), strings are capped at the
 *      GA4 100-char param limit, and any string that looks like an email
 *      / handle (`@`) is dropped outright as a belt-and-braces net for
 *      PII sneaking through under an innocuous key.
 *
 * This is intentionally conservative: losing a borderline-useful dimension
 * is cheaper than leaking a user's email or run route into a dashboard.
 */

/** GA4 caps event param values at 100 chars; we reuse it as the free-text guard. */
const MAX_PARAM_LENGTH = 100;

/**
 * Substrings that, if present in a (lower-cased) key, mark it as PII.
 * Chosen to avoid colliding with the non-PII keys already in use
 * (`platform`, `featureKey`, `selectedPlan`, `source`, `section`, …) —
 * notably no bare `lat`, which would match "platform".
 */
const PII_KEY_TOKENS = [
  "email",
  "mail",
  "gps",
  "latitude",
  "longitude",
  "lng",
  "geo",
  "coord",
  "location",
  "address",
  "postcode",
  "zipcode",
  "phone",
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "credential",
  "injur",
  "rawtext",
  "mealtext",
  "rawmeal",
  "mealname",
  "displayname",
  "fullname",
  "firstname",
  "lastname",
  "username",
  "note",
  "uid",
];

/** Exact (lower-cased) keys to drop that are too short to substring-match safely. */
const PII_EXACT_KEYS = new Set(["lat", "lon"]);

function isPiiKey(key: string): boolean {
  const k = key.toLowerCase();
  if (PII_EXACT_KEYS.has(k)) return true;
  return PII_KEY_TOKENS.some((token) => k.includes(token));
}

/** Returns a delivery-safe value, or `undefined` to signal "drop this key". */
function sanitizeValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.includes("@")) return undefined; // looks like an email / handle
    return value.length > MAX_PARAM_LENGTH
      ? value.slice(0, MAX_PARAM_LENGTH)
      : value;
  }
  // Objects, arrays, null, undefined, functions, symbols, bigints — drop.
  return undefined;
}

/**
 * Strip PII and non-primitive values from an analytics metadata object.
 * Pure — returns a new object, never mutates the input.
 */
export function sanitizeAnalyticsParams(
  metadata: Record<string, unknown>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isPiiKey(key)) continue;
    const clean = sanitizeValue(value);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}
