/**
 * Two client↔server constants that nothing was holding.
 *
 * `mirrorCrossTestGate` finds mirrors by scanning `functions/` for
 * mirror-DECLARING language — "mirror", "lockstep", "keep in sync". That
 * catches every module whose author knew they were writing one, and by
 * construction cannot catch a module that duplicates client logic
 * without ever saying so. These two are that second kind:
 *
 *   GOAL_SPACE_MAX_MEMBERS  goalSpaceTypes.ts = 8, goalSpaceMembership.js = 8
 *   LOOP_TARGETS_KM         routePlanningApi.ts and routePlanning.js
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
import { GOAL_SPACE_MAX_MEMBERS } from "@/features/goalSpace/goalSpaceTypes";
import { LOOP_TARGETS_KM } from "@/lib/routePlanningApi";

const require = createRequire(import.meta.url);
const {
  GOAL_SPACE_MAX_MEMBERS: SERVER_MAX_MEMBERS,
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
