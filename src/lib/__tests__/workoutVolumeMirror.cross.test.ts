/**
 * The tonnage Analytics shows and the tonnage the server credits.
 *
 * One number, two implementations. The client's `workoutTonnageKg`
 * (`hooks/useWorkouts`) is what History renders as MONTHLY VOLUME and
 * LIFETIME volume; the server's `workoutVolumeKg` (`functions/lib`) is what
 * `workoutChallengeIncrements` and `liftVolumeKgFor` credit into challenge
 * totals and the hybrid score. Nothing said they agree.
 *
 * Worth pinning because this exact number has already been wrong for
 * everyone once: `totalVolume` was computed client-side for the social post
 * and never written onto the workout doc, so every server consumer read zero
 * for every lift ever logged, while the app showed a full training week. The
 * server module's own header is an account of that. The fix added the field
 * AND a derivation fallback; this asserts the fallback matches what the
 * client renders, across the malformed shapes legacy docs actually carry.
 *
 * ── The one asymmetry, deliberate and recorded ──────────────────────
 *
 * The server prefers a stated `totalVolume` and derives only when it is
 * absent or non-positive. The client ALWAYS derives and never reads the
 * field. So they part company on exactly two shapes, both asserted below:
 * a doc with a stated volume and no sets, and a doc where the stated value
 * disagrees with its own sets.
 *
 * Neither is reachable today, and the reason is worth writing down because
 * it is a property of the app, not of these two functions: the only writer
 * of a workout doc is the programme completion, which persists `exercises`
 * and `totalVolume` from the same array in the same write, and the only
 * other mutation is deletion (ADR-0012). There is no path that edits a
 * saved workout's sets.
 *
 * Add one — an edit-a-logged-workout feature is a natural follow-up to
 * delete — and the second shape becomes live immediately: Analytics would
 * show the edited tonnage while challenges kept crediting the original.
 * That is CLAUDE.md's "persist every mirrored and derived field in the same
 * write", and this test is where it will fail first.
 *
 * Which side should win if they ever disagree is a product question (the
 * server's value is what permanent totals are built from; the client's is
 * what the user is looking at) and is deliberately NOT decided here.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));

import { workoutTonnageKg } from "@/hooks/useWorkouts";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/workoutVolume.js") as {
  workoutVolumeKg: (doc: unknown) => number;
};
const { workoutVolumeKg } = server;

/**
 * Every fixture here is deliberately malformed or partial — shapes the
 * `Workout` type forbids but that Firestore documents really carry, which is
 * the entire point of the exercise. The cast is admitted once, here, rather
 * than sprinkled at each call site.
 */
const clientTonnage = (doc: unknown): number =>
  workoutTonnageKg(doc as Parameters<typeof workoutTonnageKg>[0]);

type Set_ = { weightKg?: unknown; reps?: unknown };
const sets = (...pairs: [unknown, unknown][]): Set_[] =>
  pairs.map(([weightKg, reps]) => ({ weightKg, reps }));

/* Shapes chosen for what legacy and hand-edited docs actually carry: a
   missing field on one set, a string rep count out of an older writer, a
   timed hold (weighted-plank is a real catalogue exercise with both a load
   and `repUnit: "seconds"`, which a naive multiply reads as ~1,200 kg). */
const AGREE: [string, Record<string, unknown>, number][] = [
  [
    "a plain session",
    { exercises: [{ sets: sets([100, 5], [100, 5]) }] },
    1000,
  ],
  [
    "a timed hold scores nothing",
    { exercises: [{ repUnit: "seconds", sets: sets([20, 60]) }] },
    0,
  ],
  [
    "a set missing its weight",
    { exercises: [{ sets: sets([undefined, 10]) }] },
    0,
  ],
  [
    "a set missing its reps",
    { exercises: [{ sets: sets([50, undefined]) }] },
    0,
  ],
  ["a null rep count", { exercises: [{ sets: sets([50, null]) }] }, 0],
  ["reps stored as a string", { exercises: [{ sets: sets([50, "10"]) }] }, 500],
  ["no exercises at all", {}, 0],
  ["an exercise with no sets", { exercises: [{ sets: [] }] }, 0],
  [
    "a stated volume that matches its sets",
    { totalVolume: 1000, exercises: [{ sets: sets([100, 10]) }] },
    1000,
  ],
  [
    "a stated NaN falls through to the sets",
    { totalVolume: NaN, exercises: [{ sets: sets([100, 10]) }] },
    1000,
  ],
  [
    "a stated zero falls through to the sets",
    { totalVolume: 0, exercises: [{ sets: sets([100, 10]) }] },
    1000,
  ],
];

describe("workout tonnage — client and server agree", () => {
  AGREE.forEach(([name, doc, expected]) => {
    it(name, () => {
      const client = clientTonnage(doc);
      const srv = workoutVolumeKg(doc);
      expect(client, "client").toBe(expected);
      expect(srv, "server").toBe(expected);
    });
  });

  it("the fixtures are not all zero", () => {
    /* Eight of eleven expectations are 0 by design — malformed input should
       score nothing. Without this, deleting the multiply from both copies
       would leave the suite green. */
    const nonZero = AGREE.filter(([, , v]) => v > 0);
    expect(nonZero.length).toBeGreaterThanOrEqual(3);
  });
});

describe("workout tonnage — the stated-field asymmetry", () => {
  it("a stated volume with no sets: server credits it, client shows nothing", () => {
    const doc = { totalVolume: 4321 };
    expect(workoutVolumeKg(doc)).toBe(4321);
    expect(clientTonnage(doc)).toBe(0);
  });

  it("a stated volume disagreeing with its sets: server trusts the field", () => {
    /* The shape an edit-a-workout feature would create on its first save
       if it updated `exercises` without recomputing `totalVolume`. */
    const doc = { totalVolume: 9999, exercises: [{ sets: sets([100, 10]) }] };
    expect(workoutVolumeKg(doc)).toBe(9999);
    expect(clientTonnage(doc)).toBe(1000);
  });

  it("the client genuinely ignores the field, rather than happening to agree", () => {
    const withField = {
      totalVolume: 777,
      exercises: [{ sets: sets([10, 10]) }],
    };
    const withoutField = { exercises: [{ sets: sets([10, 10]) }] };
    expect(clientTonnage(withField)).toBe(clientTonnage(withoutField));
  });
});
