"use strict";

/**
 * Stands in for find-yarn-workspace-root@2.0.0 under patch-package, through
 * "overrides" in the root package.json.
 *
 * Why: the real module depends on micromatch, which depends on braces, and
 * every braces release (<=3.0.3) carries a high advisory with no fix yet
 * (GHSA-vfj7-8cjw-p6xm). CI's audit job fails on any high advisory in the
 * root tree, development tools included, so patch-package could not be added
 * without it.
 *
 * What it does: patch-package asks this module for the root of a Yarn
 * workspace. Tropos is an npm project and declares no `workspaces`, and for
 * such a project the real module walks up every directory and answers null.
 * This does the same walk and answers null. If any package.json on the way
 * up declares `workspaces`, it throws instead of guessing, since answering
 * that case is the one thing it cannot do.
 *
 * Remove the override, and this directory, once braces publishes a fix.
 */
const fs = require("fs");
const path = require("path");

module.exports = function findWorkspaceRoot(initial) {
  let current = path.normalize(initial || process.cwd());
  let previous = null;
  do {
    const file = path.join(current, "package.json");
    if (fs.existsSync(file)) {
      const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
      if (manifest && manifest.workspaces) {
        throw new Error(
          "find-yarn-workspace-root (shim): " +
            file +
            " declares workspaces, which this shim does not resolve. Remove " +
            "the override in package.json to use the real module."
        );
      }
    }
    previous = current;
    current = path.dirname(current);
  } while (current !== previous);
  return null;
};
