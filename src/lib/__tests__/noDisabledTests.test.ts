import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join } from "node:path";
import { readdirSync, statSync } from "node:fs";

/**
 * A switched-off test is the quietest way to lose a guarantee.
 *
 * It reports as "skipped" in a summary nobody reads line by line, its
 * body stops being typechecked against the code it describes, and the
 * comment above it goes on asserting that the property is held. Same
 * family as the "exhaustively covered by X" header CLAUDE.md records,
 * where the file being cited had been deleted.
 *
 * One existed when this was written, and its stated reason did not
 * survive reading it: 110 lines kept "to preserve the merge-vs-replace
 * intent doc", where the intent doc was the comment above it and the
 * surviving sibling test shared that comment already. It also carried
 * two template-id Sets nothing else referenced.
 *
 * CONDITIONAL skips are a different thing entirely and stay allowed —
 * `describe.skipIf(!enabled)` and `EMULATOR_HOST ? describe :
 * describe.skip` are how every emulator-gated suite declares what it
 * needs, and they run in full wherever that need is met. What is banned
 * is the unconditional call: a test that runs NOWHERE.
 *
 * `e2e/` is deliberately out of scope. Playwright's `test.skip(cond,
 * reason)` is a runtime guard with the same syntax as the thing being
 * banned here, so a scan over those files would be all false positives.
 */
const selfPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(selfPath), "../../..");

/**
 * This file is the one exemption, and it has to be: a guard that names
 * the forms it bans matches itself, and its counterweight below asserts
 * the regex against literal `it.skip("a", …)` strings.
 *
 * Exactly one, asserted below rather than left as a habit — an exclusion
 * list is the usual way a guard like this stops guarding.
 */
const EXEMPT = new Set([selfPath]);

/** `it.skip(` / `test.todo(` / `xdescribe(` — the unconditional forms. */
const DISABLED =
  /\b(?:it|test|describe)\.(?:skip|todo)\s*\(|\bx(?:it|describe)\s*\(/;

function testFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      testFiles(full, acc);
    } else if (/\.test\.(ts|tsx|js)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("no test is switched off outright", () => {
  it("finds no unconditional skip in src/ or functions/", () => {
    const offenders: string[] = [];
    for (const dir of ["src", "functions"]) {
      for (const file of testFiles(resolve(repoRoot, dir))) {
        if (EXEMPT.has(file)) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            /* Skip comment lines: this file's own prose names the forms
               it bans, and so will any future explanation of them. */
            const code = line.trim();
            if (code.startsWith("//") || code.startsWith("*")) return;
            if (DISABLED.test(line)) {
              offenders.push(`${relative(repoRoot, file)}:${i + 1}`);
            }
          });
      }
    }
    expect(
      offenders,
      `These tests run nowhere:\n  ${offenders.join("\n  ")}\n\n` +
        `Either fix and re-enable, or DELETE — a skipped body is not ` +
        `documentation. It stops being typechecked, and the comment above ` +
        `it goes on claiming the property is held. If the explanation is ` +
        `what is worth keeping, keep it as a comment. Conditional skips ` +
        `(skipIf, or a ternary picking describe.skip) are fine and are not ` +
        `matched here.`
    ).toEqual([]);
  });

  it("exempts itself and nothing else", () => {
    /* The loophole to watch. A second entry here would silence a real
       finding while this suite stayed green, which is the failure mode
       every guard in this repo exists to prevent in the code it
       watches. */
    expect([...EXEMPT]).toEqual([selfPath]);
  });

  it("does not match the conditional forms it must allow", () => {
    /* The counterweight. Without it this could tighten into a rule that
       bans emulator gating, and the failure would look like a real
       finding. Both forms are in the repo today. */
    expect(DISABLED.test('describe.skipIf(!enabled)("x", () => {})')).toBe(
      false
    );
    expect(
      DISABLED.test("const suite = EMULATOR_HOST ? describe : describe.skip;")
    ).toBe(false);
    expect(
      DISABLED.test(
        "const integration = EMULATOR_HOST ? describe : describe.skip;"
      )
    ).toBe(false);
    /* …and does match the ones it must catch. */
    expect(DISABLED.test('  it.skip("a", async () => {})')).toBe(true);
    expect(DISABLED.test('  test.skip("a", () => {})')).toBe(true);
    expect(DISABLED.test('  describe.skip("a", () => {})')).toBe(true);
    expect(DISABLED.test('  it.todo("a")')).toBe(true);
    expect(DISABLED.test('  xit("a", () => {})')).toBe(true);
  });
});
