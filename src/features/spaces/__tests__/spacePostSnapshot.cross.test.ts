/**
 * A Space post's session snapshot, against the rule that accepts it.
 *
 * firestore.rules lists the keys a post's `activity` may hold
 * (`activity.keys().hasOnly([...])` in the posts match). The composer
 * writes whatever spacePostSnapshot returns. A key the snapshot gains
 * without the rules gaining it refuses every post that attaches that kind
 * of session, and only on the device, where the tests are not; a key the
 * rules keep after the snapshot drops it is room for anything.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  SPACE_POST_SNAPSHOT_KEYS,
  spacePostSnapshot,
} from "../spacePostSnapshot";
import type { RecentSession } from "../useRecentSessions";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

/** The key list in the posts rule's `activity` gate. */
function rulesSnapshotKeys(rules: string): string[] {
  const posts = rules.slice(rules.indexOf("match /posts/{postId}"));
  const gate = posts.match(
    /request\.resource\.data\.activity\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/
  );
  if (!gate) throw new Error("The posts rule's activity key list is gone");
  return [...gate[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const RUN = {
  kind: "run",
  run: {
    id: "r1",
    distance: 10000,
    duration: 3521,
    avgPace: 352,
    elevationGain: 40,
    calories: 640,
    activityType: "run",
    completedAt: new Date(2026, 8, 23, 8),
    relativeEffort: null,
    routePreview: Array.from({ length: 20 }, (_, i) => ({
      lat: 51.5 + i * 0.0025,
      lon: -0.12,
    })),
  },
} as unknown as RecentSession;

const WORKOUT = {
  kind: "workout",
  workout: {
    id: "w1",
    date: "2026-09-22",
    durationMinutes: 50,
    exercises: [
      {
        exerciseId: "squat",
        exerciseName: "Barbell Squat",
        sets: [{ setNumber: 1, reps: 5, weightKg: 80 }],
      },
    ],
  },
} as unknown as RecentSession;

describe("a Space post's session — the snapshot and the rules agree", () => {
  const rules = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");
  const ruleKeys = rulesSnapshotKeys(rules);

  it("lists the same keys", () => {
    expect([...SPACE_POST_SNAPSHOT_KEYS].sort()).toEqual([...ruleKeys].sort());
  });

  it("writes only keys on the list, and between a run and a lift every one of them", () => {
    const written = new Set<string>();
    for (const session of [RUN, WORKOUT]) {
      for (const keepRouteEnds of [true, false]) {
        const keys = Object.keys(spacePostSnapshot(session, keepRouteEnds));
        for (const key of keys) {
          expect(ruleKeys, `${key} is written but not allowed`).toContain(key);
          written.add(key);
        }
      }
    }
    expect([...written].sort()).toEqual([...ruleKeys].sort());
  });

  it("the parser reads a mismatch as one", () => {
    // Guards the guard: a rule with a key the snapshot lacks, or without
    // one it writes, must not read as equal.
    const extra = rules.replace("'leadExerciseId'", "'leadExerciseId', 'gps'");
    expect(rulesSnapshotKeys(extra)).not.toEqual(ruleKeys);
    const missing = rules.replace(", 'leadExerciseId'", "");
    expect([...SPACE_POST_SNAPSHOT_KEYS].sort()).not.toEqual(
      rulesSnapshotKeys(missing).sort()
    );
  });
});
