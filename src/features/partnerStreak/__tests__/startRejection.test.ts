/**
 * Every way startPartnerStreak can refuse has a sentence, pinned to the
 * server's own reasons.
 *
 * The mapping keys off reason strings the SERVER writes, in a file this
 * one does not import, so the check runs both ways: each reason
 * `functions/lib/partnerBonds.js` can raise must reach a sentence (or be
 * one the app cannot cause), and each reason matched here must still be
 * raised there.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  describeStartRejection,
  START_FAILED_FALLBACK,
} from "../startRejection";
import { MAX_PARTNERS } from "../streakEngine";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(here, "../../../../functions/lib/partnerBonds.js"),
  "utf8"
);

/** Every reason a `new PartnerBondError(code, reason)` raises. */
function serverReasons(): string[] {
  const re = /new PartnerBondError\(\s*"[^"]+"\s*,\s*"([^"]+)"/g;
  return [...source.matchAll(re)].map((m) => m[1]);
}

/** A refusal as the callable SDK delivers one. */
const refusal = (code: string, reason: string) => ({
  code: `functions/${code}`,
  message: reason,
  details: { reason },
});

/** Reasons only a malformed request can raise: createBond refuses both
 *  before it asks the server, so they fall back. */
const APP_CANNOT_CAUSE = ["partner-required", "cannot-partner-self"];

describe("describeStartRejection", () => {
  it("says whose set of partners is full, and what to do about one's own", () => {
    expect(
      describeStartRejection(
        refusal("failed-precondition", "partner-limit-yours"),
        "Maya"
      )
    ).toBe(
      `You have ${MAX_PARTNERS} streak partners already. End one to start another.`
    );
    expect(
      describeStartRejection(
        refusal("failed-precondition", "partner-limit-theirs"),
        "Maya"
      )
    ).toBe(`Maya has ${MAX_PARTNERS} streak partners already.`);
  });

  it("says less than it knows about a block", () => {
    const copy = describeStartRejection(
      refusal("permission-denied", "blocked-pair"),
      "Maya"
    );
    expect(copy).toBe("You can't start a streak with this person.");
    expect(copy).not.toMatch(/block/i);
  });

  it("reads a reason from the message when details are missing", () => {
    expect(
      describeStartRejection(
        {
          code: "functions/failed-precondition",
          message: "mutual-follow-required",
        },
        "Maya"
      )
    ).toBe("You and Maya need to follow each other to start a streak.");
  });

  it("names a tripped limiter, and falls back without inventing a cause", () => {
    expect(
      describeStartRejection(
        { code: "functions/resource-exhausted", message: "Too many requests." },
        "Maya"
      )
    ).toBe("Too many attempts. Try again in a few minutes.");
    for (const err of [
      undefined,
      null,
      new Error(""),
      refusal("internal", "x"),
    ]) {
      expect(describeStartRejection(err, "Maya")).toBe(START_FAILED_FALLBACK);
    }
  });

  it("a restricted account gets the app's one sentence for it", () => {
    expect(
      describeStartRejection(
        {
          code: "functions/permission-denied",
          message: "Your account is restricted",
          details: { reason: "account-restricted" },
        },
        "Maya"
      )
    ).toBe("Your account is restricted, so you can't do this for now.");
  });
});

describe("the mapping tracks the server", () => {
  it("covers every reason the server can refuse with", () => {
    const reasons = serverReasons();
    // Guards the extraction: an empty list would pass the filter below.
    expect(reasons.length).toBeGreaterThanOrEqual(7);
    const uncovered = reasons.filter(
      (reason) =>
        !APP_CANNOT_CAUSE.includes(reason) &&
        describeStartRejection(
          refusal("failed-precondition", reason),
          "Maya"
        ) === START_FAILED_FALLBACK
    );
    expect(
      uncovered,
      "partnerBonds.js can refuse a start for reasons startRejection.ts has " +
        "no sentence for, so they reach the person as the fallback."
    ).toEqual([]);
  });

  it("finds each reason it matches in the server source", () => {
    for (const reason of [
      "partner-limit-yours",
      "partner-limit-theirs",
      "mutual-follow-required",
      "blocked-pair",
      "account-unavailable",
      ...APP_CANNOT_CAUSE,
    ]) {
      expect(serverReasons(), reason).toContain(reason);
    }
  });
});
