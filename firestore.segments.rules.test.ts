/**
 * Segments (Run26 call 3), against the real rules engine.
 *
 * - `segments/{segmentId}`: read one at a time by anyone signed in, since
 *   anyone's run may be timed on it; never listed; written by no client, so
 *   a restricted account (or anyone) can make one only through the
 *   createSegment callable, which refuses a restricted account.
 * - `segments/{segmentId}/board/{uid}`: no client reads or writes it. The
 *   board reaches the app only through the getSegmentBoard callable, which
 *   shows an entry to the runner's followers and nobody else, across no
 *   block either way (functions/__tests__/segments.test.js drives that).
 *   So a stranger reads no one's entry, a follower reads none directly,
 *   and someone blocked sees nothing.
 * - `segmentOwners/{segmentId}`: its maker reads it, alone or as a list of
 *   their own; nobody else does; no client writes it.
 * - `users/{uid}/segmentEfforts`: the owner reads their own; no client
 *   writes one, theirs included, or it could time itself.
 *
 * Run: `npm run test:rules`. Skipped when FIRESTORE_EMULATOR_HOST is unset,
 * a hard failure when CI sets REQUIRE_FIRESTORE_EMULATOR=1. Its own
 * projectId, because the rules suites run in parallel against one emulator
 * (see firestore.partnerBonds.rules.test.ts).
 */
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1. " +
      "Start the Firestore emulator before running this test."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

const PROJECT_ID = "tropos-segments-rules-test";
const MAKER = "seg-maker";
const RUNNER = "seg-runner";
const FOLLOWER = "seg-follower";
const STRANGER = "seg-stranger";
const BLOCKED = "seg-blocked";
const RESTRICTED = "seg-restricted";
const SEGMENT = "seg-1";

const SEGMENT_DOC = {
  name: "Common straight",
  lengthMeters: 1000,
  points: [
    { lat: 51.4433, lon: -0.1517 },
    { lat: 51.4433, lon: -0.1373 },
  ],
  start: { lat: 51.4433, lon: -0.1517 },
  end: { lat: 51.4433, lon: -0.1373 },
  startCell: "gcpucx",
  bbox: { minLat: 51.4433, maxLat: 51.4433, minLon: -0.1517, maxLon: -0.1373 },
  createdAtMs: 1,
};
const ENTRY = {
  uid: RUNNER,
  segmentId: SEGMENT,
  runId: "r1",
  activityId: "post-r1",
  elapsedSeconds: 250,
  day: "2026-11-10",
};
const EFFORT = {
  uid: RUNNER,
  segmentId: SEGMENT,
  runId: "r1",
  lap: 1,
  elapsedSeconds: 250,
  startedAtMs: 1,
  day: "2026-11-10",
};

let env: RulesTestEnvironment;

