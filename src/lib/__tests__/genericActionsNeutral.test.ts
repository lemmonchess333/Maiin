/**
 * Generic actions are neutral (DS4 call 1, DESIGN_GUIDE §14m rule 12).
 *
 * Purple means lifting and the brand. Save, Done, Join, Follow, Continue,
 * Confirm and their kin are generic, so a filled one is the neutral fill
 * (white on dark, ink on light), never the default purple `primary`. The
 * scorer (`npm run score:screens`) found the rule broken on the Space
 * page, the weekly review and the Pro page a week after it was made; this
 * keeps a new one from landing.
 *
 * A `<Button>` with no `variant` is the purple primary. Any such button
 * whose label is a generic verb fails here; give it `variant="neutral"`,
 * or a quieter variant when it is not the screen's one filled button.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

const GENERIC =
  /^(Save|Saving|Done|Join|Follow|Continue|Confirm|Apply|Got it|Next|OK|Try again|Retry)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "__tests__" ? [] : files(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** Each `<Button …>children</Button>` with no variant, and the words in
 *  its children: plain text, and the strings of a ternary label. */
function defaultButtons(source: string): string[][] {
  const out: string[][] = [];
  const re = /<Button\b((?:[^<>]|=>)*?)>([\s\S]*?)<\/Button>/g;
  for (const m of source.matchAll(re)) {
    // A variant given, or props spread in that may carry one (the weekly
    // challenge's `actionStyle`), is the component's own call.
    if (/\bvariant\s*=|\{\s*\.\.\./.test(m[1])) continue;
    const body = m[2];
    const words = [
      ...[...body.matchAll(/"([^"]+)"/g)].map((s) => s[1]),
      ...body
        .replace(/\{[\s\S]*?\}/g, " ")
        .replace(/<[^>]*>/g, " ")
        .split(/\n/)
        .map((s) => s.trim()),
    ].filter(Boolean);
    out.push(words);
  }
  return out;
}

describe("generic actions are neutral", () => {
  it("no default-purple Button is labelled with a generic verb", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      for (const words of defaultButtons(readFileSync(file, "utf8"))) {
        const generic = words.find((w) => GENERIC.test(w));
        if (generic) offenders.push(`${relative(SRC, file)}: "${generic}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds one when it is there", () => {
    expect(
      defaultButtons(
        '<Button onClick={save}>{busy ? "Saving…" : "Save"}</Button>'
      )
    ).toEqual([["Saving…", "Save"]]);
    expect(
      defaultButtons('<Button variant="neutral" onClick={save}>Save</Button>')
    ).toEqual([]);
    expect(defaultButtons("<Button onClick={go}>\n  Done\n</Button>")).toEqual([
      ["Done"],
    ]);
  });
});
