/**
 * Every collection the app or the server names is accounted for by account
 * deletion: in the inventory (functions/accountDeletionInventory.json),
 * handled under another row, or listed below with why it holds no one.
 *
 * accountDeletionDrift.test.ts finds writes KEYED by a uid. A record that
 * carries the uid in a field under an auto id is invisible to it, and two
 * were: `audit_checkout_sessions` (the uid of every Stripe checkout) and
 * `commentModeration` (the author and text of every comment the filter
 * removed). Both outlived the account until 2026-10-20, and its first run
 * found two more: `appleNotifications` (the Apple webhook's record, uid
 * and transaction id) and the challenge progress markers under
 * `participants/{uid}/applied`, which deletes do not cascade to.
 * `appleSubscriptions` was handled by the executor and named nowhere.
 *
 * This is deliberately coarse: a name passes once any row's path names it,
 * so it says a collection was thought about, not that every field in it is
 * erased. That is what the erasure tests are for. What it stops is the
 * next collection nobody listed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const inventory = JSON.parse(
  readFileSync(
    join(repoRoot, "functions/accountDeletionInventory.json"),
    "utf8"
  )
);

/** Handled by a row whose path does not name the collection. */
const COVERED_BY: Record<string, string> = {
  // The account's likes on other people's posts, and those under its own.
  likes: "spacePosts",
  goalSpaceInvites: "goalSpaceMemberships",
  reportAuthority: "reportsAboutMe",
  // challenges/{id}/participants/{uid}/applied: progress markers.
  applied: "challengeParticipations",
  // users/{uid}/programState/current/commandReceipts.
  commandReceipts: "userProgramState",
};

/** Collections that hold nothing about a person, and why. */
const HOLDS_NO_ONE: Record<string, string> = {
  config: "config/flags: feature switches",
  system: "system/config: the deletion executor's switch",
  jobRuns:
    "one record per scheduled job: when it ran, its counts, and its last error with addresses removed",
  revenueCatEvents:
    "a webhook event's id, its type and what the sync did; the app user id is not kept",
  stripeEvents: "a webhook event's id, its type and when it was claimed",
};

function files(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}

const SERVER_PATTERNS = [
  /\.collection(?:Group)?\(\s*["'`]([A-Za-z_]+)["'`]/g,
  /\.doc\(\s*["'`]([A-Za-z_]+)\//g,
  /COLLECTION\w*\s*=\s*["'`]([A-Za-z_]+)["'`]/g,
];
const CLIENT_PATTERNS = [
  /\b(?:collection|collectionGroup|doc)\(\s*db\s*,\s*["'`]([A-Za-z_]+)["'`]/g,
];

function namedCollections(): Map<string, string> {
  const found = new Map<string, string>();
  const scan = (paths: string[], patterns: RegExp[]) => {
    for (const path of paths) {
      const source = readFileSync(path, "utf8");
      for (const pattern of patterns)
        for (const [, name] of source.matchAll(pattern))
          if (!found.has(name)) found.set(name, relative(repoRoot, path));
    }
  };
  scan(
    files(join(repoRoot, "functions"), (p) => p.endsWith(".js")),
    SERVER_PATTERNS
  );
  scan(
    files(
      join(repoRoot, "src"),
      (p) =>
        /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) && !p.includes("/test/")
    ),
    CLIENT_PATTERNS
  );
  return found;
}

/** Every collection id an inventory row's paths name. */
function inventoryCollections(): Set<string> {
  const names = new Set<string>();
  const add = (path: unknown) => {
    if (typeof path !== "string") return;
    path
      .split("/")
      .filter((_, i) => i % 2 === 0)
      .forEach((segment) => names.add(segment));
  };
  for (const entry of [...inventory.included, ...inventory.excluded]) {
    add(entry.path);
    add(entry.pathFilter);
    add(entry.sourcePath);
    add(entry.collectionGroup);
    for (const alias of entry.aliases || []) add(alias.path ?? alias);
  }
  return names;
}

describe("account deletion knows every collection", () => {
  const named = namedCollections();
  const listed = inventoryCollections();
  const keys = new Set(
    [...inventory.included, ...inventory.excluded].map(
      (e: { key: string }) => e.key
    )
  );

  it("finds the collections it is meant to read (sanity)", () => {
    for (const name of ["users", "activities", "rateLimits", "jobRuns"])
      expect(named.has(name), name).toBe(true);
  });

  it("every named collection is in the inventory, covered by a row, or holds no one", () => {
    const unaccounted = [...named]
      .filter(
        ([name]) =>
          !listed.has(name) && !(name in COVERED_BY) && !(name in HOLDS_NO_ONE)
      )
      .map(([name, file]) => `  ${name} (first named in ${file})`);
    expect(
      unaccounted,
      `Collections account deletion does not know about:\n${unaccounted.join("\n")}\n\n` +
        "Add a row to functions/accountDeletionInventory.json (and erase it in the executor), " +
        "or, if it holds nothing about a person, add it to HOLDS_NO_ONE with why."
    ).toEqual([]);
  });

  it("names only rows that exist, and nothing the inventory already lists", () => {
    for (const [name, key] of Object.entries(COVERED_BY)) {
      expect(keys.has(key), `${name} → ${key}`).toBe(true);
      expect(listed.has(name), name).toBe(false);
    }
    for (const name of Object.keys(HOLDS_NO_ONE))
      expect(listed.has(name), name).toBe(false);
  });

  it("lists no collection the code no longer names", () => {
    const stale = [
      ...Object.keys(COVERED_BY),
      ...Object.keys(HOLDS_NO_ONE),
    ].filter((name) => !named.has(name));
    expect(stale).toEqual([]);
  });
});
