"use strict";

/**
 * Hate terms the word filter refuses beyond leo-profanity's English list.
 * The server copy of src/lib/hateTerms.ts, which explains the three kinds;
 * the lists and the rule are pinned equal by
 * src/lib/__tests__/profanityFilterMirror.cross.test.ts.
 */
const HATE_WORDS = Object.freeze([
  "nazi",
  "nazis",
  "neonazi",
  "neonazis",
  "kkk",
  "1488",
]);

const HATE_PHRASES = Object.freeze(["sieg heil", "white power"]);

const HATE_SPELLINGS = Object.freeze([
  "hitler",
  "swastika",
]);

/** Digits and symbols read as the letters they stand in for. */
const LOOKALIKES = Object.freeze({
  0: "o",
  1: "i",
  3: "e",
  4: "a",
  5: "s",
  7: "t",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
});

function containsHateTerm(text) {
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

module.exports = { HATE_WORDS, HATE_PHRASES, HATE_SPELLINGS, containsHateTerm };
