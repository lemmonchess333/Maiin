/**
 * Client↔server constants that nothing was holding.
 *
 * `mirrorCrossTestGate` finds mirrors by scanning `functions/` for
 * mirror-DECLARING language — "mirror", "lockstep", "keep in sync". That
 * catches every module whose author knew they were writing one, and by
 * construction cannot catch a module that duplicates client logic
 * without ever saying so. These are that second kind:
 *
 *   GOAL_SPACE_MAX_MEMBERS  goalSpaceTypes.ts = 8, goalSpaceMembership.js = 8
 *   GOAL_SPACE_TEXT_MAX     the same two files, = 200
 *   LOOP_TARGETS_KM         routePlanningApi.ts and routePlanning.js
 *
 * A note on how the third one was found, because the method matters more
 * than the constant. Grepping cross-tests for a constant's NAME says only
 * that no test mentions it — most of these are pinned BEHAVIOURALLY, by a
 * parity test that never names them. Mutating each server copy and
 * running the root suite is the check that distinguishes the two, and it
 * cleared `MICROPLATE_STEP`, `PI_WEIGHTS` and `SPACE_IDS` that the
 * name-grep had flagged. `GOAL_SPACE_TEXT_MAX` was the one that survived
 * it — 200 -> 50 on the server left all 9874 tests green.
 *
 * Both agree today. Neither module says "mirror", so the gate is silent
 * on them, and each side's own suite only ever compares the constant to
 * itself — `functions/__tests__/goalSpaceMembership.test.js` asserts
 * `space.maxMembers === GOAL_SPACE_MAX_MEMBERS` using the server's own
 * copy, which is the tautology CLAUDE.md warns about: consistency, not
 * behaviour.
 *
 * What drift costs, concretely:
 *
 *   A capacity raised on the client alone offers a seat the server
 *   refuses — the UI shows 9 of 10 while the join callable rejects the
 *   9th member, and the user sees a space that is not full refusing
 *   them.
 *
 *   `LOOP_TARGETS_KM` is a server-side ALLOW-LIST: routePlanning.js
 *   rejects any km not in it. A distance offered by the client picker
 *   and absent from the server list is a button that always fails.
 *
 * Each pair is pinned two ways — equal to each other, and equal to a
 * literal. Equality alone passes when both copies are edited together in
 * the same wrong direction, which is the likelier mistake once someone
 * knows there are two.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  GOAL_SPACE_MAX_MEMBERS,
  GOAL_SPACE_TEXT_MAX,
} from "@/features/goalSpace/goalSpaceTypes";
import { LOOP_TARGETS_KM } from "@/lib/routePlanningApi";

const require = createRequire(import.meta.url);
const {
  GOAL_SPACE_MAX_MEMBERS: SERVER_MAX_MEMBERS,
  GOAL_SPACE_TEXT_MAX: SERVER_TEXT_MAX,
} = require("../../../functions/lib/goalSpaceMembership");
const {
  LOOP_TARGETS_KM: SERVER_LOOP_TARGETS,
} = require("../../../functions/lib/routePlanning");

describe("goal-space capacity — client ↔ server", () => {
  it("the two copies agree", () => {
    expect(SERVER_MAX_MEMBERS).toBe(GOAL_SPACE_MAX_MEMBERS);
  });

  it("and both are the locked value", () => {
    /* The literal, so a same-direction edit to BOTH copies still shows
       up in review rather than sailing through on the equality above. */
    expect(GOAL_SPACE_MAX_MEMBERS).toBe(8);
    expect(SERVER_MAX_MEMBERS).toBe(8);
  });
});

describe("goal-space text cap — client ↔ server", () => {
  /* The sibling of the capacity constant above, in the same two files,
     and missed on the first pass: pinning one constant in a module says
     nothing about the next one down. Mutating the server copy 200 -> 50
     left the whole root suite green.

     The two sides do DIFFERENT things with it, which is what decides how
     drift shows up. The client REJECTS over-length text
     (`payload.text.length > GOAL_SPACE_TEXT_MAX` -> "text missing/over
     bound"); the server TRUNCATES it (`value.trim().slice(0, …)`). So a
     server cap below the client's does not bounce the write — it quietly
     shortens what the user typed and stores the result. Silent data loss
     reads as a bug in the editor, not in a limit. */
  it("the two copies agree", () => {
    expect(SERVER_TEXT_MAX).toBe(GOAL_SPACE_TEXT_MAX);
  });

  it("and both are the locked value", () => {
    expect(GOAL_SPACE_TEXT_MAX).toBe(200);
    expect(SERVER_TEXT_MAX).toBe(200);
  });

  it("the client rejects while the server truncates", () => {
    /* Pins the asymmetry the comment above rests on, against the real
       sources — so the reasoning cannot rot into prose if either side
       changes which strategy it uses. */
    const { readFileSync } = require("node:fs");
    const client = readFileSync(
      new URL("../../features/goalSpace/goalSpaceTypes.ts", import.meta.url),
      "utf8"
    );
    const server = readFileSync(
      new URL("../../../functions/lib/goalSpaceMembership.js", import.meta.url),
      "utf8"
    );
    expect(client).toMatch(/length\s*>\s*GOAL_SPACE_TEXT_MAX/);
    expect(server).toMatch(/slice\(0,\s*GOAL_SPACE_TEXT_MAX\)/);
  });
});

describe("route-planning loop targets — client ↔ server", () => {
  it("the two copies agree", () => {
    /* Compared as plain arrays: the server freezes its copy and the
       client declares `as const`, so the values match while the object
       identities and mutability never can. */
    expect([...SERVER_LOOP_TARGETS]).toEqual([...LOOP_TARGETS_KM]);
  });

  it("and both are the locked set", () => {
    expect([...LOOP_TARGETS_KM]).toEqual([3, 5, 10, 15]);
    expect([...SERVER_LOOP_TARGETS]).toEqual([3, 5, 10, 15]);
  });

  it("the server treats its copy as an allow-list", () => {
    /* Why the pairing matters at all: this is not two displays of the
       same number, it is a picker on one side and a gate on the other.
       Anchored on the real source so the claim cannot rot into prose. */
    const { readFileSync } = require("node:fs");
    const src = readFileSync(
      new URL("../../../functions/lib/routePlanning.js", import.meta.url),
      "utf8"
    );
    expect(src).toMatch(/!LOOP_TARGETS_KM\.includes\(/);
  });
});
