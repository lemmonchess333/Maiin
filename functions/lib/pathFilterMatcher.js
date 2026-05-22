/**
 * R1A-Deletion — segment-aware pathFilter matcher.
 *
 * The deletion inventory uses pathFilter values like "feeds/*\/items" to
 * scope collectionGroup queries. A naive substring check (path.includes
 * "/feeds/") is unsafe — a path like admin/feeds_archive/x/items would
 * pass it. This matcher splits on "/" and compares segment-by-segment.
 *
 * Contract:
 *   matchesPathFilter("feeds/*\/items", "feeds/abc/items/doc1") -> true
 *   matchesPathFilter("feeds/*\/items", "feeds/abc/items")      -> true (matches the parent prefix)
 *   matchesPathFilter("feeds/*\/items", "admin/feeds_archive/x/items/doc1") -> false
 *   matchesPathFilter("feeds/*\/items", "testFixtures/feeds/x/items/doc1") -> false
 *   matchesPathFilter("blocks/*\/users", "following/uidA/users/uidB") -> false
 *
 * Wildcard rule: "*" matches exactly one non-empty segment. There is no
 * "**" / multi-segment wildcard — Firestore collectionGroup queries
 * scope by collection name, not by arbitrary depth, so a multi-segment
 * wildcard would be misleading.
 *
 * Chunk 1.1 scope: pure function + helper signatures. The deletion
 * executor consumes this in Chunk 3 to filter collectionGroup query
 * results by parent path BEFORE batched delete.
 */
"use strict";

/**
 * Returns true if pathFilter matches the leading segments of
 * candidatePath. Extra trailing segments in candidatePath are allowed
 * (so the same matcher works for both parent-path matching and
 * leaf-doc-path matching).
 *
 * pathFilter and candidatePath are both forward-slash-separated.
 * Leading and trailing slashes on either input are tolerated and
 * stripped. Empty segments are rejected (returns false).
 *
 * Inputs that are not strings return false (defensive).
 */
function matchesPathFilter(pathFilter, candidatePath) {
  if (typeof pathFilter !== "string" || typeof candidatePath !== "string") {
    return false;
  }
  const filterSegments = pathFilter.replace(/^\/+|\/+$/g, "").split("/");
  const candidateSegments = candidatePath.replace(/^\/+|\/+$/g, "").split("/");

  // Reject empty inputs and malformed shapes.
  if (filterSegments.length === 0 || filterSegments.some((s) => s === "")) return false;
  if (candidateSegments.length === 0 || candidateSegments.some((s) => s === "")) return false;

  // Candidate must have at least as many segments as the filter prefix.
  if (candidateSegments.length < filterSegments.length) return false;

  for (let i = 0; i < filterSegments.length; i++) {
    const filterSeg = filterSegments[i];
    const candidateSeg = candidateSegments[i];
    if (filterSeg === "*") {
      // Wildcard segment matches any single non-empty value (already
      // checked above).
      continue;
    }
    if (filterSeg !== candidateSeg) return false;
  }
  return true;
}

/**
 * Validate a pathFilter string is well-formed. Used by inventory
 * validation tests to reject malformed entries.
 */
function isValidPathFilter(pathFilter) {
  if (typeof pathFilter !== "string") return false;
  const segments = pathFilter.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.length < 2) return false; // need at least "X/*" or "X/Y" — 1-segment filter is collection-only, use type:collectionGroup directly
  if (segments.some((s) => s === "")) return false;
  // Wildcard must appear at internal positions, not at the leaf (which would mean "any leaf").
  // A trailing wildcard would match any subcollection, defeating segment-aware filtering.
  if (segments[segments.length - 1] === "*") return false;
  return true;
}

/**
 * Inventory validation helper. Throws if any included entry of type
 * `collectionGroupByField` / `collectionGroupByDocId` / `collectionGroup` lacks
 * a pathFilter or has a malformed one. Called by inventory shape tests.
 *
 * Exceptions (entries explicitly exempted from pathFilter requirement):
 *   - None today. Adding an exemption requires extending this allow-list
 *     AND documenting the reason in the inventory entry.
 */
function assertEveryCollectionGroupHasPathFilter(included) {
  const missing = [];
  for (const entry of included) {
    const needsFilter =
      entry.type === "collectionGroupByField" ||
      entry.type === "collectionGroupByDocId" ||
      entry.type === "collectionGroup";
    if (!needsFilter) continue;
    if (!entry.pathFilter) {
      missing.push(`${entry.key} (type=${entry.type})`);
      continue;
    }
    if (!isValidPathFilter(entry.pathFilter)) {
      missing.push(`${entry.key} has malformed pathFilter: ${entry.pathFilter}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Inventory validation: collectionGroup entries missing valid pathFilter:\n  ${missing.join("\n  ")}`,
    );
  }
}

module.exports = {
  matchesPathFilter,
  isValidPathFilter,
  assertEveryCollectionGroupHasPathFilter,
};
