import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join } from "node:path";

/**
 * No button says "+ Something".
 *
 * CLAUDE.md's house voice lists a literal "+" in prose among the
 * AI-tells, and the same section's button rule spells the verb out —
 * "Start workout", "Add exercise", never "+ Exercise". A leading plus is
 * also redundant next to a verb that already says add, which is how
 * "+ Add Set" managed to say it twice.
 *
 * Three existed when this was written, on two surfaces: the workout
 * session's add-set control, and both check-in actions in the progress
 * vault. Found by capturing the profile surface and reading it, not by
 * grepping — which is the point of the capture channel.
 *
 * If a plus AFFORDANCE is wanted, the `Button` primitive takes a
 * `leftIcon`; a lucide `Plus` is the design-system way to draw one. This
 * bans the character in the words, not the idea.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Strip comments before scanning.
 *
 * Load-bearing rather than tidy: several block comments in this codebase
 * wrap onto continuation lines that begin with "+ " — "+ the ⇄ icon read
 * as…", "+ tabpanel relationships…" — because the author was listing
 * things. A line-based scan reports all of them, and a guard whose
 * failures are mostly noise gets an allow-list and then gets ignored.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx$/.test(entry) && !full.includes("__tests__")) {
      acc.push(full);
    }
  }
  return acc;
}

/** A JSX text node, or a quoted label, opening with "+ ". */
const LEADING_PLUS = /(^\s*\+ [A-Za-z])|("\+ [A-Za-z])/m;

describe("house voice — no literal plus in a label", () => {
  it("finds none in src/", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(resolve(repoRoot, "src"))) {
      const src = stripComments(readFileSync(file, "utf8"));
      src.split("\n").forEach((line, i) => {
        if (LEADING_PLUS.test(line)) {
          offenders.push(
            `${relative(repoRoot, file)}:${i + 1} — ${line.trim()}`
          );
        }
      });
    }
    expect(
      offenders,
      `A label opens with a literal "+":\n  ${offenders.join("\n  ")}\n\n` +
        `Spell the verb — "Add set", "New check-in" — per the house voice's ` +
        `button rule. If the affordance is what you want, pass a lucide ` +
        `Plus as the Button primitive's leftIcon instead.`
    ).toEqual([]);
  });

  it("does not fire on a comment that wraps onto a '+' line", () => {
    /* The counterweight. Without it this tightens into a rule against
       listing things in prose, and the failures would outnumber the
       findings — which is how a guard earns an allow-list and stops
       guarding. Both shapes below are in the codebase today. */
    const block = `/* something
      + the icon read as "tap to switch"
    */\n  <span>Fine</span>`;
    expect(LEADING_PLUS.test(stripComments(block))).toBe(false);
    expect(LEADING_PLUS.test(stripComments("  // + a note\n"))).toBe(false);
    /* …and it still catches both real shapes. */
    expect(LEADING_PLUS.test("            + Add Set")).toBe(true);
    expect(LEADING_PLUS.test('  action={{ label: "+ First check-in" }}')).toBe(
      true
    );
  });

  it("leaves arithmetic and concatenation alone", () => {
    /* `a + b` and `"x" + y` are not labels. The pattern requires the plus
       to OPEN the text, so neither matches — asserted rather than
       assumed, because a looser pattern here would be unusable. */
    expect(LEADING_PLUS.test("  const total = sets + reps;")).toBe(false);
    expect(LEADING_PLUS.test('  const s = "Set " + n;')).toBe(false);
    expect(LEADING_PLUS.test("  top: y + 4,")).toBe(false);
  });
});
