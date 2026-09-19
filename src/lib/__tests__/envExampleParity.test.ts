import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join } from "node:path";

/**
 * `.env.example` is the whole client env surface, or it is worse than
 * nothing.
 *
 * A `VITE_` var is addressed by a string the compiler never checks, and
 * an unset one does not throw — `import.meta.env.VITE_THING` is simply
 * `undefined`, so the feature behind it goes quiet. That makes a missing
 * declaration invisible from both ends: the developer who set up from
 * this file has no idea a var exists, and the code that reads it degrades
 * instead of failing.
 *
 * Four were undeclared when this was written, and the costs run from
 * silent to embarrassing:
 *
 *   - `VITE_ADMIN_UIDS` gates the `/admin/moderation` route, and it was
 *     absent from this file AND from every deploy workflow — so the
 *     moderation queue 403'd in every build ever deployed, including for
 *     the owner. The server callable re-checks `ADMIN_UIDS` on its own,
 *     so this was a door nobody could open rather than a hole.
 *   - `VITE_FIREBASE_VAPID_KEY` — web push registration, skipped silently.
 *   - `VITE_ROUTE_PLANNING_ENABLED` — the Pro road-align layer, off.
 *   - `VITE_REVENUECAT_IOS_KEY` — the one this rule was learned from.
 *
 * The reverse direction is the same failure wearing a different coat, and
 * it costs someone an afternoon rather than a feature.
 * `VITE_STRIPE_LIFETIME_PRICE_ID` sat here reading like configuration for
 * months; `PlanId` is monthly | yearly and nothing ever read it. A
 * declaration for a var no code consults is an instruction to set
 * something and then wonder why it did nothing.
 *
 * Scope is deliberately `src/` against this file, and NOT the deploy
 * workflows. A var legitimately absent from a workflow is ordinary —
 * `VITE_FIREBASE_MEASUREMENT_ID` is web-only, `VITE_RECAPTCHA_V3_SITE_KEY`
 * is skipped on native because appCheck.ts branches before it reads the
 * key, and `VITE_REVENUECAT_IOS_KEY` is withheld on purpose until the
 * RevenueCat backend is live. A rule with that many honest exceptions
 * becomes an exemption list, and an exemption list is how a guard stops
 * guarding. Those choices are written beside the env blocks that make
 * them instead.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Real reads only. `.env.example` and the source both discuss these vars
 * in prose — "set the VITE_FIREBASE_* secrets" — and a bare name-shaped
 * scan picks up the comment as though it were a call site, inventing a
 * `VITE_FIREBASE_` that nothing reads.
 */
const READ = /import\.meta\.env\.(VITE_[A-Z0-9_]+)/g;

/** A declaration is an assignment at column zero, not a mention. */
const DECLARED = /^(VITE_[A-Z0-9_]+)=/gm;

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "__tests__") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** name -> the files that read it. */
function readVars(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(resolve(repoRoot, "src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(READ)) {
      const sites = found.get(m[1]) ?? [];
      sites.push(relative(repoRoot, file));
      found.set(m[1], sites);
    }
  }
  return found;
}

function declaredVars(): Set<string> {
  const text = readFileSync(resolve(repoRoot, ".env.example"), "utf8");
  return new Set([...text.matchAll(DECLARED)].map((m) => m[1]));
}

describe(".env.example covers the client env surface", () => {
  it("declares every VITE_ var src/ reads", () => {
    const declared = declaredVars();
    const missing = [...readVars()]
      .filter(([name]) => !declared.has(name))
      .map(([name, sites]) => `${name}  (${[...new Set(sites)].join(", ")})`)
      .sort();

    expect(
      missing,
      `Read by the app, documented nowhere:\n  ${missing.join("\n  ")}\n\n` +
        `An unset VITE_ var is \`undefined\`, not an error, so whatever ` +
        `depends on it goes quiet in every build where nobody knew to set ` +
        `it. Add each with a comment saying what turns off without it. If ` +
        `one is deliberately withheld from a deploy, say so beside that ` +
        `workflow's env block — it still belongs in this file.`
    ).toEqual([]);
  });

  it("declares nothing src/ never reads", () => {
    const read = new Set(readVars().keys());
    const unread = [...declaredVars()].filter((name) => !read.has(name)).sort();

    expect(
      unread,
      `Declared here, read by no source file:\n  ${unread.join("\n  ")}\n\n` +
        `This file is instructions. A var nothing consults tells someone ` +
        `to configure a feature that does not exist, and they find out by ` +
        `setting it and watching nothing happen. Delete it, or say in a ` +
        `comment where it IS read if that is somewhere this scan cannot ` +
        `see.`
    ).toEqual([]);
  });

  it("reads both sides at all", () => {
    /* The absence assertion. Either regex quietly matching nothing makes
       both checks above vacuous and green — a clean bill of health over
       a file and a tree neither one read. Pinned loose enough to survive
       ordinary churn, tight enough that an empty scan cannot clear it. */
    const read = readVars();
    expect(read.size).toBeGreaterThan(10);
    expect([...read.keys()]).toContain("VITE_FIREBASE_API_KEY");
    expect(declaredVars().size).toBeGreaterThan(10);
  });

  it("counts a declaration, not a mention of one", () => {
    /* Both files discuss these names in prose. A scan that took the
       header sentence "set the VITE_FIREBASE_* secrets" for a
       declaration would mark the surface covered without any line
       actually declaring anything. */
    const sample = [
      "# set the VITE_FIREBASE_* secrets before deploying",
      "#VITE_COMMENTED_OUT=1",
      "  VITE_INDENTED=1",
      "VITE_REAL=",
    ].join("\n");
    expect([...sample.matchAll(DECLARED)].map((m) => m[1])).toEqual([
      "VITE_REAL",
    ]);
  });
});
