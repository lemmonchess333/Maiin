/**
 * Every way `joinGoalSpace` can refuse has a sentence, and the sentences
 * are pinned to the server's own strings.
 *
 * The mapping keys off message fragments the SERVER writes, in a file
 * this one does not import — the exact shape ADR-0008 calls out, where a
 * green client suite proves nothing about the copy a real refusal
 * produces. So the cross-check runs both ways: each needle must appear in
 * `functions/lib/goalSpaceMembership.js`, and every refusal that file can
 * raise from the join path must be covered by a needle.
 *
 * The second direction is the one that earns its keep. Adding a seventh
 * refusal server-side is a one-line change with no client compile error
 * and no failing test — it would simply start producing the fallback,
 * which is the behaviour this whole change exists to remove.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describeJoinRejection, JOIN_FAILED_FALLBACK } from "../joinRejection";

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(
  here,
  "../../../../functions/lib/goalSpaceMembership.js"
);
const source = readFileSync(SERVER, "utf8");

/** The `joinGoalSpace` body, plus the helper it calls that can refuse. */
function joinPathSource(): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) =>
    l.startsWith("async function joinGoalSpace")
  );
  expect(
    start,
    "joinGoalSpace is no longer a top-level declaration"
  ).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  const helper = lines.findIndex((l) =>
    l.startsWith("async function assertNoBlockedPair")
  );
  const helperEnd = lines.findIndex((l, i) => i > helper && l === "}");
  return [
    ...lines.slice(start, end),
    // Called from inside the join transaction, so its refusal reaches the
    // same toast even though it lives in its own function.
    ...lines.slice(helper, helperEnd),
  ].join("\n");
}

/** Every `new GoalSpaceError(code, message)` message in a block. */
function refusalMessages(block: string): string[] {
  const out: string[] = [];
  const re = /new GoalSpaceError\(\s*"[^"]+"\s*,\s*"([^"]+)"/g;
  for (const m of block.matchAll(re)) out.push(m[1]);
  return out;
}

/** A rejection as the callable SDK delivers it. */
const rejection = (code: string, message: string) => ({
  code: `functions/${code}`,
  message,
});

describe("describeJoinRejection", () => {
  it("names a full circle rather than guessing at the code", () => {
    expect(
      describeJoinRejection(rejection("failed-precondition", "circle full"))
    ).toBe(
      "That circle is full. Someone has to leave before anyone else can join."
    );
  });

  it("separates a closed circle from a mistyped code", () => {
    const closed = describeJoinRejection(
      rejection("failed-precondition", "circle inactive")
    );
    const typo = describeJoinRejection(
      rejection("permission-denied", "bad invite")
    );
    expect(closed).toBe("That circle has been closed.");
    expect(typo).toBe("That invite code isn't right. Check it and try again.");
    expect(closed).not.toBe(typo);
  });

  it("stops telling a rate-limited caller to check their code", () => {
    // The limiter is 10 per 10 minutes and carries no message worth
    // reading, so this one is matched on the code. Pre-fix it produced
    // the line about a wrong invite — advice to keep doing the thing
    // that tripped the limiter.
    expect(
      describeJoinRejection(
        rejection("resource-exhausted", "Too many attempts. Slow down.")
      )
    ).toBe("Too many attempts. Try again in a few minutes.");
  });

  it("says less than it knows about a blocked pair", () => {
    // The server refuses when EITHER party blocked the other, so naming
    // the block would tell the joiner that somebody in that circle
    // blocked them.
    const copy = describeJoinRejection(
      rejection("permission-denied", "blocked-pair: cannot share a Circle")
    );
    expect(copy).toBe("You can't join this circle.");
    expect(copy).not.toMatch(/block/i);
  });

  it("falls back without inventing a cause", () => {
    for (const err of [
      undefined,
      null,
      new Error(""),
      rejection("internal", "Something went wrong."),
    ]) {
      expect(describeJoinRejection(err)).toBe(JOIN_FAILED_FALLBACK);
    }
    expect(JOIN_FAILED_FALLBACK).not.toMatch(/invite|full|closed/i);
  });

  it("survives the prefixed message form", () => {
    // `stripCallablePrefix` exists because this repo has met
    // "FirebaseError: failed-precondition: …" — substring matching has
    // to hold for both shapes.
    expect(
      describeJoinRejection({
        code: "functions/failed-precondition",
        message: "FirebaseError: failed-precondition: circle full",
      })
    ).toBe(
      "That circle is full. Someone has to leave before anyone else can join."
    );
  });
});

describe("the mapping tracks the server", () => {
  it("covers every refusal reachable from the join path", () => {
    const refusals = refusalMessages(joinPathSource());
    // Guards the extraction itself: if the block ever fails to resolve,
    // the filter below is satisfied by an empty list and this pair of
    // tests goes quiet without anything changing.
    expect(refusals.length).toBeGreaterThanOrEqual(6);
    const uncovered = refusals.filter(
      (m) =>
        describeJoinRejection({ code: "functions/unknown", message: m }) ===
        JOIN_FAILED_FALLBACK
    );
    expect(
      uncovered,
      "goalSpaceMembership.js can refuse a join for reasons joinRejection.ts " +
        "has no sentence for, so they reach the user as the fallback. Add a " +
        "BY_MESSAGE row for each."
    ).toEqual([]);
  });

  it("finds each needle in the server source", () => {
    // The inverse: a needle nothing throws is a sentence that can never
    // render, and it hides the fact that the real refusal changed wording.
    for (const needle of [
      "circle full",
      "circle inactive",
      "no such circle",
      "bad invite",
      "invite code required",
      "blocked-pair",
    ]) {
      expect(
        source.toLowerCase(),
        `joinRejection.ts matches on ${JSON.stringify(needle)}, which no ` +
          "longer appears in goalSpaceMembership.js"
      ).toContain(needle);
    }
  });
});
