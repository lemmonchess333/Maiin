/**
 * Sentence case, everywhere except a closed list.
 *
 * The rule and the reasoning live in `docs/voice-and-tone.md`; this holds
 * it. Without a guard the convention decays the way it did before: the
 * 2026-09-07 sweep found the same ROLE in both registers — `Start Run`
 * and `Block user` were both buttons, `Height Unit` and `Body weight
 * unit` were both settings rows — because nothing stopped a new string
 * picking either.
 *
 * The check is deliberately narrow. It looks at short, static, wholly
 * alphabetic phrases in the places a label lives: a JSX text node, or a
 * `title` / `label` / `placeholder` / `aria-label` / `sublabel` prop. It
 * does not touch body copy, interpolated strings, or anything with
 * punctuation it cannot reason about — a false positive here costs more
 * than a missed one, because the cost is a contributor deleting the test.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "src");

/**
 * Named things, not important things. Adding a row is a deliberate act —
 * see the table in `docs/voice-and-tone.md`, which this mirrors.
 */
const NAMED = [
  "Performance Index",
  "Progress Vault",
  "Weekly Review",
  "Together",
  "Explore",
  "Privacy Policy",
  "Terms of Service",
  "Apple Health",
  "London Marathon",
];

/** Words that carry their own capital wherever they appear. */
const PROPER = new Set(
  `Tropos Pro Apple Google Stripe Firebase iOS Android Strava Garmin Nike
   HealthKit RevenueCat Gemini VoiceOver PWA GPS GPX TDEE PI PR PRs AI App Store
   Health
   Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February
   March April May June July August September October November December
   I I'm I've`.split(/\s+/)
);

/** Never capitalised mid-phrase, so they don't count towards Title Case. */
const SMALL = new Set(
  "a an and are as at be by for from in is it of on or the to vs with your you".split(
    " "
  )
);

/** Surfaces that are not product copy: dev labs, operator diagnostics, legal prose. */
const EXCLUDED = [
  "/dev/",
  "Diagnostics.tsx",
  "PrivacyPolicy.tsx",
  "TermsOfService.tsx",
  "__tests__",
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (EXCLUDED.some((k) => p.includes(k))) continue;
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * True when a phrase capitalises words it has no reason to — i.e. every
 * non-small word starts with a capital and at least one of them is not a
 * proper noun. Single words can't be Title Case, so they never fail.
 */
export function isTitleCase(phrase: string): boolean {
  /* `Label: Value` is two clauses, and a capital opening a clause is
     justified — "Momentum: High" is not Title Case. Judge each clause on
     its own; the phrase fails only if one of them does. */
  if (phrase.includes(":")) {
    return phrase
      .split(":")
      .some((clause) => clause.trim() && isTitleCase(clause.trim()));
  }
  const words = phrase
    .trim()
    .split(/[\s/]+/)
    /* Strip edge punctuation BEFORE the alphabetic test. Without this a
       trailing bracket dropped the word entirely, so "Notes (e.g. Level 8,
       6.0 incline)" lost `incline)` and read as fully capitalised. */
    .map((w) => w.replace(/^[^A-Za-z]+|[^A-Za-z'’]+$/g, ""))
    .filter((w) => /^[A-Za-z][A-Za-z'’]*$/.test(w));
  if (words.length < 2) return false;
  /* An ALL-CAPS phrase is an uppercase label (a SectionLabel renders these)
     — a different register, not Title Case. */
  if (words.every((w) => w === w.toUpperCase())) return false;
  const unjustified = words.slice(1).filter(
    (w) =>
      /^[A-Z]/.test(w) &&
      !PROPER.has(w) &&
      /* An ALL-CAPS token is an acronym or a literal the user types
           ("Type DELETE"), never an unjustified capital. */
      w !== w.toUpperCase()
  );
  if (unjustified.length === 0) return false;
  const significant = words.filter((w) => !SMALL.has(w.toLowerCase()));
  return significant.length >= 2 && significant.every((w) => /^[A-Z]/.test(w));
}

const TEXT_NODE = />\s*([A-Za-z][A-Za-z0-9 '’,.!?&/()-]{3,70}?)\s*</g;
const LABEL_PROP =
  /\b(?:title|label|placeholder|aria-label|sublabel|heading)\s*=\s*"([^"{}]{4,70})"/g;

function offenders(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const re of [TEXT_NODE, LABEL_PROP]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const phrase = m[1].trim();
        if (!phrase || NAMED.some((n) => phrase.includes(n))) continue;
        if (!isTitleCase(phrase)) continue;
        const line = src.slice(0, m.index).split("\n").length;
        found.push(
          `${relative(ROOT, file)}:${line}  ${JSON.stringify(phrase)}`
        );
      }
    }
  }
  return [...new Set(found)].sort();
}

describe("user-facing copy is sentence case", () => {
  it("classifies phrases the way the rule describes", () => {
    /* The detector is the whole test, so it is checked directly rather
       than only through its verdict on the tree. */
    expect(isTitleCase("Delete Account")).toBe(true);
    expect(isTitleCase("Weight Trend")).toBe(true);
    expect(isTitleCase("Delete account")).toBe(false);
    expect(isTitleCase("Back to run")).toBe(false);
    // A capital that a proper noun earns is not Title Case.
    expect(isTitleCase("Connect Apple Health")).toBe(false);
    expect(isTitleCase("Sign out")).toBe(false);
    // One word cannot be Title Case.
    expect(isTitleCase("Settings")).toBe(false);
    // An uppercase label is its own register — SectionLabel renders these,
    // and "DELETE" is a literal the user types.
    expect(isTitleCase("YOUR FIRST LIFT")).toBe(false);
    expect(isTitleCase("Type DELETE")).toBe(false);
    // Edge punctuation must not discard the word it clings to.
    expect(isTitleCase("Notes (e.g. Level 8, 6.0 incline)")).toBe(false);
    // `Label: Value` — the capital opens a clause, so it is justified.
    // These are also mirrored in functions/lib/perfScoring.js and stored
    // on the performance doc, so a "fix" here would diverge the two and
    // make a user's own history read inconsistently.
    expect(isTitleCase("Momentum: High")).toBe(false);
    expect(isTitleCase("Momentum: Stable")).toBe(false);
    // A clause that IS Title Case still fails, so the split is not an escape.
    expect(isTitleCase("Weekly Summary: your week")).toBe(true);
  });

  it("no Title Case labels outside the closed list", () => {
    const bad = offenders();
    expect(
      bad,
      bad.length === 0
        ? ""
        : `Title Case in user-facing copy. Sentence case is the rule — see ` +
            `the Capitalisation section of docs/voice-and-tone.md. If the ` +
            `phrase is genuinely the NAME of something, add it to NAMED ` +
            `here and to the table in that doc, in the same commit.\n` +
            bad.join("\n")
    ).toEqual([]);
  });
});
