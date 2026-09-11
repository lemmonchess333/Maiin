import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as challengeDefs from "../lib/challengeDefs";
import * as challengeMarkers from "../lib/challengeMarkers";
import * as challengeTiers from "../lib/challengeTiers";
import { challengeContainsActivityDate } from "../lib/challengeActivityWindow";

// Execute the real server helper; only the Firestore transaction boundary is
// simulated. Loading the full trigger module would initialise network SDKs.
const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const start = source.indexOf("async function applyChallengeProgressIncrement(");
const end = source.indexOf("\nasync function syncChallengeProgress(", start);
if (start < 0 || end < 0)
  throw new Error("Challenge progress helper not found");
const helper = source.slice(start, end);
const UID = "membership-test";
const DATE = "2026-09-11";
const definitions = challengeDefs.buildCurrentChallenges(
  new Date(DATE + "T12:00:00Z")
);
const challenges = ["weekly-", "global-monthly-", "monthly-"].map((prefix) =>
  definitions.find((challenge) => challenge.id.startsWith(prefix))
);

function harness(
  challenge,
  { joined = false, leaveBeforeTransaction = false } = {}
) {
  const participantPath = "challenges/" + challenge.id + "/participants/" + UID;
  const membership = {
    currentValue: 3,
    tierAchieved: null,
    joinedAt: new Date("2026-09-10T12:00:00Z"),
    displayName: "Test member",
  };
  const docs = new Map(joined ? [[participantPath, membership]] : []);
  const writes = [];
  const snapshot = (path) => ({
    exists: docs.has(path),
    data: () => docs.get(path),
  });
  const ref = (path) => ({
    path,
    collection: (name) => ref(path + "/" + name),
    doc: (name) => ref(path + "/" + name),
    get: async () => snapshot(path),
  });
  const db = {
    collection: (name) => ref(name),
    runTransaction: async (work) => {
      if (leaveBeforeTransaction) docs.delete(participantPath);
      return work({
        get: async (reference) => snapshot(reference.path),
        set: (reference, data, options) => {
          writes.push(reference.path);
          docs.set(
            reference.path,
            options?.merge ? { ...docs.get(reference.path), ...data } : data
          );
        },
      });
    },
  };
  const apply = runInNewContext(helper + "\napplyChallengeProgressIncrement;", {
    db,
    challengeDefs,
    challengeMarkers,
    challengeTiers,
    challengeContainsActivityDate,
    admin: {
      firestore: {
        FieldValue: { serverTimestamp: () => new Date() },
        Timestamp: { now: () => new Date() },
      },
    },
  });
  return {
    docs,
    writes,
    participantPath,
    membership,
    log: (sourceId = "activity-1") =>
      apply(challenge.id, challenge, UID, challenge.metric, 1, sourceId, DATE),
  };
}

describe.each(challenges)("explicit membership: $id", (challenge) => {
  it("does not join an account on its first qualifying activity", async () => {
    const h = harness(challenge);
    await h.log();
    expect(h.docs.has(h.participantPath)).toBe(false);
    expect(h.writes).toEqual([]);
  });

  it("does not rejoin a member who left, even with old activity markers", async () => {
    const h = harness(challenge, { joined: true });
    await h.log();
    h.docs.delete(h.participantPath);
    h.writes.length = 0;
    await h.log("activity-after-leaving");
    expect(h.docs.has(h.participantPath)).toBe(false);
    expect(h.writes).toEqual([]);
  });

  it("honours a leave between the initial read and the transaction", async () => {
    const h = harness(challenge, {
      joined: true,
      leaveBeforeTransaction: true,
    });
    await h.log();
    expect(h.docs.has(h.participantPath)).toBe(false);
    expect(h.writes).toEqual([]);
  });

  it("still credits an explicit member once and preserves their membership", async () => {
    const h = harness(challenge, { joined: true });
    await h.log();
    await h.log();
    expect(h.docs.get(h.participantPath)).toMatchObject({
      currentValue: 4,
      joinedAt: h.membership.joinedAt,
      displayName: h.membership.displayName,
    });
  });

  it("allows an explicit rejoin to backfill without old markers blocking it", async () => {
    const h = harness(challenge, { joined: true });
    await h.log();
    h.docs.delete(h.participantPath);
    h.docs.set(h.participantPath, {
      ...h.membership,
      currentValue: 0,
      joinedAt: new Date("2026-09-11T12:00:00Z"),
    });
    await h.log();
    await h.log();
    expect(h.docs.get(h.participantPath).currentValue).toBe(1);
  });
});
