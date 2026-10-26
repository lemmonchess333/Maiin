/**
 * No "please" in anything Tropos says.
 *
 * The house voice states what happened and what to do next: "Couldn't
 * save. Try again.", "Sign in again to log food." A "please" in front of
 * the instruction is a form letter's courtesy, and it read that way beside
 * the plain sentences around it. The rule and its swaps live in
 * `docs/voice-and-tone.md`; this holds it.
 *
 * The scan covers every surface a person reads words from: the app
 * (`src/`), what the server sends back to it and to their phone
 * (`functions/`), the public pages and service workers (`public/`), and
 * the iOS permission prompts (`Info.plist`). Comments are stripped first,
 * so a comment may quote old copy; a string, a JSX text node or an HTML
 * text node may not say it. Tests and operator scripts are left out:
 * neither is shown to anyone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { globSync } from "tinyglobby";

const ROOT = process.cwd();

const SURFACES = [
  { cwd: "src", pattern: "**/*.{ts,tsx}" },
  { cwd: "functions", pattern: "**/*.js" },
  { cwd: "public", pattern: "**/*.{js,html}" },
  { cwd: "ios/App/App", pattern: "Info.plist" },
];

const NOT_SHOWN = [
  /(^|\/)__tests__\//,
  /(^|\/)node_modules\//,
  /^src\/test\//,
  /^functions\/scripts\//,
  /\.test\.[jt]sx?$/,
  /^functions\/vitest\.config\.js$/,
];

function shippedFiles(): string[] {
  return SURFACES.flatMap(({ cwd, pattern }) =>
    globSync(pattern, { cwd: join(ROOT, cwd), absolute: true })
  )
    .map((f) => relative(ROOT, f).replaceAll("\\", "/"))
    .filter((f) => !NOT_SHOWN.some((re) => re.test(f)))
    .sort();
}

/** A comment's newlines, so a line number still points into the file. */
const blank = (comment: string) => comment.replace(/[^\n]/g, "");

/** The text a person could read: the file with its comments taken out. */
export function readableText(path: string, src: string): string {
  if (/\.(html|plist)$/.test(path))
    return src.replace(/<!--[\s\S]*?-->/g, blank);
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, "");
}

const PLEASE = /\bplease\b/i;

function offenders(): string[] {
  const found: string[] = [];
  for (const file of shippedFiles()) {
    const text = readableText(file, readFileSync(join(ROOT, file), "utf8"));
    text.split("\n").forEach((line, i) => {
      if (PLEASE.test(line)) found.push(`${file}:${i + 1}  ${line.trim()}`);
    });
  }
  return found;
}

describe('no "please" in user-visible copy', () => {
  it("reads strings and text, and skips comments", () => {
    /* The detector is half the test, so it is checked on its own: a
       strip that ate the strings too would pass every file. */
    const js = 'toast.error("Couldn\'t save. Please try again.");';
    expect(PLEASE.test(readableText("a.ts", js))).toBe(true);
    expect(PLEASE.test(readableText("a.tsx", "<p>Please wait</p>"))).toBe(true);
    expect(
      PLEASE.test(readableText("a.html", "<p>please include the device</p>"))
    ).toBe(true);
    expect(
      PLEASE.test(readableText("a.ts", "// please keep this sorted"))
    ).toBe(false);
    expect(
      PLEASE.test(readableText("a.ts", "/* say please */ const a = 1;"))
    ).toBe(false);
    expect(PLEASE.test(readableText("a.html", "<!-- please -->"))).toBe(false);
  });

  it("looks at every surface it names", () => {
    /* The other half: a glob pointed at nothing makes the scan below
       pass on an empty list. */
    const files = shippedFiles();
    for (const file of [
      "src/hooks/useFoodAnalysis.ts",
      "src/pages/Onboarding.tsx",
      "functions/index.js",
      "functions/lib/pushSend.js",
      "public/legal/support.html",
      "public/sw.js",
      "ios/App/App/Info.plist",
    ]) {
      expect(files).toContain(file);
    }
    expect(files.some((f) => f.includes("__tests__"))).toBe(false);
  });

  it("none of them says it", () => {
    const bad = offenders();
    expect(
      bad,
      bad.length === 0
        ? ""
        : `"Please" in user-visible copy. Drop the word and keep the ` +
            `sentence: "Couldn't save. Try again.", "Sign in again to log ` +
            `food." See docs/voice-and-tone.md.\n` +
            bad.join("\n")
    ).toEqual([]);
  });
});
