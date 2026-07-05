/**
 * Coach-voice selection for run audio cues (the "fix voices" pass).
 *
 * The old picker looked for a name containing "Google" first — which exists
 * on desktop Chrome but never inside the iOS WKWebView, so the primary
 * platform fell through to the FIRST en-GB voice, typically the robotic
 * compact "Daniel". This ranks every English voice by quality markers and
 * known-good names so each platform gets its best available voice:
 *
 *  - iOS/macOS: "Enhanced"/"Premium" Siri-class voices (Samantha, Karen,
 *    Serena, Moira, Daniel-Enhanced…) beat their compact defaults.
 *  - Chrome: the network "Google UK English Female/Male" voices.
 *  - Edge: the "… Online (Natural)" neural voices.
 *
 * Pure and unit-testable: takes the plain voice list, returns the winner.
 */

export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
}

/** Known-good voice names, best first (case-insensitive substring match). */
const PREFERRED_NAMES = [
  // Apple enhanced/premium tiers surface these names with a quality suffix.
  "samantha",
  "karen",
  "serena",
  "moira",
  "stephanie",
  "daniel",
  // Chrome network voices.
  "google uk english female",
  "google uk english male",
  "google us english",
];

/** Quality markers that beat any un-marked sibling of the same name. */
const QUALITY_MARKERS = ["natural", "neural", "premium", "enhanced", "siri"];

export function scoreVoice(v: VoiceLike): number {
  const lang = v.lang.toLowerCase().replace("_", "-");
  if (!lang.startsWith("en")) return -1;

  let score = 0;
  // Locale: keep the existing en-GB register first, then en-US, then any en.
  if (lang.startsWith("en-gb")) score += 30;
  else if (lang.startsWith("en-us")) score += 20;
  else score += 10;

  const name = v.name.toLowerCase();
  for (const marker of QUALITY_MARKERS) {
    if (name.includes(marker)) {
      score += 50;
      break;
    }
  }
  const idx = PREFERRED_NAMES.findIndex((n) => name.includes(n));
  if (idx >= 0) score += 25 - idx; // earlier in the list = better

  // "Compact" is Apple's explicitly low-quality tier.
  if (name.includes("compact")) score -= 40;
  return score;
}

/** The best available English coach voice, or null (use the engine default). */
export function pickCoachVoice<T extends VoiceLike>(voices: T[]): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const v of voices) {
    const s = scoreVoice(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return bestScore >= 0 ? best : null;
}
