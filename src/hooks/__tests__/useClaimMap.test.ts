/**
 * PR-J chunk B3a — useClaimMap hook tests.
 *
 * The heavy lifting (date window, quality bucket, single-claim walk) lives in
 * `computeClaims`. This header used to say that logic was "exhaustively
 * covered by" `functions/__tests__/scheduledRunCompletion.test.js` (29 tests)
 * and `src/lib/__tests__/scheduledRunCompletion.cross.test.ts` — but BOTH were
 * deleted in #1733 along with the JS port they pinned (see the rationale in
 * `src/lib/scheduledRunCompletion.ts`). Nothing replaced them, so this file is
 * now the ONLY coverage of the completion predicate.
 *
 * That stale pointer had teeth: it told anyone extending these tests that the
 * distance and bucket branches were already covered elsewhere, which is a good
 * part of why the 70% gate went 1000x wrong (kilometres over metres) with a
 * green suite until #1834. If you add a branch to `computeClaims`, it gets its
 * test HERE.
 *
 * Beyond that predicate, this file pins hook-level behaviour:
 *   - subscription lifecycle (no user → empty, user → onSnapshot)
 *   - downstream wiring: snapshot rows reach computeClaims
 *   - Q3 P90: unclaimedByDate shares the same memo / excludes
 *     claimed savedRunIds
 *   - dateAnchor override (test hook for midnight-rollover effects)
 *
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 * The old version stubbed `onSnapshot` to capture its callback and then
 * `pumpSnapshot()`d fabricated docs straight into it, so the suite fed
 * the hook rather than the hook reading a store. Runs are now real
 * documents under `users/u1/runs`, delivered by the fake's own
 * subscription — which means the `orderBy("createdAt", "desc")` in the
 * query is exercised rather than bypassed, and "no user ⇒ no
 * subscription" can be asserted against the read log instead of against
 * the stub's own array.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  seedFirestore,
  resetFirestore,
  readLog,
  flushSnapshots,
} from "@/test/firestoreHarness";

const mockUser: { uid: string } | null = { uid: "u1" };
let currentUser: { uid: string } | null = mockUser;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: currentUser }),
  useUid: () => ({ user: currentUser }).user?.uid ?? null,
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore");

interface ProgramStateLike {
  runDays?: Array<Record<string, unknown>>;
  manualCompletions?: Record<string, unknown>;
}
let mockProgramState: ProgramStateLike | null = null;

vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState: mockProgramState }),
}));

import { useClaimMap } from "../useClaimMap";

const RUNS = "users/u1/runs";

/** Seed saved-run documents the hook's own subscription will deliver. */
function seedRuns(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  const tree: Record<string, Record<string, unknown>> = {};
  for (const d of docs) tree[`${RUNS}/${d.id}`] = d.data;
  seedFirestore(tree);
}

/** How many times the hook subscribed to the runs collection. */
const runSubscriptions = () =>
  readLog().filter((r) => r.op === "onSnapshot" && r.path === RUNS).length;

