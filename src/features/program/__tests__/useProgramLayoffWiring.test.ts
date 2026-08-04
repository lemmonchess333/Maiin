// @vitest-environment jsdom — renders the hook; the rest of this directory runs in the node environment.
/**
 * Run15's wiring: does the layoff a runner actually has reach the plan they
 * are actually given?
 *
 * The pure classifier and the generator branch are pinned in
 * `layoffDetection.test.ts` and `detrainedRacePlan.test.ts`. Both can be
 * perfectly correct while the hook never calls one or never passes the other's
 * answer along — which is the failure ADR-0008 exists for: the tested copy is
 * not the running copy. So these tests drive the REAL hook and assert on the
 * runDays it persists.
 *
 * They also pin the account-switch property. `recentLayoff` is read-then-held,
 * and a held value is exactly the shape that leaks across a sign-out: the
 * effect refires on the new uid, but until the new read lands the old class is
 * still readable, and a regeneration in that window builds user B's week from
 * user A's fitness. `pumpHolding` keeps that one read in flight while letting
 * every other read through, so the window is somewhere the test can stand
 * rather than something it has to catch by timing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { generateSchedule } from "@/lib/scheduleUtils";
import {
  localDateString,
  localWeekKey,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));

import {
  seedFirestore,
  resetFirestore,
  readDoc,
  writeLog,
  readLog,
  deferReads,
  resumeReads,
  releaseRead,
  releaseAllReads,
  pendingReads,
} from "@/test/firestoreHarness";

/* ── auth, with a SWITCHABLE uid ───────────────────────────────────── */

let currentUid = "userA";
let mockProfile: Record<string, unknown> | null = null;
// Stable per-uid identity: a fresh object literal each call churns the hook's
// effect deps into an infinite re-render.
const userRefs: Record<string, { uid: string }> = {
  userA: { uid: "userA" },
  userB: { uid: "userB" },
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: userRefs[currentUid],
    profile: mockProfile,
    updateProfile: vi.fn(async () => ({ ok: true })),
    refreshProfile: vi.fn(async () => undefined),
  }),
  useUid: () => currentUid,
}));