beforeAll(async () => {
  if (!EMULATOR_HOST) return;
  const [host, portStr] = EMULATOR_HOST.split(":");
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host,
      port: Number(portStr),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/** A signed-in client with a verified email, as a public write needs. */
const db = (uid: string): Firestore =>
  env
    .authenticatedContext(uid, { email_verified: true })
    .firestore() as unknown as Firestore;
const anon = (): Firestore =>
  env.unauthenticatedContext().firestore() as unknown as Firestore;

const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

beforeEach(async () => {
  if (!EMULATOR_HOST) return;
  await env.clearFirestore();
  await seed(`segments/${SEGMENT}`, SEGMENT_DOC);
  await seed(`segmentOwners/${SEGMENT}`, { uid: MAKER, sourceRunId: "m1" });
  await seed(`segments/${SEGMENT}/board/${RUNNER}`, ENTRY);
  await seed(`users/${RUNNER}/segmentEfforts/r1_${SEGMENT}_1`, EFFORT);
  // The follower follows the runner; the runner has blocked one person.
  await seed(`followers/${RUNNER}/users/${FOLLOWER}`, { followedAt: 1 });
  await seed(`following/${FOLLOWER}/users/${RUNNER}`, { followedAt: 1 });
  await seed(`blocks/${RUNNER}/users/${BLOCKED}`, { blockedAt: 1 });
  await seed(`globalRestrictedUids/${RESTRICTED}`, { restrictedAt: 1 });
});

suite("segments/{segmentId}", () => {
  it("anyone signed in reads a segment, one at a time", async () => {
    for (const uid of [MAKER, RUNNER, STRANGER, BLOCKED])
      await assertSucceeds(getDoc(doc(db(uid), "segments", SEGMENT)));
  });

  it("signed out, nobody reads one, and nobody lists them", async () => {
    await assertFails(getDoc(doc(anon(), "segments", SEGMENT)));
    await assertFails(getDocs(collection(db(STRANGER), "segments")));
    await assertFails(
      getDocs(
        query(
          collection(db(MAKER), "segments"),
          where("startCell", "==", "gcpucx")
        )
      )
    );
  });

  it("a restricted account can't create a segment, and nor can anyone else from the app", async () => {
    for (const uid of [RESTRICTED, MAKER, STRANGER])
      await assertFails(
        setDoc(doc(db(uid), "segments", `new-${uid}`), SEGMENT_DOC)
      );
    await assertFails(
      setDoc(doc(db(RESTRICTED), "segmentOwners", "new-restricted"), {
        uid: RESTRICTED,
        sourceRunId: "x",
      })
    );
  });

  it("its maker can't rename or delete it directly: the callables do", async () => {
    const segment = doc(db(MAKER), "segments", SEGMENT);
    await assertFails(updateDoc(segment, { name: "Renamed" }));
    await assertFails(deleteDoc(segment));
  });
});

suite("segments/{segmentId}/board/{uid}", () => {
  const entry = (as: Firestore, uid = RUNNER) =>
    doc(as, "segments", SEGMENT, "board", uid);

  it("a stranger can't read a follower-only board entry", async () => {
    await assertFails(getDoc(entry(db(STRANGER))));
    await assertFails(
      getDocs(collection(db(STRANGER), "segments", SEGMENT, "board"))
    );
  });

  it("a blocked person sees nothing of it", async () => {
    await assertFails(getDoc(entry(db(BLOCKED))));
    await assertFails(
      getDocs(collection(db(BLOCKED), "segments", SEGMENT, "board"))
    );
  });

  it("a follower reads it only through the board callable, never directly", async () => {
    await assertFails(getDoc(entry(db(FOLLOWER))));
    await assertFails(
      getDocs(
        query(
          collection(db(FOLLOWER), "segments", SEGMENT, "board"),
          where("uid", "in", [RUNNER])
        )
      )
    );
  });

  it("no client writes an entry, its runner's included", async () => {
    await assertFails(
      setDoc(entry(db(RUNNER)), { ...ENTRY, elapsedSeconds: 1 })
    );
    await assertFails(updateDoc(entry(db(RUNNER)), { elapsedSeconds: 1 }));
    await assertFails(deleteDoc(entry(db(MAKER))));
    await assertFails(
      setDoc(entry(db(STRANGER), STRANGER), { ...ENTRY, uid: STRANGER })
    );
  });
});

suite("segmentOwners/{segmentId}", () => {
  it("its maker reads it, alone and as a list of their own", async () => {
    await assertSucceeds(getDoc(doc(db(MAKER), "segmentOwners", SEGMENT)));
    await assertSucceeds(
      getDocs(
        query(collection(db(MAKER), "segmentOwners"), where("uid", "==", MAKER))
      )
    );
  });

  it("nobody else learns who made a segment", async () => {
    for (const uid of [RUNNER, STRANGER])
      await assertFails(getDoc(doc(db(uid), "segmentOwners", SEGMENT)));
    await assertFails(
      getDocs(
        query(
          collection(db(STRANGER), "segmentOwners"),
          where("uid", "==", MAKER)
        )
      )
    );
    await assertFails(getDocs(collection(db(MAKER), "segmentOwners")));
  });

  it("no client writes one", async () => {
    await assertFails(
      updateDoc(doc(db(MAKER), "segmentOwners", SEGMENT), { uid: STRANGER })
    );
    await assertFails(deleteDoc(doc(db(MAKER), "segmentOwners", SEGMENT)));
  });
});

suite("users/{uid}/segmentEfforts", () => {
  const path = `users/${RUNNER}/segmentEfforts/r1_${SEGMENT}_1`;

  it("the owner reads their own efforts", async () => {
    await assertSucceeds(getDoc(doc(db(RUNNER), path)));
    await assertSucceeds(
      getDocs(
        query(
          collection(db(RUNNER), "users", RUNNER, "segmentEfforts"),
          where("segmentId", "==", SEGMENT)
        )
      )
    );
  });

  it("nobody else reads them", async () => {
    for (const as of [db(FOLLOWER), db(STRANGER), db(MAKER), anon()])
      await assertFails(getDoc(doc(as, path)));
  });

  it("no client writes one, its owner's included", async () => {
    await assertFails(
      setDoc(doc(db(RUNNER), path), { ...EFFORT, elapsedSeconds: 1 })
    );
    await assertFails(deleteDoc(doc(db(RUNNER), path)));
    await assertFails(
      setDoc(doc(db(RUNNER), `users/${RUNNER}/segmentEfforts/new`), EFFORT)
    );
  });
});
