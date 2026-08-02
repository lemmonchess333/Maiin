/**
 * programState key parity — the pin that was missing.
 *
 * `PROGRAM_STATE_KEYS` has to agree with the `ProgramState` interface in
 * `src/features/program/programTypes.ts`. Nothing bound them except a
 * "keep in lockstep" comment, and the comment lost: `plateauResponses`
 * shipped on the interface (backlog #9) and never reached the key set.
 *
 * That gap was not cosmetic. `advanceWeek` emits `plateauResponses`
 * unconditionally, so every user who has ever rolled a week carries it;
 * `runProgramCommandTransaction` throws `invalid-argument` when the
 * sanitiser drops ANY key; therefore the "Apply deload week" button
 * hard-errored for that whole population, and the deload never applied.
 *
 * The existing fixture test in `programStateSanitizer.test.js` claims to
 * catch exactly this ("If a future buildPlan field is added without updating
 * PROGRAM_STATE_KEYS, this test fails"). It cannot: it iterates a
 * hand-written fixture, so a field added to the interface and to neither the
 * fixture nor the key set stays green. A fixture cannot pin a type.
 *
 * This is the same third pin `profileFieldRegistry.test.ts` added for
 * `UserProfile`, whose own header records that its absence "is the reason the
 * drift kept recurring" across three separate incidents. `programState` is
 * the parallel system that never got the lesson. Same technique, same
 * anti-vacuous guard — a scan that silently matches nothing would make every
 * assertion below pass for the wrong reason.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { PROGRAM_STATE_KEYS } = require("../lib/programStateSanitizer");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Top-level field names on `export interface ProgramState`. Brace depth is
 * tracked so fields of nested object literals (`pendingFellBehindPrompt: {
 * weekKey: … }`) don't leak in as top-level keys — the sanitiser only
 * filters the top level.
 */
function programStateTypeFields() {
  const src = readFileSync(
    resolve(repoRoot, "src/features/program/programTypes.ts"),
    "utf8"
  );
  const fields = [];
  let inside = false;
  let depth = 0;
  for (const line of src.split("\n")) {
    if (!inside) {
      if (/^export interface ProgramState\s*\{/.test(line)) {
        inside = true;
        depth = 1;
      }
      continue;
    }
    if (depth === 1) {
      const m = /^ {2}(\w+)\??\s*:/.exec(line);
      if (m) fields.push(m[1]);
    }
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    if (depth <= 0) break;
  }
  return fields;
}

const declared = programStateTypeFields();

describe("programState key parity (interface ↔ sanitiser)", () => {
  it("parses the ProgramState interface (guards a silently-broken scan)", () => {
    // If programTypes.ts is restructured and this scan drops to ~0, every
    // assertion below would pass vacuously — which is exactly the failure
    // mode of the fixture-based test this file replaces.
    expect(declared.length).toBeGreaterThan(15);
    expect(declared).toContain("workouts");
    expect(declared).toContain("weekNumber");
    // Nested-object fields must NOT leak in as top-level keys.
    expect(declared).not.toContain("completedRatio");
  });

  it("every ProgramState field is allow-listed by the sanitiser", () => {
    const missing = declared.filter((f) => !PROGRAM_STATE_KEYS.has(f)).sort();
    expect(
      missing,
      `These are declared on ProgramState but absent from PROGRAM_STATE_KEYS. ` +
        `Both server paths that round-trip a whole programState will lose them, ` +
        `and they fail in OPPOSITE directions: applyProgramCommand REJECTS the ` +
        `entire command (so the deload button throws invalid-argument for every ` +
        `affected user), while configurePlan only warns and drops (so the field ` +
        `silently vanishes on every settings save). Add each to ` +
        `functions/lib/programStateSanitizer.js.`
    ).toEqual([]);
  });

  it("the sanitiser allow-lists nothing that is not on ProgramState", () => {
    const extra = [...PROGRAM_STATE_KEYS]
      .filter((k) => !declared.includes(k))
      .sort();
    expect(
      extra,
      `These are allow-listed but not declared on ProgramState — either the ` +
        `field was removed from the type and the key set was not cleaned up, ` +
        `or the key is a typo that is silently permitting an unknown field.`
    ).toEqual([]);
  });
});