vi.mock("../programCommandClient", () => ({
  sendProgramCommand: vi.fn(async () => undefined),
}));
vi.mock("@/lib/socialApi", () => ({ postActivity: vi.fn() }));
vi.mock("@/lib/shareComposer", () => ({
  compose: vi.fn(),
  enqueueShare: vi.fn(),
  showQueuedToast: vi.fn(),
}));
vi.mock("@/lib/workoutBurn", () => ({ estimateLiftBurn: vi.fn(() => 0) }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { useProgram } from "../useProgram";

/* ── fixtures ──────────────────────────────────────────────────────── */

const TODAY = localDateString(new Date());
/** "YYYY-MM-DD" + n days, back to "YYYY-MM-DD". */
const shift = (key: string, n: number) =>
  localDateString(addLocalDays(parseLocalDate(key), n));
/**
 * Six weeks out, against a block CARRIED as 16 weeks (see `ageIntoMidBlock`).
 * The pair is what puts the rollover in the BUILD phase — the only phase where
 * trained and returning weeks differ. Six weeks out with a fresh 6-week block
 * would be below the marathon floor; the carry is what keeps it a real plan.
 */
const RACE_DATE = shift(TODAY, 6 * 7);
/** The block length carried across the rollover. */
const CARRIED_BLOCK_WEEKS = 16;

function raceProfile() {
  return {
    uid: currentUid,
    weekSchedule: generateSchedule(2, 4),
    weekScheduleVersion: 1,
    weeklyWorkoutsTarget: 2,
    weeklyRunDaysTarget: 4,
    runMode: "race_prep" as const,
    raceGoal: { distance: "marathon" as const, targetDate: RACE_DATE },
    primaryGoal: "hypertrophy",
    program: { goal: "recomp" },
  };
}

/** Seed `uid`'s runs: a trained history ending `daysAgo` days back. */
function seedRunHistory(uid: string, daysAgo: number, count = 10): void {
  const tree: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < count; i++) {
    const date = shift(TODAY, -(daysAgo + i * 3));
    tree[`users/${uid}/runs/r${i}`] = {
      date,
      distance: 9000,
      duration: 3000,
      createdAt: `${date}T09:00:00.000Z`,
    };
  }
  seedFirestore(tree);
}

/** The run days most recently persisted to `uid`'s program doc. */
function persistedRunDays(uid: string) {
  const path = `users/${uid}/programState/current`;
  const writes = writeLog().filter(
    (w) => w.path === path && w.op.startsWith("set")
  );
  for (let i = writes.length - 1; i >= 0; i--) {
    const days = (writes[i].data as { runDays?: unknown[] })?.runDays;
    if (Array.isArray(days) && days.length) {
      return days as { templateId: string; type: string }[];
    }
  }
  return [];
}

const HARD = new Set(["tempo", "intervals"]);
const hardCount = (days: { type: string }[]) =>
  days.filter((d) => HARD.has(d.type)).length;
const longestKm = (days: { templateId: string }[]) =>
  Math.max(
    0,
    ...days.map((d) => {
      const m = /^long_(\d+)k$/.exec(d.templateId);
      return m ? Number(m[1]) : 0;
    })
  );

beforeEach(() => {
  resetFirestore();
  resumeReads();
  currentUid = "userA";
  mockProfile = raceProfile();
});

/**
 * Age the stored plan by a week so the hook's auto-rollover regenerates it
 * from a MID-BLOCK position.
 *
 * This detour is the point, not scaffolding. `getPhaseForWeek(0, …)` is
 * structurally always `"base"`, so a freshly created plan's `weeks[0]` is an
 * all-easy week with a base long run for EVERY runner — the layoff cannot
 * change a week that is already the softest one the generator emits. The
 * policy only becomes observable once a block length is carried, which is
 * what the weekly rollover does. So the returning runner this feature is for
 * is, by construction, someone whose plan already exists.
 *
 * Aging the `weekKey` is the same signal the real rollover keys on: "the
 * runDays were generated for a week that is now in the past".
 */
async function ageIntoMidBlock(uid: string, weekIndex: number): Promise<void> {
  const path = `users/${uid}/programState/current`;
  const doc = readDoc(path) as Record<string, unknown>;
  const staleKey = shift(String(localWeekKey()), -7);
  seedFirestore({
    [path]: {
      ...doc,
      runDays: (doc.runDays as { weekKey: string }[]).map((d) => ({
        ...d,
        weekKey: staleKey,
      })),
      runPlan: {
        ...(doc.runPlan as object),
        currentWeek: weekIndex,
        totalWeeks: CARRIED_BLOCK_WEEKS,
      },
    },
  });
  // The load effect keys on `profile` identity; a fresh object re-runs it.
  mockProfile = raceProfile();
}

/* ── tests ─────────────────────────────────────────────────────────── */

describe("the layoff reaches the plan the runner is given", () => {
  /**
   * Roll a plan into mid-block and return the week the hook persisted.
   * Identical either side of the layoff — only the run history differs.
   */
  async function weekAfterRollover(daysAway: number) {
    seedRunHistory("userA", daysAway);
    const { rerender } = renderHook(() => useProgram());
    await waitFor(() =>
      expect(persistedRunDays("userA").length).toBeGreaterThan(0)
    );
    await ageIntoMidBlock("userA", 9);
    rerender();
    await waitFor(() =>
      expect(
        (
          readDoc(`users/userA/programState/current`) as {
            runPlan?: { currentWeek?: number };
          }
        )?.runPlan?.currentWeek
      ).toBeGreaterThan(9)
    );
    return persistedRunDays("userA");
  }

  it("a training runner rolls into a real build week", async () => {
    // The anchor. Mid-block a trained runner gets quality and a long run past
    // the base — if this ever stops being true the test below is vacuous.
    const week = await weekAfterRollover(1);
    expect(hardCount(week)).toBeGreaterThan(0);
    expect(longestKm(week)).toBeGreaterThan(14);
  });

  it("a returning runner rolls into a re-entry week instead", async () => {
    // Same rollover, same block position, same schedule — only the run
    // history differs. This is the whole feature, end to end through the hook.
    const week = await weekAfterRollover(70);
    expect(hardCount(week)).toBe(0);
    expect(longestKm(week)).toBeLessThanOrEqual(14);
  });
});

describe("the read is scoped", () => {
  it("a freeform runner never pays for it", async () => {
    // Per-read pricing, and a freeform runner has no plan for a layoff to
    // reshape. Asserting on the read LOG rather than on the output: a hook
    // that reads and discards is a different bug from one that skips.
    mockProfile = { ...raceProfile(), runMode: "freeform", raceGoal: null };
    seedRunHistory("userA", 70);
    renderHook(() => useProgram());
    await waitFor(() => expect(readLog().length).toBeGreaterThan(0));
    expect(readLog().filter((r) => r.path === "users/userA/runs")).toEqual([]);
  });

  it("a race-prep runner does", async () => {
    seedRunHistory("userA", 70);
    renderHook(() => useProgram());
    await waitFor(() =>
      expect(
        readLog().filter((r) => r.path === "users/userA/runs").length
      ).toBeGreaterThan(0)
    );
  });
});

/**
 * Let the hook make progress while ONE read stays in flight.
 *
 * `deferReads()` holds everything, which would also stall the program-doc read
 * the plan is built from — so the hook would simply do nothing and the test
 * would prove nothing. Releasing everything else keeps exactly one read open:
 * the window under test.
 *
 * Returns the number of times the held read was seen pending, so the caller
 * can assert the window genuinely existed rather than trusting it did.
 */
async function pumpHolding(holdPath: string, rounds = 40): Promise<number> {
  let heldSightings = 0;
  for (let i = 0; i < rounds; i++) {
    for (;;) {
      const idx = pendingReads().findIndex((p) => p !== holdPath);
      if (idx === -1) break;
      releaseRead(idx);
    }
    if (pendingReads().includes(holdPath)) heldSightings++;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2));
    });
  }
  return heldSightings;
}