describe("useClaimMap", () => {
  beforeEach(() => {
    resetFirestore();
    currentUser = mockUser;
    mockProgramState = null;
  });

  /**
   * Race day must complete on a race-templated run REGARDLESS of pace.
   * You can pace a friend, have a bad day, or run it as a fun run — it is
   * still the race, and gating on pace is how a genuine race day gets
   * left incomplete.
   *
   * This went unreachable in two independent ways at once, and the
   * fixtures below are deliberately production-shaped so neither can come
   * back:
   *   - `runDay.templateId` is `5k_race`, never the literal "race";
   *   - the saved doc carries `actualTemplateId`, NOT a plain `templateId`
   *     (RunSummary writes no such field), so the adapter's value was
   *     undefined for every real run.
   * An easy `avgPace` is used so the short-circuit is the ONLY thing that
   * can complete the slot — with it broken, the pace-bucket check rejects.
   */
  it("completes race day on a race-templated run at an EASY pace", async () => {
    mockProgramState = {
      runDays: [
        {
          id: "rd-race",
          date: "2026-05-26",
          dayIndex: 2,
          templateId: "5k_race", // real id — never the literal "race"
          type: "race",
          status: "planned",
        },
      ],
    };
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([
        {
          id: "run-race",
          data: {
            date: "2026-05-26",
            distance: 5000,
            duration: 1800,
            avgPace: 360, // 6:00/km — "easy" bucket, not quality
            actualTemplateId: "5k_race", // the field docs actually carry
            completedAt: { seconds: 1780000000 },
          },
        },
      ]);
      await flushSnapshots();
    });

    expect(result.current.claimMap.get("rd-race")?.claimedSavedRunId).toBe(
      "run-race"
    );
  });

  /**
   * The same race, run WITHOUT launching it from the scheduled slot.
   *
   * The test above proves the short-circuit fires when the saved doc
   * carries a race `actualTemplateId` — but that field is only set when
   * the run went through the plan. `freeformPlanMetadata` writes
   * `actualTemplateId: null`, so a user who taps Start Run on the start
   * line saves a run with no template at all. That is the obvious
   * race-morning behaviour, and it used to fall straight through to the
   * pace bar.
   *
   * The bar is 270 s/km. A 42.2 km finish at 5:30/km — a good club
   * marathon — read as "easy" and left race day blank; only a
   * sub-4:30/km amateur was unaffected, which inverts who the leniency
   * was written for. The date and the full distance were both already
   * matched.
   *
   * Deliberately driven through the hook's REAL deps (`RUN_TEMPLATES`,
   * the 270 s/km bucket, the metres distance map) rather than injected
   * ones, because the bug was in what production wires up, not in the
   * predicate's own arithmetic.
   */
  it("completes race day on an UNTEMPLATED run — a real marathon finish", async () => {
    mockProgramState = {
      runDays: [
        {
          id: "rd-marathon",
          date: "2026-05-26",
          dayIndex: 2,
          templateId: "marathon_race",
          type: "race",
          status: "planned",
        },
      ],
    };
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([
        {
          id: "run-marathon",
          data: {
            date: "2026-05-26",
            distance: 42200,
            duration: 13926,
            avgPace: 330, // 5:30/km — "easy" bucket
            // No actualTemplateId / plannedTemplateId: freeform start.
            completedAt: { seconds: 1780000000 },
          },
        },
      ]);
      await flushSnapshots();
    });

    expect(result.current.claimMap.get("rd-marathon")?.claimedSavedRunId).toBe(
      "run-marathon"
    );
  });

  /**
   * …and the leniency stops at the race slot's own distance gate, so
   * "race day completes on anything" is not what shipped. A 10 km
   * shakeout on marathon morning is 24% of the planned distance and
   * claims nothing — without this, the fix above would read as
   * "untemplated run + race day ⇒ complete".
   */
  it("does NOT complete race day on a short shakeout", async () => {
    mockProgramState = {
      runDays: [
        {
          id: "rd-marathon",
          date: "2026-05-26",
          dayIndex: 2,
          templateId: "marathon_race",
          type: "race",
          status: "planned",
        },
      ],
    };
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([
        {
          id: "run-shakeout",
          data: {
            date: "2026-05-26",
            distance: 10000,
            duration: 3300,
            avgPace: 330,
            completedAt: { seconds: 1780000000 },
          },
        },
      ]);
      await flushSnapshots();
    });

    expect(
      result.current.claimMap.get("rd-marathon")?.claimedSavedRunId
    ).toBeUndefined();
  });

  it("returns empty result and skips subscription when there is no user", () => {
    currentUser = null;
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    expect(runSubscriptions()).toBe(0);
    expect(result.current.claimMap.size).toBe(0);
    expect(result.current.unclaimedByDate.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("subscribes once and derives the claim map from snapshot + programState", async () => {
    mockProgramState = {
      runDays: [
        {
          id: "rd-1",
          date: "2026-05-26",
          dayIndex: 2,
          templateId: "easy-5k",
          type: "easy",
          status: "planned",
        },
      ],
      manualCompletions: {},
    };

    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    expect(runSubscriptions()).toBe(1);

    await act(async () => {
      seedRuns([
        {
          id: "saved-1",
          data: {
            date: "2026-05-26",
            distance: 5000,
            avgPace: 330,
            templateId: "easy-5k",
            createdAt: Timestamp.fromMillis(1716700000_000),
          },
        },
      ]);
      await flushSnapshots();
    });

    const claim = result.current.claimMap.get("rd-1");
    expect(claim?.claimedSavedRunId).toBe("saved-1");
    expect(result.current.unclaimedByDate.size).toBe(0);
  });

  it("returns unclaimed saved runs keyed by date when no slot matches (Q3 P90)", async () => {
    // Plan has nothing on this date — the saved run can't claim a slot.
    mockProgramState = { runDays: [], manualCompletions: {} };

    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([
        {
          id: "extra-1",
          data: {
            date: "2026-05-26",
            distance: 8000,
            avgPace: 300,
            templateId: "freerun",
            createdAt: Timestamp.fromMillis(1716700000_000),
          },
        },
      ]);
      await flushSnapshots();
    });

    const extras = result.current.unclaimedByDate.get("2026-05-26");
    expect(extras).toHaveLength(1);
    expect(extras?.[0].id).toBe("extra-1");
    expect(result.current.claimMap.size).toBe(0);
  });

  it("propagates manualCompletions into the claim map without a saved-run match", async () => {
    mockProgramState = {
      runDays: [
        {
          id: "rd-2",
          date: "2026-05-20",
          dayIndex: 3,
          templateId: "easy-5k",
          type: "easy",
          status: "planned",
        },
      ],
      manualCompletions: {
        "rd-2": { runDayId: "rd-2", completedAt: 1716000000_000 },
      },
    };

    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([]);
    });

    const claim = result.current.claimMap.get("rd-2");
    expect(claim?.manualCompleted).toBe(true);
    expect(claim?.claimedSavedRunId).toBeUndefined();
  });

  it("uses dateAnchor override so callers can drive midnight-rollover behaviour", () => {
    mockProgramState = { runDays: [], manualCompletions: {} };
    const { result: r1 } = renderHook(() => useClaimMap("2026-05-26"));
    expect(r1.current.today).toBe("2026-05-26");

    const { result: r2 } = renderHook(() => useClaimMap("2026-06-01"));
    expect(r2.current.today).toBe("2026-06-01");
  });
});
/**
 * The 70% distance gate (PR-J-Q1 pin P2).
 *
 * These are the tests the file was missing. Until 2026-08-02 the planned
 * distance was fed to `computeClaims` in KILOMETRES while `saved.distance` is
 * METRES, so the ratio ran 1000x high and the gate never rejected anything.
 * Nothing caught it because every fixture above either uses a templateId that
 * is not in RUN_TEMPLATES at all (`easy-5k`, `freerun` -> planned 0 -> the
 * distance branch is skipped) or sits far above the bar, and not one asserted
 * a REJECTION.
 *
 * `long_15k` is deliberate: type "long" buckets as "easy", so no pace
 * requirement can mask what the distance branch decides.
 */
