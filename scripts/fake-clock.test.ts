import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The clock shifter is a GATE's mechanism, so the thing worth testing is
 * not that it works when configured — it is that it cannot report
 * success while doing nothing.
 *
 * That lesson is the `unit-locale` job's: a locale that silently fails
 * to resolve leaves the suite running in en-US and passing vacuously,
 * which is worse than having no job at all, so that job proves the
 * locale took before trusting the run. `unit-future` has the same
 * exposure in two places — a mis-set variable, and a require path that
 * does not reach Vitest's workers — and this file holds the first of
 * them.
 */
const clock = fileURLToPath(new URL("./fake-clock.cjs", import.meta.url));
const DAY = 86_400_000;

/**
 * Runs `expr` in a child node with the shifter preloaded, under exactly
 * the configuration passed and no other.
 *
 * Stripping both variables from the inherited environment is load-bearing
 * rather than tidy: this suite is itself run under a shifted clock by the
 * `unit-future` job, so a child that inherited the parent's offset would
 * be compared against an already-shifted parent and measure a difference
 * of zero. Caught by running it that way, not by reading it.
 */
function withClock(
  env: Record<string, string>,
  expr: string
): { stdout: string; stderr: string; status: number | null } {
  const clean = { ...process.env };
  delete clean.TROPOS_CLOCK_OFFSET_DAYS;
  delete clean.TROPOS_CLOCK_AT;
  const r = spawnSync(process.execPath, ["--require", clock, "-e", expr], {
    encoding: "utf8",
    env: { ...clean, ...env },
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

const NOW_EXPR = "process.stdout.write(String(Date.now()))";

describe("fake-clock", () => {
  it("moves `now` by the requested number of days", () => {
    /* Measured child-against-child rather than child-against-parent, so
       the assertion means the same thing whether or not the suite
       running it is itself shifted. */
    const at = Number(withClock({}, NOW_EXPR).stdout);
    const shifted = Number(
      withClock({ TROPOS_CLOCK_OFFSET_DAYS: "90" }, NOW_EXPR).stdout
    );
    /* A window rather than an equality: the two children start a moment
       apart. Wide enough for a slow spawn, far narrower than the day it
       is asserting. */
    expect(shifted - at).toBeGreaterThan(90 * DAY - 60_000);
    expect(shifted - at).toBeLessThan(90 * DAY + 60_000);
  });

  it("moves `new Date()` too, not just `Date.now()`", () => {
    /* Both are reached by production code, and a shifter that moved only
       the static method would leave every `new Date()` in the app —
       which is most of them — reading the real clock, so the gate would
       exercise almost nothing while looking configured. */
    const r = withClock(
      { TROPOS_CLOCK_OFFSET_DAYS: "90" },
      "process.stdout.write(String(new Date().getTime() - Date.now()))"
    );
    expect(r.status).toBe(0);
    expect(Math.abs(Number(r.stdout))).toBeLessThan(60_000);
  });

  it("leaves explicit constructions exactly where they were", () => {
    /* The point of the whole exercise: a fixture's date literals must
       still mean the day they name. Only the notion of "now" moves, so
       a test that walks 90 days forward is asking "is this fixture still
       inside the window?", not "what happens if every date shifts?". */
    const r = withClock(
      { TROPOS_CLOCK_OFFSET_DAYS: "90" },
      `process.stdout.write([
         new Date("2026-07-20T00:00:00Z").toISOString(),
         new Date(0).toISOString(),
       ].join("|"))`
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("2026-07-20T00:00:00.000Z|1970-01-01T00:00:00.000Z");
  });

  it('keeps `instanceof Date` meaning "is a date"', () => {
    /* Replacing the global with a subclass quietly narrows `instanceof`:
       a Date built by anything holding the ORIGINAL constructor — a
       module loaded before the preload, a native binding inside a
       dependency — is not an instance of the subclass. The failure is
       uniquely unhelpful, naming an internal class nobody wrote:
       "expected 2027-09-15T00:00:00.000Z to be an instance of
       ShiftedDate".

       Found by running the FUNCTIONS suite under the shift, where
       firebase-admin returns dates it constructed itself. The client
       suite was green and could not have shown it — the copy that was
       measured is not the copy that proves the property. */
    const r = withClock(
      { TROPOS_CLOCK_OFFSET_DAYS: "90" },
      `const original = Object.getPrototypeOf(Date.prototype).constructor;
       const madeElsewhere = Reflect.construct(
         Object.getPrototypeOf(Date),
         [0],
         Object.getPrototypeOf(Date)
       );
       process.stdout.write([
         new Date() instanceof Date,
         new Date(0) instanceof Date,
         madeElsewhere instanceof Date,
         typeof original,
       ].join(","))`
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("true,true,true,function");
  });

  it("is a no-op when nothing asks for it", () => {
    /* Every ordinary `npm run test` loads this file only if one of the
       two variables is set, but a stray require must still cost nothing
       — otherwise adopting it anywhere becomes a risk. */
    const r = withClock(
      {},
      "process.stdout.write(String(new Date().getTime() - Date.now()))"
    );
    expect(r.status).toBe(0);
    expect(Math.abs(Number(r.stdout))).toBeLessThan(1_000);
  });

  it("refuses a malformed offset instead of quietly not shifting", () => {
    /* The vacuous-green case, and the reason this file exists. A typo in
       the workflow — `TROPOS_CLOCK_OFFSET_DAYS: ninety` — would leave
       the suite running at the ordinary date and reporting a pass, which
       is a gate that says the fixtures are safe for another quarter
       having checked nothing. It throws instead. */
    const r = withClock({ TROPOS_CLOCK_OFFSET_DAYS: "ninety" }, "");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("TROPOS_CLOCK_OFFSET_DAYS is not a number");
  });

  it("refuses a malformed absolute instant for the same reason", () => {
    const r = withClock({ TROPOS_CLOCK_AT: "next tuesday" }, "");
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("TROPOS_CLOCK_AT is not a date");
  });

  it("reaches the suite through the npm wrapper, not just a direct require", () => {
    /* The second vacuous-green hole, one level up from the tests above.
       `unit-future` proves the SCRIPT shifts a clock by requiring it
       directly — so a refactor of `run-unit-tests.mjs` that dropped the
       injection would leave that proof green while the suite itself ran
       at the ordinary date. This assertion runs INSIDE the shifted
       suite, so it can only hold if the wrapper really put it there.

       Same shape, and the same reason, as the first test in
       `deny-unit-network.test.ts`: the mechanism under test is the
       wrapper's, and only a test running under the wrapper can see it. */
    if (!process.env.TROPOS_CLOCK_OFFSET_DAYS && !process.env.TROPOS_CLOCK_AT) {
      /* An ordinary run asks for no shift and must see none — asserting
         the absence is what keeps this from being a test that simply
         skips itself into meaninglessness. */
      expect(process.env.NODE_OPTIONS ?? "").not.toContain("fake-clock");
      return;
    }
    expect(
      (process.env.NODE_OPTIONS ?? "").includes("fake-clock"),
      "A clock shift was requested but scripts/run-unit-tests.mjs did not " +
        "inject it, so this suite is running at the ordinary date while " +
        "reporting on a future one."
    ).toBe(true);
  });

  it("takes an absolute instant, for pinning the day a fixture expires", () => {
    /* How the two ExerciseHistory fixtures were diagnosed: bisecting on
       TROPOS_CLOCK_AT put the break on 2026-10-18 exactly, which is 90
       days after the literal they carried and is what identified the
       range pill as the mechanism. The offset form is for CI; this one
       is for finding out what broke. */
    const r = withClock(
      { TROPOS_CLOCK_AT: "2027-03-15T12:00:00Z" },
      "process.stdout.write(new Date().toISOString().slice(0, 10))"
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("2027-03-15");
  });
});
