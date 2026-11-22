/**
 * Agreement before Tropos stores health details (Priv1 call 1).
 *
 * UK GDPR Art 9 makes weight, food, injuries and heart rate special
 * category data, which Tropos stores on the person's explicit consent:
 * asked on its own screen, with its own button, apart from the Terms. A
 * new account is asked in setup before the first body question; an account
 * set up before the question existed is asked once, on its next open,
 * before the app (`HealthConsentGate`).
 *
 * `users/{uid}.healthDataConsent` = `{ at, version }`: when the person
 * agreed, by the server's clock, and to which wording. Changing the words
 * bumps HEALTH_DATA_CONSENT_VERSION, and every account that agreed to an
 * older wording is asked again.
 *
 * Two writers, each held to that one shape:
 *   - setup: `completeOnboarding` writes it from the `healthDataConsent`
 *     the app sends beside the plan, and refuses to finish setup without
 *     it (functions/lib/healthConsent.js);
 *   - the gate: the app writes it through `updateDocGuarded`, and
 *     firestore.rules let the owner set it to `{ at: request.time,
 *     version: 1 }` and nothing else.
 *
 * There is no switch to take it back: withdrawing is deleting the account,
 * which the screen says, and Settings › Social & privacy says again.
 *
 * Server mirror: functions/lib/healthConsent.js reads the stored answer the
 * same way and checks setup's. Pinned by healthConsent.cross.test.ts, which
 * also holds the version in firestore.rules to this one.
 */

/** The wording the app asks for now. A later wording is a higher number. */
export const HEALTH_DATA_CONSENT_VERSION = 1;

/** The stable reason `completeOnboarding` gives when setup arrives without
 *  the agreement (functions/lib/healthConsent.js). The app never sends a
 *  plan without it; an older build that cannot ask meets it. */
export const HEALTH_CONSENT_REQUIRED_REASON = "health-consent-required";

/**
 * Whether a stored `healthDataConsent` is an agreement to the current
 * wording or a later one. `at` is not read: it is the server's time, and
 * until a write made offline reaches the server this device holds it as
 * null, while the agreement is already given.
 */
export function hasCurrentHealthConsent(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const version = (value as { version?: unknown }).version;
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= HEALTH_DATA_CONSENT_VERSION
  );
}

/** When the stored agreement was given, or null while the server has not
 *  stamped it yet (or for no agreement). */
export function healthConsentAgreedAt(value: unknown): Date | null {
  if (!hasCurrentHealthConsent(value)) return null;
  const at = (value as { at?: unknown }).at;
  if (at instanceof Date) return at;
  if (
    typeof at === "object" &&
    at !== null &&
    typeof (at as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (at as { toDate: () => unknown }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

/** What setup sends `completeOnboarding` beside the plan once the person
 *  has agreed: the version of the words they agreed to. The server stamps
 *  the time. */
export function setupHealthConsent(): { version: number } {
  return { version: HEALTH_DATA_CONSENT_VERSION };
}

/**
 * The question, as setup's step and the gate ask it. Legal copy: the owner
 * approves a change to these words, and a change that alters what is
 * agreed to bumps HEALTH_DATA_CONSENT_VERSION.
 */
export const HEALTH_CONSENT_COPY = {
  title: "Your health details",
  stored:
    "Tropos stores your weight, height, injuries, steps, the food you log " +
    "and the heart rate from your runs, and builds your plan and calorie " +
    "target from them.",
  use: "This is health data. Tropos uses it only for your plan, never for ads.",
  withdraw:
    "You can delete all of it at any time by deleting your account in " +
    "Settings › Account. That also withdraws this agreement.",
  agree: "I agree",
  decline: "Not now",
  /** The link to the policy, readable before agreeing. */
  policy: "Privacy Policy",
} as const;

/** What "Not now" opens: why Tropos cannot work without the details, and
 *  every way on from there. */
export const HEALTH_CONSENT_DECLINED_COPY = {
  title: "Your plan needs these details",
  body:
    "Tropos builds your plan and calorie target from your weight, height, " +
    "injuries, steps, food and runs, so it can’t work without them. You " +
    "can go back and agree, sign out, or delete your account.",
  back: "Go back",
  deleteAccount: "Delete my account",
  signOut: "Sign out",
} as const;

/** Said when the gate's agreement could not be saved, or the account not
 *  read again after it. */
export const HEALTH_CONSENT_SAVE_FAILED =
  "Couldn’t save that. Check your connection, then try again.";

/** Said when Sign out, from Not now, did not finish. */
export const SIGN_OUT_FAILED = "Couldn’t sign out. Try again.";

/** Settings › Social & privacy: the one line that says when the person
 *  agreed, and how to withdraw. */
export const HEALTH_CONSENT_SETTINGS_COPY = {
  label: "Health details",
  withdraw: "To withdraw, delete your account.",
} as const;

/** The line under it: the day the account agreed ("Agreed on 21 Nov
 *  2026."), or that it agreed while the server's date is still on its way,
 *  then how to withdraw. Null for an account with no agreement, which the
 *  gate stops before Settings. */
export function healthConsentSettingsLine(
  value: unknown,
  formatDay: (day: Date) => string
): string | null {
  if (!hasCurrentHealthConsent(value)) return null;
  const at = healthConsentAgreedAt(value);
  return `${at ? `Agreed on ${formatDay(at)}.` : "Agreed."} ${HEALTH_CONSENT_SETTINGS_COPY.withdraw}`;
}

/** Where Account's Delete account sits: a link here lands on it. */
export const DELETE_ACCOUNT_ANCHOR = "delete-account";
