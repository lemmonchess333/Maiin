/**
 * Mirror + reachability gate (D4; reachability added 2026-07-11).
 *
 * ── Part 1: mirror classification (original D4 gate) ──────────────────
 * Several `functions/*.js` modules are hand-maintained TS↔JS *equality
 * mirrors* of a `src/lib` / `src/features` source — the server copy MUST
 * return identical output for identical input. The only thing that
 * historically bound them was a "keep in lockstep" *comment*; the fix has
 * been a `*.cross.test` per mirror. This half scans the functions tree for
 * mirror-declaring language and fails if a flagged module is neither PINNED
 * to a cross-test nor consciously classified as not-an-equality-mirror.
 *
 * ── Part 2: reachability (why this half exists) ───────────────────────
 * Part 1 asks "is this pinned?" — never "does the pinned code RUN?" That
 * gap shipped a textbook failure: `functions/lib/scheduledRunCompletion.js`
 * was a port of the client's run-completion rule, covered by BOTH a unit
 * suite (510 lines) and an equality cross-test, and `require`d by NOTHING.
 * The rule that actually ran was a third, unpinned implementation inlined
 * in `functions/index.js` — and the pinned port could never have replaced
 * it, because it reads `templateId` while raw Firestore docs carry
 * `actualTemplateId`. Two copies were pinned to each other; neither was the
 * running copy; the fixtures were written in a shape only the client
 * produces. Green CI, zero protection. (See ADR-0008.)
 *
 * So: a domain module must be reachable from production code, or say why
 * not. Two markers, because "test-only" has two legitimate meanings and
 * collapsing them lets rot hide behind a valid annotation:
 *
 *   `@oracle`   — test-only BY DESIGN, permanently. A declaration or
 *                 reference implementation whose whole job is to be read
 *                 by a parity test (e.g. `profileFieldRegistry.ts`, whose
 *                 purpose is to be the pinned field list). No expiry, no
 *                 follow-up owed.
 *   `@unwired:` — written ahead of its wiring; DEBT. Must carry a reason
 *                 on the same line so it reads as owed work, not as design.
 *
 * Anything genuinely orphaned should be DELETED, not annotated. If you
 * find yourself reaching for a marker to silence this gate on code nobody
 * calls and nobody intends to call, that is the gate working.
 *
 * Detection is deliberately shallow — "is this module's specifier
 * referenced by any non-test file?" — not a real transitive import graph.
 * That is exactly the check that surfaced every instance above, it needs no
 * build step, and the cases it misses (a module reachable only from other
 * dead code) are ones a graph walk would also have to special-case.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename } from "node:path";
import { moduleHeader } from "./reachabilityMarkers";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

// Strong mirror-declaring phrases a future author is likely to write.
// Widened 2026-08-08: "mirror of" alone missed two real declarations that
// authors phrased differently — badgeRules' "these ids mirror the client
// catalogue" and activeDates' "Mirrors the client's computeActiveDateSet"
// (the latter had ALSO drifted on run eligibility by the time it was
// found). The added alternatives target client-mirroring language
// specifically; bare "mirrors the X pattern" style references stay
// unflagged on purpose.
const MIRROR_RE =
  /mirror of|mirrors? the client|ids mirror the|to mirror `|in lockstep|keep .{0,24}in lockstep|MUST return identical|identical output|parity seam/i;

// Escape hatches. `@unwired` requires a reason after the colon.
//
// Both are read from the MODULE HEADER only (`moduleHeader`), because both
// make a claim about the whole module. `symbolReachability` also honours a
// per-symbol `@oracle` on an individual export's JSDoc; matching anywhere
// in the file would let one such marker quietly take its entire module out
// of this gate too.
const ORACLE_RE = /@oracle\b/;
const UNWIRED_RE = /@unwired:\s*\S/;

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
  "functions/lib/workoutSetRecord.js":
    "src/features/program/__tests__/workoutSetRecord.cross.test.ts",
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
  // Packet 18 — CF progression engine mirrors programEngine.ts applyProgression.
  "functions/lib/progressionEngine.js":
    "src/features/program/__tests__/applyProgression.cross.test.ts",
  // Packet 18 — CF bodyweight id set mirrors the catalog's Bodyweight rows.
  "functions/lib/bodyweightExerciseIds.js":
    "src/features/program/__tests__/bodyweightExerciseIds.cross.test.ts",
  // Packet 18 — CF catalog id→name mirror (add/replace derive exercise names).
  "functions/lib/exerciseCatalog.js":
    "src/features/program/__tests__/exerciseCatalog.cross.test.ts",
  // Packet 18 — CF movement-category inference mirrors the client.
  "functions/lib/exerciseMovementCategory.js":
    "src/features/program/__tests__/exerciseMovementCategory.cross.test.ts",
  // Packet 18 — CF ProgramExercise builder mirrors normalizeExercise.
  "functions/lib/programExerciseBuilder.js":
    "src/features/program/__tests__/programExerciseBuilder.cross.test.ts",
  // Packet 18 — CF calorie engine mirrors src/lib/workoutBurn.ts.
  "functions/lib/workoutBurn.js":
    "src/features/program/__tests__/workoutBurn.cross.test.ts",
  // PROGRAM-DELOAD-01 — CF deload transform mirrors programEngine.ts
  // applyDeload (and the easierToday.deloadWeight weight rule).
  "functions/lib/deloadEngine.js":
    "src/features/program/__tests__/deloadEngine.cross.test.ts",
  // Easing-block progression hold — the third branch of logExercise, which
  // the server reducer lacked until the writer migrated to the boundary.
  "functions/lib/progressionHold.js":
    "src/features/program/__tests__/progressionHold.cross.test.ts",
  // One-off run move — the copy inside the command transaction is the one
  // that decides where the run is actually stored.
  "functions/lib/runReschedule.js":
    "src/features/program/__tests__/runReschedule.cross.test.ts",
  // Blk2 — the goal-prescription engine a training block applies at start
  // and un-applies at release. The server copy is the one that decides what
  // a block actually writes.
  "functions/lib/represcribe.js":
    "src/features/program/__tests__/represcribe.cross.test.ts",
  // Race-template ids — data-list mirror of the race-TYPE RUN_TEMPLATES
  // entries. Same shape as spaceIds below: the server cannot import the
  // catalogue, so the list is pinned set-equal instead.
  "functions/lib/raceTemplateIds.js":
    "src/lib/__tests__/raceTemplateIds.cross.test.ts",
  // Spc1 PR4 — data-list mirror (space ids), not a function mirror;
  // the set-equality parity pin lives in the spaceDefs config test.
  "functions/lib/spaceIds.js":
    "src/features/spaces/__tests__/spaceDefs.test.ts",
  // SOCIAL-FOCUS-01 — the weekly-focus enum + supporter bound mirror
  // the client schema contract (goalSpaceTypes.ts).
  "functions/lib/goalSpaceCheckIn.js":
    "src/features/goalSpace/__tests__/weeklyFocus.cross.test.ts",
  // Milestone-badge award ids/thresholds mirror the client catalogue's
  // ids + description prose (BADGE_DEFINITIONS renders ONLY known ids —
  // an unknown award is silently invisible).
  "functions/lib/badgeRules.js":
    "src/features/streaks/__tests__/badgeCatalogueParity.cross.test.ts",
  // Streak-nudge active-date derivation mirrors the client's
  // computeActiveDateSet (incl. the run-eligibility boundary — the half
  // that had already drifted when this pin was added).
  "functions/lib/activeDates.js":
    "src/features/streaks/__tests__/activeDatesParity.cross.test.ts",
  // Weekly-run-target resolution inside fellBehindRatio mirrors
  // getWeeklyRunTarget's ??-semantics (explicit 0 authoritative).
  "functions/lib/fellBehindWeek.js":
    "src/lib/__tests__/weeklyRunTargetParity.cross.test.ts",
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
  "functions/lib/raceDayCompletion.js":
    "deliberate non-mirror (ADR-0008): server asks 'was this race run?' over RAW docs " +
    "(actualTemplateId, date-scoped ANY); client asks 'is this slot complete?' over a " +
    "NORMALISED SavedRunLike via the claim map. Different question, different shape — " +
    "an equality pin would be wrong, and pinning them is what produced the dead port.",
  "functions/lib/coachPrompts.js":
    "'mirrors the client SpacePostDoc' is a doc-SHAPE note, not a computable equality " +
    "(prompt content is server-owned); the space-id membership half is pinned via " +
    "spaceDefs.test.ts's three-way set equality.",
};

/* ── Reachability ─────────────────────────────────────────────────── */

