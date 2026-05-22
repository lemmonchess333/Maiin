/**
 * R1A-Deletion — canonical inventory loader.
 *
 * The inventory itself lives in accountDeletionInventory.json so the
 * drift-prevention test (src/lib/__tests__/accountDeletionDrift.test.ts)
 * can read it without import resolution gymnastics across the
 * functions/ ↔ src/ boundary. This module wraps the JSON in helpers
 * the deletion executor (Chunk 3) consumes.
 *
 * Chunk 1 scope: data only. No execution paths read this yet.
 */
"use strict";

const inventory = require("./accountDeletionInventory.json");

/**
 * Resolve a path template (e.g. "users/{uid}/meals") against a uid.
 * Returns the concrete path string the deletion executor passes to
 * Firestore. Templates with multiple placeholders (e.g. mirror paths
 * containing {targetUid}) require additional substitutions supplied
 * by the per-edge cleanup logic.
 */
function resolvePath(template, substitutions) {
  let out = template;
  for (const [k, v] of Object.entries(substitutions)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

/**
 * Returns every path that should be swept for this uid, including
 * legacy aliases so renames don't silently leave orphan data behind.
 *
 * Reads `entry.aliases` (Chunk 1.1 schema): an array of
 * `{ key, path, reason }` objects, each treated as an executable
 * deletion target. Missing alias paths are handled as success by the
 * executor (NotFound = no-op) — see accountDeletionLegacyAliases test.
 */
function expandUserSubcollectionPaths(entry, uid) {
  const paths = [resolvePath(entry.path, { uid })];
  for (const alias of entry.aliases || []) {
    const aliasPath = typeof alias === "string" ? alias : alias.path;
    if (aliasPath) paths.push(resolvePath(aliasPath, { uid }));
  }
  return paths;
}

function getIncluded() {
  return inventory.included;
}

function getExcluded() {
  return inventory.excluded;
}

function getEntryByKey(key) {
  return (
    inventory.included.find((e) => e.key === key) ||
    inventory.excluded.find((e) => e.key === key) ||
    null
  );
}

function getInventoryVersion() {
  return inventory.version;
}

module.exports = {
  inventory,
  resolvePath,
  expandUserSubcollectionPaths,
  getIncluded,
  getExcluded,
  getEntryByKey,
  getInventoryVersion,
};
