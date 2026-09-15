import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `font-mono` means NUMBERS here, not a typeface.
 *
 * Archivo replaced JetBrains Mono in the brand bake-off, so the utility is
 * proportional with tabular figures forced on — it buys digit alignment and
 * nothing else. On a word it buys nothing and quietly says "this is a
 * readout" about something that is not one. CLAUDE.md scopes the treatment
 * to numeric displays, and `PeriodOverview.test.tsx` already asserts it for
 * that card's column labels ("NOT font-mono: this is a word, and that
 * treatment is scoped to numerals") — one card holding a rule the rest of
 * the tree was free to break.
 *
 * Two sites had: the macro donut's centre label ("avg") and the
 * leaderboard's period chip ("This week"). Both sit BESIDE the figures
 * they describe, which is how they picked the class up.
 *
 * Deliberately narrow — only an element whose single child is a bare
 * literal with no digit in it. A label built from an interpolation is not
 * reliably a word, and a false positive here costs more than a missed one:
 * the response to a noisy invariant is to delete it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") tsxFiles(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** `className="… font-mono …" …>  some short literal  <`
 *
 *  The class ADMITS digits and the filter below rejects them, rather than
 *  the class excluding them: otherwise "best 42 km" never matches, the
 *  filter can never fire, and a reader cannot tell whether the rule is
 *  "no words" or "no digits" — a dead branch dressed as a decision. */
const NUMERAL_FACE_LITERAL =
  /className="[^"]*\bfont-mono\b[^"]*"[^>]*>\s*([A-Za-z][A-Za-z0-9 /·:.,—-]{0,24}?)\s*</g;

function offenders(): string[] {
  const found: string[] = [];
  for (const file of tsxFiles(resolve(repoRoot, "src"))) {
    const src = readFileSync(file, "utf8");
    NUMERAL_FACE_LITERAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUMERAL_FACE_LITERAL.exec(src))) {
      const text = m[1].trim();
      if (!text || /\d/.test(text)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      found.push(
        `${relative(repoRoot, file)}:${line}  ${JSON.stringify(text)}`
      );
    }
  }
  return found;
}

describe("the numeral face is for numerals", () => {
  it("catches a word in font-mono when there is one", () => {
    // The detector, checked directly — otherwise the sweep below could
    // pass because the regex stopped matching anything at all.
    const sample = '<p className="text-xs font-mono tabular-nums">avg</p>';
    NUMERAL_FACE_LITERAL.lastIndex = 0;
    expect(NUMERAL_FACE_LITERAL.exec(sample)?.[1]).toBe("avg");
    // A readout that OPENS with a digit is not matched at all — the
    // pattern anchors on a letter, so `2,143 kcal` never reaches the
    // digit filter.
    NUMERAL_FACE_LITERAL.lastIndex = 0;
    expect(
      NUMERAL_FACE_LITERAL.exec(
        '<p className="font-mono tabular-nums">2,143 kcal</p>'
      )
    ).toBeNull();
    // The near-miss that DOES match and must survive the filter: a label
    // that opens with a letter and carries the figure after it, which is
    // how several real readouts read ("avg 5:17/km", "best 42 km").
    NUMERAL_FACE_LITERAL.lastIndex = 0;
    const mixed = NUMERAL_FACE_LITERAL.exec(
      '<p className="font-mono tabular-nums">best 42 km</p>'
    );
    expect(mixed?.[1]).toBe("best 42 km");
    expect(/\d/.test(mixed?.[1] ?? "")).toBe(true);
  });

  it("no bare word carries font-mono", () => {
    const bad = offenders();
    expect(
      bad,
      bad.length === 0
        ? ""
        : `font-mono on a word. The utility forces tabular figures, which ` +
            `align digits and do nothing for letters — drop it, and leave ` +
            `it on the figures the label sits beside.\n${bad.join("\n")}`
    ).toEqual([]);
  });
});