describe("useClaimMap - distance threshold", () => {
  // Sibling describe: the beforeEach above does not reach here, and without
  // its own reset the saved runs from earlier tests stay in the store and
  // compete for the slot through the single-claim walk.
  beforeEach(() => {
    resetFirestore();
    currentUser = mockUser;
    mockProgramState = null;
  });

  const LONG_15K_DAY = {
    id: "rd-long",
    date: "2026-05-26",
    dayIndex: 2,
    templateId: "long_15k",
    type: "long",
    status: "planned",
  };

  async function claimFor(
    runDay: Record<string, unknown>,
    distance: number
  ): Promise<ReturnType<typeof useClaimMap>> {
    mockProgramState = { runDays: [runDay], manualCompletions: {} };
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([
        {
          id: "saved-d",
          data: {
            date: "2026-05-26",
            distance,
            avgPace: 330,
            createdAt: Timestamp.fromMillis(1716700000_000),
          },
        },
      ]);
      await flushSnapshots();
    });
    return result.current;
  }

  it("REJECTS a saved run below 70% of the planned distance", async () => {
    // 5km against a 15km slot = 33%.
    const r = await claimFor(LONG_15K_DAY, 5000);
    expect(r.claimMap.get("rd-long")?.claimedSavedRunId).toBeUndefined();
    // It is not silently dropped either - it surfaces as an extra run.
    expect(r.unclaimedByDate.get("2026-05-26")).toHaveLength(1);
  });

  it("accepts a saved run at exactly the 70% boundary", async () => {
    const r = await claimFor(LONG_15K_DAY, 10500);
    expect(r.claimMap.get("rd-long")?.claimedSavedRunId).toBe("saved-d");
  });

  it("accepts a saved run above the threshold", async () => {
    const r = await claimFor(LONG_15K_DAY, 15000);
    expect(r.claimMap.get("rd-long")?.claimedSavedRunId).toBe("saved-d");
  });

  it("compares METRES to METRES - a 20m run cannot claim a 15K slot", async () => {
    // The regression test for the unit bug. Under the old kilometre-valued
    // lookup this was 20 / 15 = 1.33, comfortably over the 0.7 bar, so a
    // twenty-metre walk completed a 15K long run. It must now be 20 / 15000.
    const r = await claimFor(LONG_15K_DAY, 20);
    expect(r.claimMap.get("rd-long")?.claimedSavedRunId).toBeUndefined();
  });

  it("judges a swapped day against the OVERRIDE, not the original template", async () => {
    // Tired user swaps their 15K down to an easy 30. `easy_30` is
    // duration-based (no targetDistanceKm), so the distance branch is skipped
    // and a 5km run completes the day. Resolving `templateId` alone would
    // still hold them to the 15K bar and reject it.
    const r = await claimFor(
      { ...LONG_15K_DAY, userOverride: "easy_30" },
      5000
    );
    expect(r.claimMap.get("rd-long")?.claimedSavedRunId).toBe("saved-d");
  });
});
/**
 * The quality-bucket half of the same "which session is this day?" question.
 *
 * `tempo_20` and `easy_30` are deliberate: neither carries a
 * `targetDistanceKm`, so planned distance is 0 and the distance branch is
 * skipped entirely — whatever these assert is the BUCKET's doing.
 */
