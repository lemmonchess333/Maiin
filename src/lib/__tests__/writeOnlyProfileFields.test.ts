/**
 * `tdeeBase` and `aiCalorieAdjustment` are written and never read.
 *
 * This is a narrow pin, not a gate, and the distinction is the point.
 *
 * A general "which registered profile fields does nothing read?" detector was
 * prototyped and DECLINED. Over the 79 fields in `profileFieldRegistry` it
 * flags 11, and most are deliberate retentions the codebase already
 * documents at their declarations: `crewId` and the `autoPost*` trio are
 * legacy fields kept on purpose, `stripeCustomerId` /
 * `stripeSubscriptionId` are block-listed BECAUSE they are server-guarded,
 * and `macroTargets` is already marked pending-removal. A gate needing a
 * seven-entry pinned list on day one is a rubber stamp, and the detector had
 * already produced one false positive in development (excluding `auth.tsx`
 * as "the type declaration" also excluded the profile HYDRATION reader, so
 * `adjustCaloriesForTraining` looked dead when it is read every load).
 *
 * What survives that scepticism is these two, and the reason they matter is
 * not the dead bytes. `goalWeightPlan` claimed "the adaptive engine treats
 * [`tdeeBase`] as the pre-override baseline". It does not — `useAdaptiveTdee`
 * uses `profile.targetCalories`. A comment naming a consumer that does not
 * exist is worse than no comment: it sends the next person changing the
 * adaptive engine looking for a coupling that was never there, and it is the
 * fourth false claim of this kind found in this codebase (the client-badge
 * reconciliation claim, the `askGeminiText` prune note, and the `Date.parse`
 * locale note being the others).
 *
 * So this test pins the FACT the corrected comment now states. If either
 * field gains a real reader, this fails and the comment gets updated with
 * it — which is the failure mode the original comment had no defence
 * against.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js)$/.test(p) && !/__tests__|\.test\.|\/test\//.test(p))
      out.push(p);
  }
  return out;
}

/** Comments and string literals are not reads — the corrected comment names
 *  both fields, so matching raw source would defeat the test. */
function stripInert(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:[^`\\]|\\.)*`/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, " ")
    .replace(/'(?:[^'\\]|\\.)*'/g, " ");
}

const SOURCES = [
  ...walk(resolve(repoRoot, "src")),
  ...walk(resolve(repoRoot, "functions")),
].map((p) => ({
  rel: p.slice(repoRoot.length + 1),
  text: stripInert(readFileSync(p, "utf8")),
}));

/** A read is a property access or a destructure — not an object-literal
 *  write (`tdeeBase: x`) and not a type declaration. */
function readSites(field: string): string[] {
  const access = new RegExp(`\\.\\s*${field}\\b`);
  const destructure = new RegExp(`\\{[^{}]*\\b${field}\\b[^{}]*\\}\\s*=`);
  return SOURCES.filter(
    (s) => access.test(s.text) || destructure.test(s.text)
  ).map((s) => s.rel);
}

describe("write-only profile fields", () => {
  it("scans enough source to mean something", () => {
    // Guards the guard: a walk that silently returned nothing would make
    // every assertion below vacuously true, and the failure would look
    // exactly like success.
    expect(SOURCES.length).toBeGreaterThan(300);
    expect(SOURCES.some((s) => s.rel.startsWith("functions/"))).toBe(true);
  });

  it("detects a field that IS read", () => {
    // Positive control. `targetCalories` is read all over, including by the
    // adaptive engine that `tdeeBase`'s comment used to credit.
    expect(readSites("targetCalories").length).toBeGreaterThan(3);
  });

  it("finds no reader for tdeeBase", () => {
    expect(readSites("tdeeBase")).toEqual([]);
  });

  it("finds no reader for aiCalorieAdjustment", () => {
    expect(readSites("aiCalorieAdjustment")).toEqual([]);
  });

  it("keeps the corrected claim in the source", () => {
    // The comment is the deliverable here — the dead bytes are harmless; a
    // comment pointing at a consumer that does not exist is not.
    //
    // Only the positive assertion. The first version also forbade the old
    // wording, which failed immediately: the correction QUOTES it ("This
    // comment used to say …"). A regex cannot tell a quoted-historical
    // mention from a reinstated claim, and the version that could would be
    // deleting the record of what was wrong — which is the thing worth
    // keeping. The two reader assertions above are what would actually fail
    // if the claim became true again.
    const src = readFileSync(
      resolve(repoRoot, "src/lib/goalWeightPlan.ts"),
      "utf8"
    );
    expect(src).toMatch(/WRITTEN BUT NEVER READ/);
  });
});