/** Domain-module roots whose files must be reachable from production. */
const REACHABILITY_ROOTS = [
  { dir: "src/lib", ext: ".ts", recurse: false },
  { dir: "src/features", ext: ".ts", recurse: true },
  { dir: "functions/lib", ext: ".js", recurse: false },
];

function isTestPath(p: string): boolean {
  return p.includes("__tests__") || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
}

function walkFiles(absDir: string, ext: string, recurse: boolean): string[] {
  const out: string[] = [];
  if (!existsSync(absDir)) return out;
  for (const name of readdirSync(absDir)) {
    const abs = join(absDir, name);
    if (statSync(abs).isDirectory()) {
      if (recurse && name !== "__tests__")
        out.push(...walkFiles(abs, ext, true));
      continue;
    }
    if (!name.endsWith(ext) || name.endsWith(".d.ts")) continue;
    out.push(abs);
  }
  return out;
}

/**
 * Remove block and line comments so prose can't masquerade as an import.
 * Crude on purpose — it doesn't parse, so a `//` inside a string literal is
 * over-eaten. That only ever removes a potential match, which pushes toward
 * reporting MORE orphans: a CI failure, never a silent pass.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Every non-test source file's contents, for specifier scanning. */
function productionSources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  // Walk `functions` WHOLE rather than enumerating its subdirectories. An
  // earlier version listed `functions/lib` plus the top-level `*.js` entry
  // points, and went stale the moment `functions/email/` was added — every
  // module reachable only from there read as an orphan.
  const roots = ["src", "functions", "scripts"];
  const seen = new Set<string>();
  const walk = (absDir: string) => {
    if (!existsSync(absDir)) return;
    for (const name of readdirSync(absDir)) {
      const abs = join(absDir, name);
      if (statSync(abs).isDirectory()) {
        if (name !== "__tests__" && name !== "node_modules") walk(abs);
        continue;
      }
      if (!/\.[cm]?[jt]sx?$/.test(name)) continue;
      if (isTestPath(abs) || seen.has(abs)) continue;
      seen.add(abs);
      out.push({ path: abs, text: readFileSync(abs, "utf8") });
    }
  };
  for (const r of roots) walk(resolve(repoRoot, r));
  return out;
}

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

