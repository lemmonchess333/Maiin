import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join } from "node:path";

/**
 * A callable is addressed by a string, so the compiler never sees the
 * other end of it.
 *
 * `httpsCallable(functions, "doThing")` typechecks whether or not
 * `functions/` exports `doThing`. Call a name nothing implements and
 * the client gets `functions/not-found` at runtime, on a device, in
 * the hands of whoever was unlucky enough to tap the button. Nothing
 * in lint, tsc, the unit suite or the emulator suite looks across that
 * seam, because each side is internally consistent.
 *
 * Two existed when this was written, both on the money path and both
 * in `purchaseProvider.ts`. A guard that lands red is a guard somebody
 * turns off, so both were closed in the same change — but they were
 * closed from opposite ends, and which end is the interesting part:
 *
 *   - `syncRevenueCatEntitlement` — called after a successful
 *     RevenueCat purchase AND after a successful restore. Its caller
 *     swallows the failure on purpose ("tolerated: webhook is the
 *     source of truth"), and there was no webhook: `functions/` did not
 *     contain the string "revenuecat" anywhere. That branch charged the
 *     card, reported success to the UI, and wrote no entitlement. It
 *     was unreachable only because `VITE_REVENUECAT_IOS_KEY` was unset
 *     in every build. That one is a missing implementation, so the
 *     implementation was written.
 *   - `createStripeBillingPortal` — the Manage Subscription action on
 *     web and Android. This one is NOT a gap. Sub4 keeps the Stripe
 *     backend dormant and names this callable as the piece that "stays
 *     unbuilt", because no web billing is sold, and CLAUDE.md says the
 *     same in as many words. So the CALL SITE went. Implementing it to
 *     satisfy this guard would have reversed a locked decision to make
 *     a new test go green, which is precisely what the lock discipline
 *     exists to prevent — and a first pass at this change did exactly
 *     that before the lock was read.
 *
 * Both halves carry a lesson worth keeping. The comment above the first
 * describes a division of labour with a component that was never built,
 * and it reads as reassurance, so the swallow looks deliberate rather
 * than load-bearing; this guard is the thing that would have said
 * otherwise. The second is the reminder that an unimplemented callable
 * is not automatically a defect: read the locks before deciding which
 * end of the seam is wrong.
 */
const selfPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(selfPath), "../../..");

/**
 * Every shape the repo actually uses for the callable reference:
 *
 *   httpsCallable(functions, "x")
 *   httpsCallable(getFunctions(), "x")
 *   httpsCallable(fns(), "x")
 *   httpsCallable<Req, Res>(functions, "x")   — generics may wrap lines
 *
 * The first argument is whatever hands over a Functions instance, so it
 * is matched loosely and thrown away. The second is the contract.
 */
const CALLABLE =
  /httpsCallable\s*(?:<[\s\S]*?>)?\s*\(\s*[A-Za-z0-9_.]+\s*(?:\([^)]*\))?\s*,\s*"([^"]+)"/g;

/** `exports.name = …` in functions/, including the re-export lines. */
const EXPORTED = /^exports\.([A-Za-z0-9_]+)\s*=/gm;

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === ".git" ||
      entry === "__tests__"
    ) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** name -> the call sites that ask for it. */
function calledNames(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles(resolve(repoRoot, "src"))) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(CALLABLE)) {
      const name = match[1];
      const sites = found.get(name) ?? [];
      sites.push(relative(repoRoot, file));
      found.set(name, sites);
    }
  }
  return found;
}

function serverExports(): Set<string> {
  const names = new Set<string>();
  const dir = resolve(repoRoot, "functions");
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".js")) continue;
    const src = readFileSync(join(dir, entry), "utf8");
    for (const match of src.matchAll(EXPORTED)) names.add(match[1]);
  }
  return names;
}

describe("every callable the client names is implemented", () => {
  it("finds no client call site without a matching export in functions/", () => {
    const exported = serverExports();
    const offenders = [...calledNames()]
      .filter(([name]) => !exported.has(name))
      .map(([name, sites]) => `${name}  (${[...new Set(sites)].join(", ")})`)
      .sort();

    expect(
      offenders,
      `These callables are addressed by the client and exported by ` +
        `nothing:\n  ${offenders.join("\n  ")}\n\n` +
        `Each one throws functions/not-found the moment a user reaches ` +
        `it. Implement it in functions/ and export it from index.js, or ` +
        `delete the call site. A caller that catches the failure is not a ` +
        `fix: it converts a visible error into a silent one, which is how ` +
        `both of the originals survived.`
    ).toEqual([]);
  });

  it("sees the call sites at all", () => {
    /* The absence assertion. A regex that stopped matching would make
       the test above pass with an empty offender list and report a
       clean bill of health over a repo it never read. Pinned low
       enough to survive ordinary churn, high enough that a broken
       extractor cannot clear it. */
    const names = calledNames();
    expect(names.size).toBeGreaterThan(25);
    expect([...names.keys()]).toContain("deleteMyAccount");
    expect(serverExports().size).toBeGreaterThan(50);
  });

  it("matches each call shape the repo uses", () => {
    const shapes = [
      'httpsCallable(functions, "alpha")',
      'httpsCallable(getFunctions(), "beta")',
      'httpsCallable(fns(), "gamma")',
      'httpsCallable<{ a: string }, { b: number }>(functions, "delta")',
      'const f = httpsCallable<\n  { a: string },\n  { b: number }\n>(functions, "epsilon");',
    ];
    const seen = shapes.flatMap((shape) =>
      [...shape.matchAll(CALLABLE)].map((m) => m[1])
    );
    expect(seen).toEqual(["alpha", "beta", "gamma", "delta", "epsilon"]);
  });

  it("is itself out of scope", () => {
    /* This file's prose quotes the two orphan names. It lives under
       __tests__, which the walker skips, and that skip is what keeps
       the quotes from reading as call sites. Asserted rather than
       assumed. */
    expect(sourceFiles(resolve(repoRoot, "src"))).not.toContain(selfPath);
  });
});
