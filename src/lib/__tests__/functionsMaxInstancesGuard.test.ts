/**
 * `maxInstances` cap enforcement (CLAUDE.md deploy gotcha — money safety).
 *
 * Cloud Functions v1 has NO default instance cap. A runaway client, a
 * call-in-render loop, or a DDoS can spin up thousands of containers and rack up
 * hundreds of pounds in HOURS. The rule: every HTTP (`https.onCall`/`onRequest`)
 * and Firestore/Pub-Sub-trigger function MUST declare a cap via
 * `functions.runWith({ maxInstances })` — `functions/index.js` defines three
 * tiers (`DEFAULT_HTTP_CAP = 100`, `ADMIN_HTTP_CAP = 10`, `TRIGGER_CAP = 50`).
 *
 * This guard scans `functions/index.js` for every INLINE function definition
 * (`exports.X = functions … .https/.firestore/.pubsub …`) and fails if it
 * doesn't also carry a `.runWith(`. A new uncapped function fails CI before it
 * can ship. (Re-exports of other modules — `exports.foo = appleIAP.foo` — carry
 * their caps in their own module and are out of scope here; the RHS isn't the
 * `functions` builder, so the scan skips them by construction.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const indexSrc = readFileSync(resolve(repoRoot, "functions/index.js"), "utf8");

interface ExportBlock {
  name: string;
  /** Text from the `exports.` line up to (not including) the next `exports.`. */
  body: string;
}

/** Split index.js into per-export blocks. */
function exportBlocks(src: string): ExportBlock[] {
  const parts = src.split(/\nexports\./);
  const blocks: ExportBlock[] = [];
  for (let i = 1; i < parts.length; i++) {
    const body = "exports." + parts[i];
    const name = (body.match(/^exports\.([A-Za-z0-9_]+)/) || [])[1] ?? "?";
    blocks.push({ name, body });
  }
  return blocks;
}

/** An INLINE function definition: `exports.X = functions …` (the
 *  firebase-functions v1 builder), as opposed to a re-export of another module. */
function isInlineFunctionDef(b: ExportBlock): boolean {
  return /^exports\.[A-Za-z0-9_]+\s*=\s*functions\b/.test(b.body);
}

/** Declares an HTTP / Firestore / Pub-Sub trigger (so a cap is mandatory). */
function declaresTrigger(b: ExportBlock): boolean {
  return /\.(https|firestore|pubsub)\./.test(b.body);
}

describe("Cloud Functions maxInstances cap enforcement", () => {
  const blocks = exportBlocks(indexSrc);
  const inlineDefs = blocks.filter(isInlineFunctionDef);

  it("scans a sane number of inline function definitions (scan isn't silently empty)", () => {
    // Guards against a refactor that changes the export shape and makes the scan
    // match nothing — a green-but-vacuous test. There are dozens of functions.
    expect(inlineDefs.length).toBeGreaterThan(15);
  });

  it("every inline HTTP/trigger function declares a runWith({ maxInstances }) cap", () => {
    const uncapped = inlineDefs
      .filter(declaresTrigger)
      .filter((b) => !/\.runWith\(/.test(b.body))
      .map((b) => b.name);
    expect(
      uncapped,
      `These functions declare a trigger but no runWith() cap. Cloud Functions ` +
        `v1 has NO default instance cap — an uncapped function can rack up huge ` +
        `costs under load. Add .runWith(DEFAULT_HTTP_CAP / ADMIN_HTTP_CAP / ` +
        `TRIGGER_CAP) (CLAUDE.md).\n  ${uncapped.join("\n  ")}`
    ).toEqual([]);
  });

  it("the three cap tiers are still defined in index.js", () => {
    // The fix the guard points to must exist. If a tier is renamed, update the
    // guidance — but don't let the tiers silently vanish.
    expect(indexSrc).toMatch(/DEFAULT_HTTP_CAP\s*=\s*\{\s*maxInstances:/);
    expect(indexSrc).toMatch(/ADMIN_HTTP_CAP\s*=\s*\{\s*maxInstances:/);
    expect(indexSrc).toMatch(/TRIGGER_CAP\s*=\s*\{\s*maxInstances:/);
  });
});
