/**
 * Mechanics the app's words already agree on, held at zero.
 *
 * Counted across every string the app can show (`docs/words-2026-11/`):
 * 43 "programme" against 2 "program", 55 "…" against 9 "...", 385
 * contractions, and "Couldn't … Try again." as the shape of an error.
 * Each rule here is the majority the strays broke, so a new string cannot
 * pick the other spelling, the other ellipsis or the other error voice.
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
  text: string;
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
        const text = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "")
          .replace(/&apos;|&rsquo;/g, "'")
          .trim();
        if (!/\s/.test(text) || !/[a-z]{2}/.test(text)) continue;
        hits.push({ file, line: index + 1, text });
      }
    });
  }
  return hits;
}

const STRINGS = copyStrings();

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

  it("gives no generic praise", () => {
    expect(
      offenders(/\b(Nice work|Great job|Well done|Awesome|Amazing)\b/)
    ).toEqual([]);
  });
});
