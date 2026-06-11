import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import {
  PROFILE_FIELD_REGISTRY,
  CLIENT_WRITABLE_PROFILE_FIELDS,
  SANITIZED_PROFILE_FIELDS,
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
    expect(CLIENT_WRITABLE_PROFILE_FIELDS).toEqual(
      sorted(CLIENT_WRITABLE_PROFILE_FIELDS)
    );
  });
});
