/**
 * Server-formatted text names its locale.
 *
 * A Cloud Function's output is not one user's screen. `socialFanout`
 * builds a feed item's `summary` ONCE and fans it out to every follower,
 * `streakNudge` and `pushSchedule` build notification copy, and all of
 * it is persisted. There is no viewer whose locale these could follow,
 * so a bare `toLocaleString()` takes the CONTAINER's locale — nobody's
 * choice, and free to change under the runtime. The same feed would then
 * carry "5,200 kg volume" on old items and "5.200 kg volume" on new
 * ones.
 *
 * Found by running the functions suite in `de_DE.UTF-8`, which it had
 * never been run in: `ci.yml`'s `unit-locale` and `unit-timezone` jobs
 * run the CLIENT suite only, and `unit-future` is the one job that runs
 * both. One test failed, on `socialFanout`'s volume figure — the single
 * locale-less formatter in the whole of `functions/`. Its five siblings
 * already pass an explicit locale: `en-CA` in `streakNudge`,
 * `programCommands` and `aiScanQuota` for ISO-shaped dates, `en-GB` and
 * `en-US` in `pushSchedule` for a 24h hour and a weekday name.
 *
 * Scope is deliberately `functions/` only. On the CLIENT a locale-less
 * number genuinely should follow the device, and CLAUDE.md bans only the
 * locale-less DATE form there. The asymmetry is the point: the server
 * has no device to follow.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const functionsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Non-test server sources. */
function serverFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (["node_modules", "__tests__", "coverage"].includes(name)) continue;
      serverFiles(abs, out);
    } else if (name.endsWith(".js") && !name.includes(".test.")) {
      out.push(abs);
    }
  }
  return out;
}

/** `toLocaleString()` / `toLocaleDateString()` / … with NO argument. */
const BARE_TO_LOCALE = /\.toLocale(?:String|DateString|TimeString)\s*\(\s*\)/;
/** `new Intl.X()` with no locale — same hazard, different spelling. */
const BARE_INTL = /new Intl\.\w+\s*\(\s*\)/;

describe("server-formatted text names its locale", () => {
  const files = serverFiles(functionsRoot);

  it("scans a real number of server files", () => {
    // Anti-vacuity: a broken walk would report no offenders forever.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith(join("lib", "socialFanout.js")))).toBe(
      true
    );
  });

  it("never formats with the container's locale", () => {
    const offenders = [];
    for (const file of files) {
      const rel = relative(functionsRoot, file);
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (BARE_TO_LOCALE.test(line) || BARE_INTL.test(line))
            offenders.push(`${rel}:${i + 1} — ${line.trim()}`);
        });
    }
    expect(
      offenders,
      "These format text with whatever locale the Cloud Functions " +
        "container resolves, and the result is persisted and read by " +
        "every follower. Pass an explicit locale, as the rest of " +
        "functions/ does: " +
        offenders.join(", ")
    ).toEqual([]);
  });
});
