/**
 * Hate terms the word filter refuses beyond leo-profanity's English list.
 *
 * The list carries profanity and slurs, not the names and symbols of hate
 * movements, so a Circle could be named "Hitler" and nothing stopped it
 * (App Store Guideline 1.2 asks an app with user-made content to filter
 * objectionable material). leo-profanity also matches whole words between
 * spaces only, so "Hitler's gym" and "nazi-gym" went through even once the
 * word was listed.
 *
 * Three kinds, because one rule for all of them refuses ordinary names:
 *   - WORDS match a whole word once punctuation is taken out ("nazi-gym",
 *     "Nazis!"), never inside another word: "Ashkenazi" is a name.
 *   - PHRASES match whole words in a row. "Heil" alone is a surname and
 *     "white" and "power" are ordinary, so only "sieg heil" and "white
 *     power" are refused, and "white powerlifting belt" is not.
 *   - SPELLINGS are long enough to mean one thing anywhere, so they also
 *     match spaced out, dotted or written with digits for letters
 *     ("h i t l e r", "h.1.t.l.e.r"). A phrase can't be one: squashed,
 *     "white power" is also the start of "white powerlifting".
 *
 * The server keeps the same lists and rule in functions/lib/hateTerms.js,
 * pinned equal by profanityFilterMirror.cross.test.ts.
 */
export const HATE_WORDS: readonly string[] = [
  "nazi",
  "nazis",
  "neonazi",
  "neonazis",
  "kkk",
  "1488",
];

export const HATE_PHRASES: readonly string[] = ["sieg heil", "white power"];

export const HATE_SPELLINGS: readonly string[] = ["hitler", "swastika"];

/** Digits and symbols read as the letters they stand in for. */
const LOOKALIKES: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
};

export function containsHateTerm(text: unknown): boolean {
  if (typeof text !== "string" || !text.trim()) return false;
  const lower = text.normalize("NFKD").toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => HATE_WORDS.includes(w))) return true;
  const spaced = ` ${words.join(" ")} `;
  if (HATE_PHRASES.some((p) => spaced.includes(` ${p} `))) return true;
  const squashed = [...lower]
    .map((c) => LOOKALIKES[c] ?? c)
    .join("")
    .replace(/[^a-z]+/g, "");
  return HATE_SPELLINGS.some((s) => squashed.includes(s));
}
