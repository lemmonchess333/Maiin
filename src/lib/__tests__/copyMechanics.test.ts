/**
 * Mechanics the app's words already agree on, held at zero.
 *
 * Counted across every string the app can show (`docs/words-2026-11/`):
 * 43 "programme" against 2 "program", 55 "…" against 9 "...", 385
 * contractions, and "Couldn’t … Try again." as the shape of an error.
 * Each rule here is the majority the strays broke, so a new string cannot
 * pick the other spelling, the other ellipsis or the other error voice.
 * The apostrophe is the one rule the owner set against the majority
 * (Words1 call 1): ’ in every string the app shows.
 *
 * It reads string literals and JSX text that hold a space, which is where
 * copy lives, and skips a line that logs, throws or imports. A rule with
 * exceptions names them with the reason.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";

const ROOT = process.cwd();
const FILES = globSync("src/**/*.{ts,tsx}", {
  cwd: ROOT,
  ignore: ["**/__tests__/**", "**/*.test.*", "src/test/**", "src/pages/dev/**"],
});

const LITERAL =
  /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|>([^<>{}=;]+)</g;
const NOT_COPY = /\bthrow |new \w*Error\(|^\s*import |className=|\bcn\(/;

/** Comments and log calls blanked out, line for line, so a line number
 *  still points at the source. A log call's text is for whoever reads the
 *  console, and it often sits on the line after the call. */
function withoutCommentsAndLogs(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (line, lead: string) => lead + blank(line.slice(lead.length))
    )
    .replace(/\b(logger|console)\.\w+\([\s\S]*?\);/g, blank);
}

interface Hit {
  file: string;
  line: number;
  /** With an apostrophe written one way, so a rule about words reads both. */
  text: string;
  /** As the source has it. */
  raw: string;
}

function copyStrings(): Hit[] {
  const hits: Hit[] = [];
  for (const file of FILES) {
    const lines = withoutCommentsAndLogs(
      readFileSync(join(ROOT, file), "utf8")
    ).split("\n");
    lines.forEach((source, index) => {
      if (NOT_COPY.test(source)) return;
      for (const match of source.matchAll(LITERAL)) {
        const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
        const text = raw.replace(/&apos;|&rsquo;/g, "'").trim();
        hits.push({ file, line: index + 1, text, raw });
      }
    });
  }
  return hits;
}

/** Every literal on a line that is not a log, a throw or an import. */
const LITERALS = copyStrings();
/** The ones that hold a space, which is where copy lives. */
const STRINGS = LITERALS.filter(
  (hit) => /\s/.test(hit.text) && /[a-z]{2}/.test(hit.text)
);

/** The exercise, template, shoe, food, race and Space libraries and the
 *  spoken run cues. Words1 left their text as it is, and a name in them is
 *  an identity: "Farmer's Carry" is saved in people's history and held by
 *  the server's catalogue under that spelling. */
const CONTENT_LIBRARIES = [
  "lib/releasedFormPlacards.ts",
  "lib/exercises.ts",
  "lib/shoeDatabase.ts",
  "lib/workoutTemplates.ts",
  "lib/exerciseDemo.ts",
  "lib/runCueCopy.ts",
  "lib/guidedRun.ts",
  "lib/funComparisons.ts",
  "lib/foodDatabase.ts",
  "lib/commonFoods.ts",
  "lib/runSegments.ts",
  "lib/coachPrompts.ts",
  "lib/raceEvents",
  "features/program/injurySubstitutions.ts",
  "features/program/variationBank.ts",
  "features/program/templates.ts",
  "features/program/programEngine.ts",
  "features/spaces/spaceDefs.ts",
  "features/streaks/badges.ts",
  "components/paywall/ScanDemo.tsx",
  "components/paywall/ProDemoVideo.tsx",
  "components/paywall/ProPreview.tsx",
  "src/data/",
] as const;

function offenders(pattern: RegExp, allowed: readonly string[] = []): string[] {
  return STRINGS.filter(
    (hit) =>
      pattern.test(hit.text) && !allowed.some((f) => hit.file.endsWith(f))
  ).map((hit) => `${hit.file}:${hit.line} ${hit.text}`);
}

describe("copy mechanics", () => {
  it("finds the app's copy", () => {
    // A scan that reads nothing passes every rule below.
    expect(STRINGS.length).toBeGreaterThan(3000);
  });

  it("writes an ellipsis as one character", () => {
    expect(offenders(/[A-Za-z]\.\.\./)).toEqual([]);
  });

  it("spells as the rest of the app does: programme, analyse, fibre", () => {
    expect(
      offenders(
        /\b[Pp]rograms?\b(?!me)|\b[Aa]nalyz(e|ed|es|ing)\b|\b[Ff]iber\b/
      )
    ).toEqual([]);
  });

  it("reports a failure as what couldn't be done, with no 'we'", () => {
    expect(
      offenders(/\bWe couldn['’]t\b|\b[Ff]ailed to\b|\b\w+ failed\b/, [
        // The moderation queue is an operator's screen, not the app's voice.
        "pages/AdminModeration.tsx",
        // Browser error text matched to spot a stale chunk, never shown.
        "lib/lazyRetry.ts",
        // Lines for the hidden Diagnostics page, read by an operator.
        "lib/appCheckNative.ts",
        "lib/purchaseProvider.ts",
      ])
    ).toEqual([]);
  });

  it("writes an apostrophe curly: ’, not ' or &apos;", () => {
    const straight = /[A-Za-z0-9](?:'|\\'|&apos;|&#39;)[A-Za-z]/;
    expect(
      // One word counts too ("Don’t"): nothing but copy holds a letter,
      // an apostrophe and a letter.
      LITERALS.filter(
        (hit) =>
          straight.test(hit.raw) &&
          !CONTENT_LIBRARIES.some((f) => hit.file.includes(f))
      ).map((hit) => `${hit.file}:${hit.line} ${hit.raw.trim()}`)
    ).toEqual([]);
  });

  it("gives no generic praise", () => {
    expect(
      offenders(/\b(Nice work|Great job|Well done|Awesome|Amazing)\b/)
    ).toEqual([]);
  });
});
