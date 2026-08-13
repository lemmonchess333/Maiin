/**
 * Integration: the lift-volume re-credit must be able to reach a history
 * longer than one page.
 *
 * The bug this pins shipped in the re-credit itself (#2043). The scan was a
 * bare `.limit(RECREDIT_PAGE_SIZE)` with no ordering and no cursor, above a
 * comment asserting that "a longer history simply re-runs". It does not. An
 * unordered Firestore query is document-ID ascending, deterministic and
 * repeatable, so every re-run returned the IDENTICAL page and everything
 * past it was unreachable — no matter how many times an operator ran it.
 *
 * Two things conspired to keep that quiet. The idempotency markers make
 * re-runs safe, so a second run looks like a clean no-op rather than a
 * stalled one. And the response's `truncated: true` was honest about the
 * page being partial while offering no way to advance past it: a flag with
 * no remedy reads like a warning and functions like a dead end.
 *
 * Driven against the emulator rather than unit-tested because the claim
 * under test is about FIRESTORE's ordering and cursor semantics, not about
 * our arithmetic. A fake would have whatever paging behaviour the fake's
 * author assumed — which is precisely the assumption that was wrong.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

const UID = "u-recredit-page";
/** Must match RECREDIT_PAGE_SIZE in index.js. */
const PAGE = 500;

let admin;
let db;
let recreditMyLiftVolume;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  recreditMyLiftVolume = idx.recreditMyLiftVolume;
  admin = require("firebase-admin");
  db = admin.firestore();
});

/** A workout doc in the shape the client writes: exercises carrying sets. */
function workoutDoc(weightKg) {
  return {
    date: "2026-08-10",
    durationMinutes: 40,
    source: "programme",
    exercises: [
      { exerciseName: "Bench Press", sets: [{ weightKg, reps: 10 }] },
    ],
  };
}

async function deleteAll(path) {
  const snap = await db.collection(path).get();
  while (snap.docs.length) {
    const batch = db.batch();
    for (const d of snap.docs.splice(0, 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

/**
 * PAGE + 1 workouts with zero-padded ids, so document-ID order is known:
 * `w-0000` … `w-0500`. Only the FIRST and the LAST carry load, which keeps
 * the run fast (a zero-volume doc short-circuits before any transaction)
 * while placing one creditable workout on each side of the page boundary.
 */
async function seedHistory() {
  await deleteAll(`users/${UID}/workouts`);
  await deleteAll(`users/${UID}/lifetime`);
  const col = db.collection(`users/${UID}/workouts`);
  let batch = db.batch();
  for (let i = 0; i <= PAGE; i++) {
    const id = `w-${String(i).padStart(4, "0")}`;
    // 100 kg × 10 = 1000 on the first; 50 kg × 10 = 500 on the overflow one.
    const weight = i === 0 ? 100 : i === PAGE ? 50 : 0;
    batch.set(col.doc(id), workoutDoc(weight));
    if ((i + 1) % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
}

async function lifetimeKg() {
  const snap = await db.doc(`users/${UID}/lifetime/totals`).get();
  return snap.exists ? Number(snap.data().liftVolumeKg || 0) : 0;
}

suite("recreditMyLiftVolume — paging past the first page", () => {
  beforeEach(async () => {
    await seedHistory();
  }, 120_000);

  it(
    "a cursored second call reaches the workout a bare re-run never can",
    async () => {
      const first = await recreditMyLiftVolume.run({}, { auth: { uid: UID } });

      // The page is full, so there is more history behind it.
      expect(first.scanned).toBe(PAGE);
      expect(first.truncated).toBe(true);
      expect(first.withVolume).toBe(1);
      // The cursor is what makes `truncated` actionable.
      expect(first.cursor).toBe(`w-${String(PAGE - 1).padStart(4, "0")}`);
      expect(await lifetimeKg()).toBe(1000);

      /* THE REGRESSION. Re-running WITHOUT the cursor — the operator action
         the old comment recommended — re-scans the identical page and makes
         no progress. It is not an error and not a no-op-looking failure; it
         reports a full successful scan of work already credited. */
      const bareRerun = await recreditMyLiftVolume.run(
        {},
        { auth: { uid: UID } }
      );
      expect(bareRerun.scanned).toBe(PAGE);
      expect(bareRerun.truncated).toBe(true);
      expect(await lifetimeKg()).toBe(1000); // the 500 kg is still stranded

      // With the cursor, the tail is reached and the history is exhausted.
      const second = await recreditMyLiftVolume.run(
        { startAfter: first.cursor },
        { auth: { uid: UID } }
      );
      expect(second.scanned).toBe(1);
      expect(second.truncated).toBe(false);
      expect(second.withVolume).toBe(1);
      expect(await lifetimeKg()).toBe(1500);
    },
    240_000
  );

  it(
    "paging to completion is idempotent — a full second pass credits nothing",
    async () => {
      /* The safety property the whole replay rests on. It has to hold for
         the PAGED loop, not just for a single call: the client drives this
         to completion and may well do so twice. */
      const drain = async () => {
        let cursor;
        let truncated = true;
        let calls = 0;
        while (truncated && calls < 10) {
          const r = await recreditMyLiftVolume.run(
            cursor ? { startAfter: cursor } : {},
            { auth: { uid: UID } }
          );
          cursor = r.cursor;
          truncated = r.truncated;
          calls++;
        }
        return calls;
      };

      expect(await drain()).toBe(2);
      expect(await lifetimeKg()).toBe(1500);

      await drain();
      expect(await lifetimeKg()).toBe(1500);
    },
    240_000
  );

  it("rejects a startAfter that is not a plain document id", async () => {
    /* It reaches a Firestore query, so the shape is checked rather than
       trusted. The blast radius is only the caller's own scan — the uid
       comes from `context.auth`, never the payload — but failing loudly
       beats silently starting from an unintended place. */
    for (const bad of [42, "", "users/other/workouts/w-0000", {}]) {
      await expect(
        recreditMyLiftVolume.run({ startAfter: bad }, { auth: { uid: UID } })
      ).rejects.toMatchObject({ code: "invalid-argument" });
    }
  });

  it("treats an absent cursor as a first page, not an error", async () => {
    for (const ok of [undefined, null]) {
      const r = await recreditMyLiftVolume.run(
        { startAfter: ok },
        { auth: { uid: UID } }
      );
      expect(r.ok).toBe(true);
      expect(r.scanned).toBe(PAGE);
    }
  }, 240_000);
});
