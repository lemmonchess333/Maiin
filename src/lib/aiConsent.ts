/**
 * Permission before food goes to AI (App Review Guideline 5.1.2(i)).
 *
 * A Pro account's meal photos (Meal and Label scans) and typed meals are
 * sent to Google's Gemini on Vertex AI. Nothing is sent until the person
 * has said yes, and `profile.aiAnalysisEnabled` holds their answer:
 *
 *   undefined — not asked yet. The first AI request asks first
 *               (`AiConsentSheet`), before anything leaves the phone.
 *   true      — allowed.
 *   false     — off. Nothing is sent: a typed meal is read on the phone,
 *               as a free account's is, and the photo tabs say AI analysis
 *               is off, with a way to turn it on. Barcodes are not AI and
 *               work either way.
 *
 * The Settings switch (Social & privacy) shows on only for `true`, and
 * turning it on there counts as the same yes.
 *
 * Server mirror: functions/lib/aiConsent.js refuses analyzeFood and
 * analyzeFoodText for an account whose answer is `false`, with the reason
 * below. The client decides whether to send; the server copy decides
 * whether to answer. Pinned by aiConsent.cross.test.ts.
 */

export type AiConsentStatus = "unasked" | "allowed" | "off";

/** What the stored answer means. `null` is read as not asked, like a
 *  missing field: only an explicit `false` turns analysis off. */
export function aiConsentStatus(
  value: boolean | null | undefined
): AiConsentStatus {
  if (value === true) return "allowed";
  if (value === false) return "off";
  return "unasked";
}

/** The stable reason analyzeFood / analyzeFoodText give when they refuse an
 *  account that has turned AI analysis off (functions/lib/aiConsent.js). */
export const AI_ANALYSIS_OFF_REASON = "ai-analysis-disabled";

/** The plain message for that refusal, where a scan has to say why it
 *  stopped. */
export const AI_ANALYSIS_OFF_MESSAGE =
  "AI food analysis is off. You can turn it on in Settings › Social & privacy.";

/**
 * The question, as the sheet asks it. Each claim here is one the Privacy
 * Policy makes too, and legalCopyClaims.test.ts holds the two together:
 * Google is named as the processor, it does not train on what it is sent,
 * and meal photos are kept only on the phone (retention, not transmission:
 * the photo does go to Google to be analysed).
 */
export const AI_CONSENT_COPY = {
  title: "Send food to Google for analysis?",
  body:
    "To work out what's in a meal and its macros, Tropos sends the photo " +
    "you take, or the meal you type, to Google's Gemini AI. Google doesn't " +
    "use it to train its models, and Tropos keeps photos only on this " +
    "phone. You can change this in Settings › Social & privacy.",
  allow: "Allow",
  decline: "Not now",
} as const;

/** The Settings switch's line. Turning the switch on is the same yes the
 *  sheet asks for, so it says what is sent and to whom. */
export const AI_SWITCH_DESCRIPTION =
  "Sends the meal photos you take and the meals you type to Google's " +
  "Gemini AI, which works out what's in them and their macros. Barcode " +
  "scans don't use it.";
