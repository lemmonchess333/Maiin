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

/**
 * The words in the app's own routes (`path=` in App.tsx). Any other path
 * segment is an id, a name or a slug: another person's uid on
 * `/user/:uid`, an exercise name, a run or post id.
 */
const ROUTE_WORDS = new Set([
  "activity",
  "admin",
  "moderation",
  "dev",
  "badge-seal",
  "brand-bakeoff",
  "break-food",
  "break-social",
  "form-motion-lab",
  "weight-picker",
  "diagnostics",
  "empty-workout",
  "followers",
  "following",
  "food",
  "history",
  "exercise",
  "sessions",
  "log",
  "privacy",
  "program",
  "plan",
  "review",
  "routine",
  "run",
  "run-summary",
  "settings",
  "account",
  "data",
  "health",
  "legacy",
  "lift-plan",
  "notifications",
  "nutrition",
  "pantry",
  "profile",
  "recently-deleted-meals",
  "run-plan",
  "shoes",
  "subscription",
  "support-legal",
  "training",
  "units-appearance",
  "workout-prefs",
  "social",
  "space",
  "post",
  "support",
  "terms",
  "upgrade",
  "user",
  "workout",
]);

/** The route `pathname` is on, with every segment that is not a route word
 *  replaced by `:id`. `/user/abc123` → `/user/:id`. */
export function redactPagePath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) =>
      segment === "" || ROUTE_WORDS.has(segment) ? segment : ":id"
    )
    .join("/");
}

/**
 * The page address an analytics event may carry: the origin and the
 * redacted route, with no query or fragment (a typed search lives in
 * `?q=`). `base` is the app's base path (`/Maiin/` on GitHub Pages), kept
 * as it is.
 */
export function redactPageUrl(href: string, base = "/"): string {
  try {
    const url = new URL(href);
    const root = base.endsWith("/") ? base.slice(0, -1) : base;
    const path =
      root && (url.pathname === root || url.pathname.startsWith(root + "/"))
        ? root + redactPagePath(url.pathname.slice(root.length))
        : redactPagePath(url.pathname);
    return url.origin + path;
  } catch {
    return "";
  }
}

/** The referrer an analytics event may carry: one of the app's own pages,
 *  redacted as above, or only the origin of any other site. */
export function redactPageReferrer(
  referrer: string,
  origin: string,
  base = "/"
): string {
  try {
    const url = new URL(referrer);
    return url.origin === origin
      ? redactPageUrl(referrer, base)
      : url.origin + "/";
  } catch {
    return "";
  }
}
