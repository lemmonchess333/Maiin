/**
 * `docs/app-check-rollout.md` ↔ `functions/index.js` — every callable the
 * rollout names must actually exist.
 *
 * WHY THIS EXISTS. That doc's whole job is to name Cloud Functions and say
 * in what order an operator flips `enforceAppCheck` on them. A name that
 * has rotted out of the codebase is therefore not a typo — it is a step in
 * an operational runbook that cannot be performed, discovered mid-incident.
 *
 * It rotted twice from a SINGLE deletion. Retiring crews (#1700) removed
 * `refreshMyCrewLeaderboard` and `crewWeeklyLeaderboardRollup`; both kept
 * their entries here — the first in the tier-1 "flip these first" table,
 * the second in the "no client request" list — until 2026-07-26. A doc
 * sweep would have fixed that day's instance and left the next deletion to
 * do it again, which is why this is a test and not a tidy-up.
 *
 * SCOPE IS DELIBERATELY NARROW. Only this one document, because only this
 * one enumerates callables as instructions. A repo-wide "every backticked
 * identifier in every doc must resolve" check was tried first and was
 * useless: it drowned in SDK method names (`onCall`, `onSnapshot`),
 * forward-looking plan files, and dated audit records that correctly
 * describe code that no longer exists. A noisy gate gets suppressed, and a
 * suppressed gate protects nothing.
 *
 * NOT_AN_EXPORT is delete-only. Everything in it is a real word that is not
 * one of our callables — Firebase SDK surface, or a client-side function.
 * Adding to it is how you'd silence a genuine rot, so additions want the
 * same scrutiny as deleting an assertion.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const DOC = "docs/app-check-rollout.md";

/**
 * Backticked identifiers in the doc that are legitimately NOT exports of
 * `functions/index.js`. Delete-only: shrink it when a name stops appearing,
 * never grow it to quiet a failure without checking the name first.
 */
const NOT_AN_EXPORT: ReadonlySet<string> = new Set([
  // Firebase Functions SDK surface the doc explains.
  "onCall",
  "onRequest",
  "enforceAppCheck",
  "runWith",
  // Client-side App Check helpers (src/lib/appCheck.ts), not callables.
  "initAppCheck",
  "getToken",
  "getAppCheckToken",
  "isAppCheckActive",
  "setNativeAppCheckProvider",
  "registerNativeAppCheck",
  "CustomProvider",
  "ReCaptchaV3Provider",
  "FirebaseAppCheck",
  "expireTimeMillis",
  "applicationId",
  // A file planned by Phase 2 of the rollout, deliberately not yet written.
  "appCheckNative",
]);

function exportedTriggers(): Set<string> {
  const src = readFileSync(resolve(ROOT, "functions/index.js"), "utf8");
  return new Set(
    [...src.matchAll(/^exports\.([A-Za-z0-9_]+)\s*=/gm)].map((m) => m[1])
  );
}

/**
 * Operative lines only — blockquotes are excluded.
 *
 * This is not a convenience carve-out; it is the distinction the gate is
 * about. A blockquote in this doc is commentary, and the most useful
 * commentary to write is precisely "we removed X, here is why it was never
 * a valid entry" — which necessarily names a function that no longer
 * exists. Scanning it would force the note explaining a retirement to be
 * deleted along with the retirement, destroying the record of why the
 * entry was wrong. (The first run of this gate flagged exactly that: the
 * `refreshMyCrewLeaderboard` / `askGeminiText` post-mortem note added the
 * same day.)
 *
 * Instructions live in the tier table and the enumerated lists, and those
 * are still scanned. If you put an operative instruction inside a
 * blockquote, this gate will not cover it — don't.
 */
function operativeText(doc: string): string {
  return doc
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n");
}

/** Backticked words shaped like one of our trigger names. Trigger names are
 *  camelCase and ≥6 chars, which excludes prose and short SDK nouns without
 *  needing a second allowlist. */
function candidateNames(raw: string): string[] {
  const doc = operativeText(raw);
  const out = new Set<string>();
  for (const m of doc.matchAll(/`([a-z][A-Za-z0-9_]{5,})`/g)) out.add(m[1]);
  // `onChallengeParticipant{Created,Deleted}` — brace-expanded in prose.
  for (const m of doc.matchAll(/`([A-Za-z0-9_]+)\{([A-Za-z,]+)\}`/g)) {
    for (const suffix of m[2].split(",")) out.add(m[1] + suffix.trim());
  }
  return [...out];
}

describe("app-check rollout doc names real callables", () => {
  const doc = readFileSync(resolve(ROOT, DOC), "utf8");
  const exports_ = exportedTriggers();

  it("finds the export set at all — guards against a silent parse failure", () => {
    // Without this, a change to how index.js declares exports would empty
    // the set and every assertion below would pass vacuously.
    expect(exports_.size).toBeGreaterThan(50);
    expect(exports_.has("onRunCreated")).toBe(true);
  });

  it("finds candidate names at all — guards a vacuous scan", () => {
    // Same reasoning: if the doc were restructured so no backticked name
    // matched, the real assertion would pass by finding nothing to check.
    expect(candidateNames(doc).length).toBeGreaterThan(15);
  });

  it("every function-shaped name is exported or explicitly not-an-export", () => {
    const unknown = candidateNames(doc)
      .filter((n) => !exports_.has(n))
      .filter((n) => !NOT_AN_EXPORT.has(n))
      .sort();
    expect(
      unknown,
      `${DOC} names these, but functions/index.js does not export them. ` +
        `If a function was deleted, remove it from the doc — an operator ` +
        `following this runbook would look for something that isn't there. ` +
        `If it is not a callable at all, add it to NOT_AN_EXPORT with a ` +
        `comment saying what it is.`
    ).toEqual([]);
  });
});
