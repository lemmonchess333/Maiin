/**
 * Every query that needs a composite index must declare one.
 *
 * This is the one Firestore failure class no other check in this repo can
 * reach. The emulator does NOT enforce indexes: a query missing one answers
 * happily in `test:rules` and in every unit test, then fails in production
 * with `FAILED_PRECONDITION: The query requires an index`. Green CI is not
 * merely insufficient here — it is silent by construction.
 *
 * That is exactly how the gap this test was written for survived.
 * `UserProfile` reads another user's recent activities with
 * `where("authorId","==") + where("visibility","in",[…]) + orderBy("createdAt")`
 * — three fields — while `firestore.indexes.json` declared only
 * `visibility,createdAt` and `crewId,visibility,createdAt`. In production
 * that query rejects, and `UserProfile` settles its reads with
 * `Promise.all([...]).finally(...)` and no `.catch`, so the rejection is
 * unhandled and the profile just shows no activities.
 *
 * WHAT THIS CAN AND CANNOT SEE. It reads literal `query(...)` calls: literal
 * collection name, literal field names, literal operators. A query whose
 * COLLECTION comes from a variable (every user-subcollection read) cannot be
 * matched against the index file — but whether a query needs a composite
 * index depends only on its FIELDS, so those are classified rather than
 * shrugged at: each one is checked for spanning more than one field, and the
 * test fails if any does. Every such query today is a single inequality
 * ordered by that same field, which an automatic index serves. A first version
 * of this
 * scanner used a non-greedy regex that stopped at the first inner `)`, which
 * made it miss the `socialApi` query that IS declared — it reported a clean
 * result while seeing almost nothing. The balanced-paren reader below is why
 * the positive control at the bottom matters: a scanner that finds nothing
 * looks identical to a codebase with nothing to find.
 *
 * A declared index that production already has is a no-op to deploy, so the
 * failure mode of over-declaring is cost, not breakage. Under-declaring is a
 * user-visible outage on one screen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Balanced-paren argument text for every `name(` call in `src`. */
function callArgs(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b${name}\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    out.push(src.slice(m.index + m[0].length, i - 1));
  }
  return out;
}

interface Declared {
  collectionGroup: string;
  queryScope: string;
  fields: { fieldPath: string; order?: string; arrayConfig?: string }[];
}
const declared: Declared[] = JSON.parse(
  readFileSync(resolve(repoRoot, "firestore.indexes.json"), "utf8")
).indexes;

/** An index covers a query when its field list starts with the query's
 *  equality fields (any order) and then the ordered field. Compared as a
 *  SET for the equality prefix + the orderBy field present, which is the
 *  loose-but-safe direction: it can accept an index Firestore would reject,
 *  never reject one Firestore would accept. */
function covered(coll: string, eq: string[], orders: string[]): boolean {
  return declared.some((d) => {
    if (d.collectionGroup !== coll) return false;
    const paths = d.fields.map((f) => f.fieldPath);
    return (
      eq.every((f) => paths.includes(f)) &&
      orders.every((o) => paths.includes(o)) &&
      paths.length >= eq.length + orders.length
    );
  });
}

interface Query {
  file: string;
  coll: string;
  eq: string[];
  orders: string[];
}

function scan(): { queries: Query[]; skipped: number; unresolvable: string[] } {
  const unresolvable: string[] = [];
  const files = [
    ...globSync("src/**/*.{ts,tsx}", { cwd: repoRoot }),
  ].filter((f) => !f.includes("__tests__") && !f.includes(".test."));
  const queries: Query[] = [];
  let skipped = 0;

  for (const rel of files) {
    const src = readFileSync(resolve(repoRoot, rel), "utf8");
    for (const body of callArgs(src, "query")) {
      const wheres = [
        ...body.matchAll(
          /where\(\s*["'`]([\w.]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g
        ),
      ];
      const orders = [
        ...body.matchAll(/orderBy\(\s*["'`]([\w.]+)["'`]/g),
      ].map((x) => x[1]);
      if (!wheres.length || !orders.length) continue;

      const coll =
        body.match(/collection\(\s*\w+\s*,\s*["'`]([\w-]+)["'`]\s*\)/) ??
        body.match(/collectionGroup\(\s*\w+\s*,\s*["'`]([\w-]+)["'`]\s*\)/);
      const fields = wheres.map((w) => w[1]);
      if (!coll) {
        /* Collection built from variables (a user subcollection path). The
           NAME is unresolvable, but whether the query needs a composite
           index depends only on its FIELDS — so classify rather than shrug.
           Every such query in this codebase today is an inequality and an
           orderBy on the SAME field (`completedAt >= x` ordered by
           `completedAt`), which a single-field automatic index serves. */
        const sameFieldOnly =
          new Set([...fields, ...orders]).size === 1;
        if (!sameFieldOnly) unresolvable.push(`${rel}: where[${fields.join(", ")}] orderBy[${orders.join(", ")}]`);
        skipped += 1;
        continue;
      }
      const eq = fields;
      // A single equality on the SAME field as the orderBy needs no
      // composite index.
      if (eq.length === 1 && orders.length === 1 && eq[0] === orders[0]) continue;
      queries.push({ file: rel, coll: coll[1], eq, orders });
    }
  }
  return { queries, skipped, unresolvable };
}

const { queries, skipped, unresolvable } = scan();

describe("firestore composite indexes", () => {
  it("finds the queries it is supposed to be checking", () => {
    /* The positive control, and not a formality: the first version of this
       scanner matched nothing useful and reported a clean bill of health.
       A scanner that sees nothing is indistinguishable from a clean
       codebase unless something pins that it sees. */
    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(
      queries.some((q) => q.coll === "activities" && q.orders.includes("createdAt"))
    ).toBe(true);
  });

  it("declares an index for every multi-field ordered query", () => {
    const missing = queries
      .filter((q) => !covered(q.coll, q.eq, q.orders))
      .map(
        (q) =>
          `${q.coll}: where[${q.eq.join(", ")}] orderBy[${q.orders.join(", ")}]  (${q.file})`
      );
    expect(
      missing,
      `These queries need a composite index that firestore.indexes.json does not declare. ` +
        `The emulator does not enforce indexes, so they pass every test here and fail in ` +
        `production with FAILED_PRECONDITION:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("has no unverifiable query that would need a composite index", () => {
    /* The gate's blind spot, bounded by a PROPERTY rather than a count.
       A variable collection path can't be matched against the index file —
       but a query only needs a composite index because of its FIELDS, and
       every such query here is one inequality ordered by that same field,
       which an automatic single-field index serves.

       An earlier version asserted `skipped <= 12`, which would have gone
       green on a genuinely dangerous query simply by being the 12th. */
    expect(
      unresolvable,
      `These queries use a collection path this test cannot resolve AND span ` +
        `multiple fields, so whether they have an index cannot be verified ` +
        `here:\n  ${unresolvable.join("\n  ")}`
    ).toEqual([]);
    // Still non-vacuous: the classifier has to be seeing them at all.
    expect(skipped).toBeGreaterThan(0);
  });

  it("would reject a query with no matching index", () => {
    // Guards the guard: `covered` returning true for everything would make
    // the assertion above vacuous.
    expect(covered("activities", ["authorId", "visibility"], ["createdAt"])).toBe(true);
    expect(covered("activities", ["nonexistentField"], ["createdAt"])).toBe(false);
    expect(covered("noSuchCollection", ["a"], ["b"])).toBe(false);
  });
});