describe("reachability gate — a pinned module must be the RUNNING module", () => {
  const sources = productionSources();

  /**
   * Is this module's specifier referenced by any non-test source file?
   *
   * Comments are stripped first. Without that, a module named in PROSE
   * reads as reachable — `foodTrajectory.ts` was "imported" only by a
   * FoodHeroCard comment explaining how to reinstate it, which made this
   * gate insist the module was live while the symbol-level gate correctly
   * called it dead. The two gates disagreeing is what surfaced it.
   *
   * Same fix the symbol gate already carries; back-ported here because
   * fixing one copy of a bug and not the other is the exact class of
   * mistake ADR-0008 exists for.
   */
  function isReachable(absPath: string): boolean {
    const base = basename(absPath).replace(/\.[cm]?[jt]sx?$/, "");
    // Match an import/require specifier ending in this basename:
    //   "@/lib/foo"  "./foo"  "../../lib/foo"  require("./lib/foo")
    const spec = new RegExp(`["'\`][^"'\`]*[/]${base}["'\`]`);
    for (const s of sources) {
      if (s.path === absPath) continue;
      if (spec.test(stripComments(s.text))) return true;
    }
    return false;
  }

  const modules = REACHABILITY_ROOTS.flatMap((r) =>
    walkFiles(resolve(repoRoot, r.dir), r.ext, r.recurse)
  ).filter((p) => !isTestPath(p));

  it("scans a plausible number of domain modules (sanity)", () => {
    expect(modules.length).toBeGreaterThan(100);
  });

  /**
   * Explicit timeout. This walks every domain module in `src/` and, for
   * each, re-scans the consumer tree to decide reachability — so its cost
   * grows with the codebase, not with what a PR touched. It measures ~3s
   * locally against vitest's 5s default, which is not enough headroom on
   * a loaded CI runner: it timed out on #1803, a PR that touched neither
   * this gate nor any module it scans. Timing was compared with and
   * without that PR's changes (3.09s vs 3.30s — noise) to confirm this is
   * a pre-existing margin, not a regression.
   *
   * Raising the ceiling rather than the speed is the deliberate call: the
   * gate is I/O-bound and correct, and a flaky gate gets deleted long
   * before a slow one does. If it ever approaches 30s, make it
   * incremental instead of loosening this again.
   */
  it(
    "every domain module is reachable from production, or marked @oracle / @unwired:",
    { timeout: 30_000 },
    () => {
      const orphans: string[] = [];
      for (const abs of modules) {
        if (isReachable(abs)) continue;
        const head = moduleHeader(readFileSync(abs, "utf8"));
        if (ORACLE_RE.test(head) || UNWIRED_RE.test(head)) continue;
        orphans.push(abs.slice(repoRoot.length + 1));
      }
      expect(
        orphans,
        `These modules are imported by NOTHING outside __tests__ — so any test ` +
          `covering them proves nothing about production (the ADR-0008 failure). ` +
          `Either wire them up, DELETE them, or annotate:\n` +
          `  @oracle             — test-only by design, permanently\n` +
          `  @unwired: <reason>  — written ahead of wiring; debt, reason required\n` +
          `Offenders:\n  ${orphans.join("\n  ")}`
      ).toEqual([]);
    }
  );

  it("@unwired always carries a reason (a bare marker is how debt becomes design)", () => {
    const bare: string[] = [];
    for (const abs of modules) {
      const head = moduleHeader(readFileSync(abs, "utf8"));
      if (/@unwired\b/.test(head) && !UNWIRED_RE.test(head)) {
        bare.push(abs.slice(repoRoot.length + 1));
      }
    }
    expect(bare, `@unwired with no reason after the colon`).toEqual([]);
  });

  it("markers stay honest — a module that IS reachable must not claim to be test-only", () => {
    const stale: string[] = [];
    for (const abs of modules) {
      const head = moduleHeader(readFileSync(abs, "utf8"));
      if (!ORACLE_RE.test(head) && !UNWIRED_RE.test(head)) continue;
      if (isReachable(abs)) stale.push(abs.slice(repoRoot.length + 1));
    }
    expect(
      stale,
      `These carry @oracle/@unwired but ARE imported by production code — ` +
        `drop the marker so the gate keeps protecting them`
    ).toEqual([]);
  });
});