describe("useClaimMap - quality bucket honours userOverride", () => {
  beforeEach(() => {
    resetFirestore();
    currentUser = mockUser;
    mockProgramState = null;
  });

  async function claimWith(
    runDay: Record<string, unknown>,
    avgPace: number
  ): Promise<ReturnType<typeof useClaimMap>> {
    mockProgramState = { runDays: [runDay], manualCompletions: {} };
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([
        {
          id: "saved-b",
          data: {
            date: "2026-05-26",
            distance: 6000,
            avgPace,
            createdAt: Timestamp.fromMillis(1716700000_000),
          },
        },
      ]);
      await flushSnapshots();
    });
    return result.current;
  }

  const EASY_PACE = 330; // 5:30/km — reads as "easy"

  it("an easy day swapped UP to a tempo is not completed by an easy run", async () => {
    // Reading `templateId` alone would bucket this as easy and complete it.
    const r = await claimWith(
      {
        id: "rd-up",
        date: "2026-05-26",
        dayIndex: 2,
        templateId: "easy_30",
        userOverride: "tempo_20",
        type: "easy",
        status: "planned",
      },
      EASY_PACE
    );
    expect(r.claimMap.get("rd-up")?.claimedSavedRunId).toBeUndefined();
  });

  it("a tempo day swapped DOWN to easy IS completed by an easy run", async () => {
    // The user removed the quality requirement; holding them to the tempo's
    // pace bar would be judging a session they chose not to do.
    const r = await claimWith(
      {
        id: "rd-down",
        date: "2026-05-26",
        dayIndex: 2,
        templateId: "tempo_20",
        userOverride: "easy_30",
        type: "tempo",
        status: "planned",
      },
      EASY_PACE
    );
    expect(r.claimMap.get("rd-down")?.claimedSavedRunId).toBe("saved-b");
  });
});
