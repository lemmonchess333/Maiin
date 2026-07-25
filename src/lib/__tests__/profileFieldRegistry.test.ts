import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import {
  PROFILE_FIELD_REGISTRY,
  CLIENT_WRITABLE_PROFILE_FIELDS,
  SANITIZED_PROFILE_FIELDS,
  TYPED_PROFILE_FIELDS,
} from "../profileFieldRegistry";

/**
 * D1 parity pin (docs/deepening-backlog.md). The profile field registry is the
 * single source of truth for client-writable fields; this test asserts the two
 * machine-checkable allow-lists never drift from it:
 *
 *   registry field set            ≡  firestore.rules allowedUserFields()
 *   registry-where-sanitized      ≡  profileSanitizer PROFILE_ALLOWED_FIELDS
 *
 * A new persisted profile field that's added to the type/widget but forgotten
 * in rules or the sanitiser used to be a SILENT data-loss bug (rule rejects the
 * write / CF strips the field). Now it fails here instead.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);

/** Parse the field-name string literals out of rules' allowedUserFields(). */
function rulesAllowList(): string[] {
  const rules = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");
  const m = rules.match(
    /function allowedUserFields\(\)\s*\{\s*return\s*\[([\s\S]*?)\];/
  );
  if (!m)
    throw new Error("could not locate allowedUserFields() in firestore.rules");
  return [...m[1].matchAll(/'([a-zA-Z0-9_]+)'/g)].map((x) => x[1]);
}

const { PROFILE_ALLOWED_FIELDS } = require(
  resolve(repoRoot, "functions/profileSanitizer.js")
) as { PROFILE_ALLOWED_FIELDS: string[] };

const asSet = (a: readonly string[]) => new Set(a);
const sorted = (a: readonly string[]) => [...a].sort();

describe("profile field registry — D1 allow-list parity", () => {
  it("registry has no duplicate fields", () => {
    const seen = new Set<string>();
    for (const e of PROFILE_FIELD_REGISTRY) {
      expect(seen.has(e.field), `duplicate registry field: ${e.field}`).toBe(
        false
      );
      seen.add(e.field);
    }
  });

  it("registry field set ≡ firestore.rules allowedUserFields()", () => {
    const rules = asSet(rulesAllowList());
    const reg = asSet(CLIENT_WRITABLE_PROFILE_FIELDS);
    const missingFromRules = [...reg].filter((f) => !rules.has(f));
    const missingFromRegistry = [...rules].filter((f) => !reg.has(f));
    // Split assertions so a failure names exactly which side drifted.
    expect(
      missingFromRules,
      "in registry but NOT in firestore.rules allow-list — add to rules"
    ).toEqual([]);
    expect(
      missingFromRegistry,
      "in firestore.rules allow-list but NOT in registry — add to registry"
    ).toEqual([]);
  });

  it("registry-where-sanitized ≡ profileSanitizer PROFILE_ALLOWED_FIELDS", () => {
    const san = asSet(PROFILE_ALLOWED_FIELDS);
    const reg = asSet(SANITIZED_PROFILE_FIELDS);
    const missingFromSanitizer = [...reg].filter((f) => !san.has(f));
    const missingFromRegistry = [...san].filter((f) => !reg.has(f));
    expect(
      missingFromSanitizer,
      "marked sanitized in registry but NO validator in profileSanitizer.js — add a validator"
    ).toEqual([]);
    expect(
      missingFromRegistry,
      "has a profileSanitizer validator but not sanitized:true in the registry — fix the registry"
    ).toEqual([]);
  });

  it("every sanitized field is also client-writable (sanitizer ⊆ rules)", () => {
    // The CF only persists what the security rules also permit; a sanitised
    // field the client can't write directly would be a contradiction.
    const writable = asSet(CLIENT_WRITABLE_PROFILE_FIELDS);
    const offenders = SANITIZED_PROFILE_FIELDS.filter((f) => !writable.has(f));
    expect(offenders).toEqual([]);
  });

  it("server-guarded fields are never sanitised (server owns their value)", () => {
    const offenders = PROFILE_FIELD_REGISTRY.filter(
      (e) => e.serverGuarded && e.sanitized
    ).map((e) => e.field);
    expect(offenders).toEqual([]);
  });

  it("registry is sorted (stable diffs when fields are added)", () => {
    expect(PROFILE_FIELD_REGISTRY.map((e) => e.field)).toEqual(
      sorted(PROFILE_FIELD_REGISTRY.map((e) => e.field))
    );
  });
});

/**
 * The gate that was missing.
 *
 * Rules and sanitiser were both pinned to the registry — but the `UserProfile`
 * TYPE, the thing a developer edits when adding a field, was pinned to nothing.
 * So a field could be declared, written by real UI code, and rejected by the
 * security rules with nobody the wiser. That happened three times:
 * `hideWeightNumber` (#984), `goalWeightKg` (#1140), and `aiAnalysisEnabled` +
 * `timezone` (found by this test, fixed alongside it).
 *
 * Two escape hatches, both narrow and both enumerated in the registry:
 *   `serverOnly`  — on the type, deliberately NOT rules-writable
 *   `undeclared`  — rules-writable, not yet on the type (legacy debt)
 */
describe("profile field registry — UserProfile type parity", () => {
  /**
   * Field names declared directly on the `UserProfile*` interfaces. Depth is
   * tracked so fields of nested object literals (`program: { goal: … }`) don't
   * leak in as top-level profile fields.
   */
  function typeFields(): Map<string, string> {
    const src = readFileSync(resolve(repoRoot, "src/lib/auth.tsx"), "utf8");
    const found = new Map<string, string>();
    let current: string | null = null;
    let depth = 0;
    for (const line of src.split("\n")) {
      const open = /^export interface (UserProfile\w+)\s*\{/.exec(line);
      if (open) {
        current = open[1];
        depth = 1;
        continue;
      }
      if (!current) continue;
      if (depth === 1) {
        const field = /^ {2}(\w+)\??\s*:/.exec(line);
        if (field) found.set(field[1], current);
      }
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      if (depth <= 0) current = null;
    }
    return found;
  }

  const declared = typeFields();

  it("parses the UserProfile interfaces (guards a silently-broken scan)", () => {
    // If the interfaces are restructured and this drops to ~0, every
    // assertion below would pass vacuously.
    expect(declared.size).toBeGreaterThan(60);
    expect(declared.get("weightKg")).toBe("UserProfileFitness");
  });

  it("every typed profile field is in the registry", () => {
    const missing = [...declared.keys()]
      .filter((f) => !TYPED_PROFILE_FIELDS.includes(f))
      .map((f) => `${f} (declared in ${declared.get(f)})`)
      .sort();
    expect(
      missing,
      `These are on the UserProfile type but not in the registry — so they are ` +
        `NOT in firestore.rules allowedUserFields(), and any client write ` +
        `carrying them is rejected outright (the whole write, not just the ` +
        `field, because the rule uses hasOnly()). Add them to the registry, ` +
        `then to the rules; or mark serverOnly if a client must never write them.`
    ).toEqual([]);
  });

  it("every registry field is declared on the type, or flagged undeclared", () => {
    const missing = PROFILE_FIELD_REGISTRY.filter(
      (e) => !e.undeclared && !declared.has(e.field)
    ).map((e) => e.field);
    expect(
      missing,
      `These are rules-writable but absent from the UserProfile type, so ` +
        `writing them needs a cast. Give them a type, or add an ` +
        `\`undeclared: "<reason>"\` note to the registry entry.`
    ).toEqual([]);
  });

  it("`undeclared` stays honest — a flagged field must really be absent", () => {
    // The direction that rots quietly: someone types the field, nobody
    // removes the flag, and the debt list stops describing reality.
    const stale = PROFILE_FIELD_REGISTRY.filter(
      (e) => e.undeclared && declared.has(e.field)
    ).map((e) => e.field);
    expect(
      stale,
      `These now HAVE a type — drop the \`undeclared\` flag from the registry.`
    ).toEqual([]);
  });

  it("serverOnly fields are absent from the rules allow-list", () => {
    // Allow-listing one of these IS the bug: a client that could write
    // `hasUsedTrial: false` grants itself a second free trial.
    const rules = asSet(rulesAllowList());
    const leaked = PROFILE_FIELD_REGISTRY.filter(
      (e) => e.serverOnly && rules.has(e.field)
    ).map((e) => e.field);
    expect(leaked).toEqual([]);
  });

  it("serverOnly fields are neither sanitised nor serverGuarded", () => {
    // serverGuarded means "allow-listed then held immutable" — the opposite
    // arrangement. A field claiming both categories is a contradiction.
    const confused = PROFILE_FIELD_REGISTRY.filter(
      (e) => e.serverOnly && (e.sanitized || e.serverGuarded)
    ).map((e) => e.field);
    expect(confused).toEqual([]);
  });
});
