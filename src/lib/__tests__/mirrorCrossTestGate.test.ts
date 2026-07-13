/**
 * Mirror cross-test gate (D4).
 *
 * Several `functions/*.js` modules are hand-maintained TS↔JS *equality mirrors*
 * of a `src/lib` / `src/features` source — the server copy MUST return identical
 * output for identical input (perfScoring, runModeResolution, runEligibility,
 * plan-validation, …). The only thing that historically bound them was a "keep
 * in lockstep" *comment*; the fix has been a `*.cross.test` per mirror.
 *
 * But nothing stops the NEXT mirror being born unpinned. This gate scans the
 * functions tree for mirror-declaring language and fails if a flagged module is
 * neither (a) PINNED to an existing cross-test, nor (b) consciously classified
 * as not-an-equality-mirror (intentional asymmetry / consolidated / server-only
 * false-positive). A new "mirror of …" file forces a decision in CI.
 *
 * This is the grep-based gate the D4 scope check called for — deliberately
 * heuristic; humans classify the edge cases (e.g. dateUtils is UTC-vs-local on
 * purpose, so an equality pin would be WRONG).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

// Strong mirror-declaring phrases a future author is likely to write.
const MIRROR_RE =
  /mirror of|in lockstep|keep .{0,24}in lockstep|MUST return identical|identical output|parity seam/i;

// Scan functions/*.js and functions/lib/*.js (skip tests, scripts, node_modules).
function functionsJsFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["functions", "functions/lib"]) {
    const abs = resolve(repoRoot, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (!name.endsWith(".js")) continue;
      out.push(`${dir}/${name}`);
    }
  }
  return out;
}

// Mirror file → its cross-test (relative to repo root). Each must exist.
const PINNED: Record<string, string> = {
  "functions/performanceEngine.js":
    "src/lib/__tests__/performanceEngineParity.cross.test.ts",
  "functions/lib/perfScoring.js":
    "src/lib/__tests__/performanceEngineParity.cross.test.ts",
  "functions/lib/runModeResolution.js":
    "src/lib/__tests__/runModeResolution.cross.test.ts",
  "functions/lib/runEligibility.js":
    "src/lib/__tests__/runEligibility.cross.test.ts",
  "functions/lib/validatePlanPayload.js":
    "src/features/program/__tests__/validatePlanPayload.cross.test.ts",
  "functions/lib/challengeTiers.js":
    "src/features/challenges/__tests__/challengeTiers.cross.test.ts",
  "functions/lib/partnerStreakEngine.js":
    "src/features/partnerStreak/__tests__/engineMirror.test.ts",
  // Packet 18 — CF programme reducer mirrors the client run-day transition
  // table + status helpers (programTypes.ts LEGAL_TRANSITIONS /
  // scheduledRunStatus.ts). Pinned by the cross-test below.
  "functions/lib/programCommands.js":
    "src/features/program/__tests__/programCommands.cross.test.ts",
  // Spc1 PR4 — data-list mirror (space ids), not a function mirror;
  // the set-equality parity pin lives in the spaceDefs config test.
  "functions/lib/spaceIds.js":
    "src/features/spaces/__tests__/spaceDefs.test.ts",
};

// Flagged by the heuristic but NOT a TS↔JS equality mirror — reason each.
const NOT_EQUALITY_MIRROR: Record<string, string> = {
  "functions/lib/dateUtils.js":
    "intentionally UTC (server) vs local (client) — an equality pin would be WRONG",
  "functions/lib/challengeDefs.js":
    "consolidated server-owned definitions; no client copy to drift against",
  "functions/lib/programStateSanitizer.js":
    "server-only payload sanitiser, not a mirror of a client function",
  "functions/lib/streakNudge.js":
    "server-only; its header states 'no TS↔JS port to keep in lockstep'",
  "functions/index.js":
    "orchestrator; 'lockstep' refers to shared user-iteration, not a client mirror",
};

describe("mirror cross-test gate", () => {
  const flagged = functionsJsFiles().filter((f) =>
    MIRROR_RE.test(readFileSync(resolve(repoRoot, f), "utf8"))
  );

  it("found the known mirror surface (sanity — heuristic still matches)", () => {
    // If this drops to ~0 the regex silently stopped matching; keep it honest.
    expect(flagged.length).toBeGreaterThanOrEqual(6);
  });

  it("every mirror-declaring functions module is PINNED or consciously classified", () => {
    const unclassified = flagged.filter(
      (f) => !(f in PINNED) && !(f in NOT_EQUALITY_MIRROR)
    );
    expect(
      unclassified,
      `These functions modules declare mirror language but are neither pinned ` +
        `to a *.cross.test nor classified as not-an-equality-mirror. Add a ` +
        `cross-test + a PINNED entry, or classify in NOT_EQUALITY_MIRROR with a ` +
        `reason: ${unclassified.join(", ")}`
    ).toEqual([]);
  });

  it("every PINNED cross-test file exists", () => {
    const missing = Object.entries(PINNED)
      .filter(([, test]) => !existsSync(resolve(repoRoot, test)))
      .map(([mirror, test]) => `${mirror} → ${test}`);
    expect(missing, `PINNED cross-tests that don't exist`).toEqual([]);
  });

  it("classifications stay honest (no entry for a deleted file)", () => {
    const gone = [
      ...Object.keys(PINNED),
      ...Object.keys(NOT_EQUALITY_MIRROR),
    ].filter((f) => !existsSync(resolve(repoRoot, f)));
    expect(gone, `Classified files that no longer exist`).toEqual([]);
  });
});