describe("a layoff never crosses an account switch", () => {
  it("user B is not planned from user A's fitness", async () => {
    seedRunHistory("userA", 70); // A is detrained
    seedRunHistory("userB", 1); // B trained yesterday

    const { rerender } = renderHook(() => useProgram());
    // ANCHOR: prove A really did get the re-entry week first. Without it the
    // switch assertion below would pass against a hook where the layoff never
    // applied to anybody.
    await waitFor(() =>
      expect(persistedRunDays("userA").length).toBeGreaterThan(0)
    );
    await ageIntoMidBlock("userA", 9);
    rerender();
    await waitFor(() => expect(hardCount(persistedRunDays("userA"))).toBe(0));
    expect(longestKm(persistedRunDays("userA"))).toBeLessThanOrEqual(14);

    // Switch accounts with B's layoff read HELD OPEN — the window in which a
    // uid-blind held value still answers with A's class.
    deferReads();
    currentUid = "userB";
    mockProfile = raceProfile();
    rerender();

    const heldSightings = await pumpHolding("users/userB/runs");
    // The window has to have actually existed, or this is a post-settle check
    // wearing a race-condition's clothes.
    expect(heldSightings).toBeGreaterThan(0);

    // B built a plan while their own layoff was still unknown…
    await waitFor(() =>
      expect(persistedRunDays("userB").length).toBeGreaterThan(0)
    );
    await ageIntoMidBlock("userB", 9);
    rerender();
    await pumpHolding("users/userB/runs");

    // …and it is the NORMAL plan. "none" is the seed; A's "detrained" is not
    // visible to B at any point.
    expect(hardCount(persistedRunDays("userB"))).toBeGreaterThan(0);
    expect(longestKm(persistedRunDays("userB"))).toBeGreaterThan(14);

    releaseAllReads();
    resumeReads();
  });
});
