/**
 * Cross-consistency test for the TS + JS copies of `getNutritionPhase`.
 *
 * The client copy (`src/lib/nutritionPhase.ts`) is the single sanctioned
 * reader of `profile.program.goal`; the server copy
 * (`functions/lib/nutritionPhase.js`) was added when
 * `functions/performanceEngine.js` turned out to be reading a top-level
 * `profile.goal` that nothing writes, scoring every user's Performance Index
 * on the unknown branch.
 *
 * Same mirror discipline as `adaptiveTargetMirror.cross.test.ts`: the two
 * runtimes cannot share a module, so the duplication is made safe by driving
 * BOTH copies over the same matrix. Change one, change the other, or this
 * fails.
 *
 * The matrix leans on the DEFAULT and the REJECTIONS rather than the happy
 * path, because that is where a drifting copy would actually diverge — a
 * server copy that defaulted to `""` or `undefined` instead of `"recomp"`
 * would agree on every valid input and disagree on every real user who has
 * not set a goal.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { getNutritionPhase as client } from "@/lib/nutritionPhase";

const require = createRequire(import.meta.url);
const { getNutritionPhase: server, VALID_PHASES } = require(
  "../../../functions/lib/nutritionPhase.js"
);

const CASES: { label: string; profile: unknown }[] = [
  { label: "cut", profile: { program: { goal: "cut" } } },
  { label: "lean bulk", profile: { program: { goal: "lean bulk" } } },
  { label: "recomp", profile: { program: { goal: "recomp" } } },

  // Everything below must resolve to the "recomp" default on both copies.
  { label: "no program", profile: {} },
  { label: "null program", profile: { program: null } },
  { label: "program with no goal", profile: { program: {} } },
  { label: "null goal", profile: { program: { goal: null } } },
  { label: "empty-string goal", profile: { program: { goal: "" } } },
  { label: "unknown goal", profile: { program: { goal: "bulk" } } },
  { label: "wrong case", profile: { program: { goal: "Cut" } } },
  { label: "non-string goal", profile: { program: { goal: 3 } } },
  { label: "null profile", profile: null },
  { label: "undefined profile", profile: undefined },

  // The vestigial top-level field. Neither copy may read it — that IS the
  // bug this mirror was created to close, so a copy that "helpfully" falls
  // back to it has to fail here.
  { label: "top-level goal only", profile: { goal: "cut" } },
  {
    label: "top-level goal contradicting the program",
    profile: { goal: "cut", program: { goal: "recomp" } },
  },
];

describe("getNutritionPhase — TS and JS copies agree", () => {
  it.each(CASES)("$label", ({ profile }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(server(profile as any)).toBe(client(profile as any));
  });

  it("resolves the documented default rather than a falsy value", () => {
    // Pinned as a LITERAL. Asserting `server({}) === client({})` alone would
    // be satisfied by both copies returning undefined — consistency, not
    // behaviour, which is the tautology shape this codebase keeps shipping.
    expect(client({})).toBe("recomp");
    expect(server({})).toBe("recomp");
  });

  it("never reads the top-level goal field", () => {
    expect(client({ goal: "cut" } as never)).toBe("recomp");
    expect(server({ goal: "cut" })).toBe("recomp");
  });

  it("shares one vocabulary", () => {
    expect(VALID_PHASES).toEqual(["cut", "lean bulk", "recomp"]);
  });
});
