import { describe, it, expect } from "vitest";
import {
  unsizedRunHeading,
  hasUnsavedFieldEdits,
  isOutdoorGpsRun,
  isTreadmillRun,
  requiresManualDistance,
  getInvalidRunReason,
  canShowNormalSave,
  canShowSaveAnyway,
  canShowDiscard,
  canShowShare,
  canExportGpx,
  canShowDone,
  canShowRetrySave,
  MIN_RUN_DURATION_SECONDS,
  MIN_OUTDOOR_DISTANCE_KM,
  MIN_TREADMILL_DISTANCE_KM,
  MIN_MANUAL_DISTANCE_KM,
} from "../runGuards";

/* The guards module is the canonical answer to "is this run real?" /
 * "what should we render?" — these tests pin the contract so future
 * activityType additions (or threshold changes) require deliberate
 * test updates rather than silently shifting behaviour.
 *
 * The 'manual' activityType added with the "Track without GPS" rename
 * is treated identically to a treadmill run for routing/validation
 * purposes; the distinction is cosmetic (post-run labelling). The
 * tests here pin both shapes so a future change that diverges them
 * has to confront the test.
 *
 * Pgm8: the treadmill is where a run is done (`place: "treadmill"`),
 * whatever its type, and a run saved before that is one by its
 * `activityType: "treadmill"`. Both shapes are pinned, so the guards can
 * never tell an old treadmill run from a new one. */

/** Every session type a run can be, outdoors or on the treadmill. */
const SESSION_TYPES = [
  "freerun",
  "easy",
  "tempo",
  "intervals",
  "long",
  "race",
  "guided",
] as const;

describe("isTreadmillRun", () => {
  it("is a treadmill run by its place, whatever its type (Pgm8)", () => {
    for (const activityType of SESSION_TYPES)
      expect(isTreadmillRun({ activityType, place: "treadmill" })).toBe(true);
  });

  it("is one by its type when saved before the treadmill was a place", () => {
    expect(isTreadmillRun({ activityType: "treadmill" })).toBe(true);
    expect(isTreadmillRun({ activityType: "treadmill", place: null })).toBe(
      true
    );
  });

  it("is not one outdoors, tracked without GPS, or with nothing to read", () => {
    for (const activityType of SESSION_TYPES) {
      expect(isTreadmillRun({ activityType })).toBe(false);
      expect(isTreadmillRun({ activityType, place: null })).toBe(false);
    }
    expect(isTreadmillRun({ activityType: "manual" })).toBe(false);
    expect(isTreadmillRun({})).toBe(false);
    expect(isTreadmillRun(null)).toBe(false);
    expect(isTreadmillRun(undefined)).toBe(false);
  });
});

describe("isOutdoorGpsRun", () => {
  it("returns true for the standard outdoor activity types", () => {
    for (const activityType of SESSION_TYPES)
      expect(isOutdoorGpsRun({ activityType })).toBe(true);
  });

  it("returns false for treadmill and manual (both bypass GPS)", () => {
    expect(isOutdoorGpsRun({ activityType: "treadmill" })).toBe(false);
    expect(isOutdoorGpsRun({ activityType: "manual" })).toBe(false);
  });

  it("returns false for any type on the treadmill: a planned long run there has no GPS", () => {
    for (const activityType of SESSION_TYPES)
      expect(isOutdoorGpsRun({ activityType, place: "treadmill" })).toBe(false);
  });

  it("treats a run with no type as outdoor (legacy / mid-config)", () => {
    /* Run.tsx's `runConfig` is null while the modal is mounting; the
       original inline check (`!== 'treadmill'`) returned true for an
       undefined type and the helper must preserve that to avoid
       regressions in the lifecycle. */
    expect(isOutdoorGpsRun(undefined)).toBe(true);
    expect(isOutdoorGpsRun(null)).toBe(true);
    expect(isOutdoorGpsRun({})).toBe(true);
  });
});

describe("requiresManualDistance", () => {
  it("returns true for treadmill and manual", () => {
    expect(requiresManualDistance({ activityType: "treadmill" })).toBe(true);
    expect(requiresManualDistance({ activityType: "manual" })).toBe(true);
  });

  it("returns true for any type on the treadmill (Pgm8)", () => {
    for (const activityType of SESSION_TYPES)
      expect(requiresManualDistance({ activityType, place: "treadmill" })).toBe(
        true
      );
  });

  it("returns false for every outdoor activity type", () => {
    for (const activityType of SESSION_TYPES)
      expect(requiresManualDistance({ activityType })).toBe(false);
  });

  it("returns false for undefined (matches the original inline check)", () => {
    expect(requiresManualDistance(undefined)).toBe(false);
  });
});

describe("invalid-run thresholds", () => {
  /* `isInvalidRun` was a production export wrapping this predicate. It
     was deleted 2026-07-27 as unreachable — both real call sites
     (Run.tsx, RunSummary.tsx) want the REASON, not a boolean, because
     they have to explain which failure occurred. The threshold coverage
     it carried is real and outlives it, so the block moved onto the
     surviving predicate rather than being deleted alongside the wrapper. */
  const isInvalid = (args: Parameters<typeof getInvalidRunReason>[0]) =>
    getInvalidRunReason(args) !== null;

  describe("outdoor", () => {
    it("flags runs under the distance floor", () => {
      expect(
        isInvalid({
          activityType: "freerun",
          distanceKm: 0.04,
          elapsedSeconds: 60,
        })
      ).toBe(true);
    });

    it("flags runs under the elapsed-time floor", () => {
      expect(
        isInvalid({
          activityType: "freerun",
          distanceKm: 0.5,
          elapsedSeconds: 20,
        })
      ).toBe(true);
    });

    it("passes runs above both floors", () => {
      expect(
        isInvalid({
          activityType: "freerun",
          distanceKm: 0.5,
          elapsedSeconds: 60,
        })
      ).toBe(false);
    });

    it("flags 0km / under-30s — the canonical screenshot bug from QA", () => {
      expect(
        isInvalid({
          activityType: "easy",
          distanceKm: 0,
          elapsedSeconds: 14,
        })
      ).toBe(true);
    });
  });

  describe("treadmill", () => {
    it("flags runs under the distance floor", () => {
      expect(
        isInvalid({
          activityType: "treadmill",
          distanceKm: 0.04,
          elapsedSeconds: 60,
        })
      ).toBe(true);
    });

    it("flags runs under the elapsed-time floor (uniform 30s contract)", () => {
      /* For user-entered distance, elapsed time is the only measured
         signal we have to catch accidental taps. The 30s floor applies
         the same way it does for outdoor. A 100m / 0:20 entry is
         flagged. */
      expect(
        isInvalid({
          activityType: "treadmill",
          distanceKm: 0.1,
          elapsedSeconds: 20,
        })
      ).toBe(true);
    });

    it("passes treadmill runs above both floors", () => {
      expect(
        isInvalid({
          activityType: "treadmill",
          distanceKm: 0.05,
          elapsedSeconds: 60,
        })
      ).toBe(false);
    });
  });

  describe("a session type on the treadmill (Pgm8)", () => {
    it("is held to the treadmill's floors, not the outdoor ones", () => {
      expect(
        isInvalid({
          activityType: "long",
          place: "treadmill",
          distanceKm: 0.04,
          elapsedSeconds: 60,
        })
      ).toBe(true);
      expect(
        isInvalid({
          activityType: "long",
          place: "treadmill",
          distanceKm: 0.05,
          elapsedSeconds: 60,
        })
      ).toBe(false);
    });
  });

  describe("manual", () => {
    it("mirrors treadmill: enforces both distance and elapsed-time floors", () => {
      expect(
        isInvalid({
          activityType: "manual",
          distanceKm: 0.04,
          elapsedSeconds: 60,
        })
      ).toBe(true);
      expect(
        isInvalid({
          activityType: "manual",
          distanceKm: 0.1,
          elapsedSeconds: 20,
        })
      ).toBe(true);
      expect(
        isInvalid({
          activityType: "manual",
          distanceKm: 0.05,
          elapsedSeconds: 60,
        })
      ).toBe(false);
    });
  });
});

describe("getInvalidRunReason — uniform contract", () => {
  /* Reason-explicit coverage for the contract change. Sub-30s and
     sub-0.05km both produce 'too-short' regardless of activityType;
     'too-fast' (12 m/s aggregate) only fires on manual-distance modes
     because outdoor is bounded by isValidReading()'s per-fix filter. */
  it("flags treadmill 0.05km / 10s as 'too-short'", () => {
    expect(
      getInvalidRunReason({
        activityType: "treadmill",
        distanceKm: 0.05,
        elapsedSeconds: 10,
      })
    ).toBe("too-short");
  });

  it("flags manual 0.05km / 10s as 'too-short'", () => {
    expect(
      getInvalidRunReason({
        activityType: "manual",
        distanceKm: 0.05,
        elapsedSeconds: 10,
      })
    ).toBe("too-short");
  });

  it("passes treadmill 0.05km / 60s", () => {
    expect(
      getInvalidRunReason({
        activityType: "treadmill",
        distanceKm: 0.05,
        elapsedSeconds: 60,
      })
    ).toBeNull();
  });

  it("passes manual 0.05km / 60s", () => {
    expect(
      getInvalidRunReason({
        activityType: "manual",
        distanceKm: 0.05,
        elapsedSeconds: 60,
      })
    ).toBeNull();
  });

  it("flags treadmill 20km / 8s as 'too-fast' (speed branch wins over elapsed)", () => {
    expect(
      getInvalidRunReason({
        activityType: "treadmill",
        distanceKm: 20,
        elapsedSeconds: 8,
      })
    ).toBe("too-fast");
  });

  it("flags a planned long run typed in on the treadmill at 20km / 8s as 'too-fast' (Pgm8)", () => {
    /* The type is the plan's, "long", but the distance was typed in: the
       typo check is the treadmill's, which an outdoor long run never
       gets. */
    expect(
      getInvalidRunReason({
        activityType: "long",
        place: "treadmill",
        distanceKm: 20,
        elapsedSeconds: 8,
      })
    ).toBe("too-fast");
    expect(
      getInvalidRunReason({
        activityType: "long",
        distanceKm: 20,
        elapsedSeconds: 8,
      })
    ).toBe("too-short");
  });

  it("flags manual 20km / 8s as 'too-fast'", () => {
    expect(
      getInvalidRunReason({
        activityType: "manual",
        distanceKm: 20,
        elapsedSeconds: 8,
      })
    ).toBe("too-fast");
  });

  it("flags outdoor 0.5km / 10s as 'too-short'", () => {
    expect(
      getInvalidRunReason({
        activityType: "easy",
        distanceKm: 0.5,
        elapsedSeconds: 10,
      })
    ).toBe("too-short");
  });

  it("flags outdoor 20km / 8s as 'too-short' (outdoor never returns 'too-fast')", () => {
    /* The 'too-fast' branch is gated on requiresManualDistance, so
       outdoor falls through to the elapsed-time floor regardless of
       the implied aggregate speed. */
    expect(
      getInvalidRunReason({
        activityType: "freerun",
        distanceKm: 20,
        elapsedSeconds: 8,
      })
    ).toBe("too-short");
  });

  it("flags treadmill 5km / 0s as 'too-short' without throwing (divide-by-zero guard)", () => {
    expect(() =>
      getInvalidRunReason({
        activityType: "treadmill",
        distanceKm: 5,
        elapsedSeconds: 0,
      })
    ).not.toThrow();
    expect(
      getInvalidRunReason({
        activityType: "treadmill",
        distanceKm: 5,
        elapsedSeconds: 0,
      })
    ).toBe("too-short");
  });

  it("flags manual 5km / 0s as 'too-short' without throwing", () => {
    expect(() =>
      getInvalidRunReason({
        activityType: "manual",
        distanceKm: 5,
        elapsedSeconds: 0,
      })
    ).not.toThrow();
    expect(
      getInvalidRunReason({
        activityType: "manual",
        distanceKm: 5,
        elapsedSeconds: 0,
      })
    ).toBe("too-short");
  });
});

describe("threshold constants", () => {
  it("are exposed and have the expected values (changing them requires updating this test)", () => {
    expect(MIN_RUN_DURATION_SECONDS).toBe(30);
    expect(MIN_OUTDOOR_DISTANCE_KM).toBe(0.05);
    expect(MIN_TREADMILL_DISTANCE_KM).toBe(0.05);
    expect(MIN_MANUAL_DISTANCE_KM).toBe(0.05);
  });
});

describe("action-visibility guards", () => {
  /* Light coverage — these are pure boolean compositions over
   * SaveStatus + isInvalid. Detailed behaviour (which combinations
   * surface which buttons) lives in the action-row JSX. */

  it("canShowNormalSave only fires for valid runs in idle/saving", () => {
    expect(canShowNormalSave({ isInvalid: false, saveStatus: "idle" })).toBe(
      true
    );
    expect(canShowNormalSave({ isInvalid: false, saveStatus: "saving" })).toBe(
      true
    );
    expect(canShowNormalSave({ isInvalid: false, saveStatus: "saved" })).toBe(
      false
    );
    expect(canShowNormalSave({ isInvalid: false, saveStatus: "error" })).toBe(
      false
    );
    expect(canShowNormalSave({ isInvalid: true, saveStatus: "idle" })).toBe(
      false
    );
  });

  it("canShowSaveAnyway is the invalid-run mirror of canShowNormalSave", () => {
    expect(canShowSaveAnyway({ isInvalid: true, saveStatus: "idle" })).toBe(
      true
    );
    expect(canShowSaveAnyway({ isInvalid: true, saveStatus: "saving" })).toBe(
      true
    );
    expect(canShowSaveAnyway({ isInvalid: true, saveStatus: "saved" })).toBe(
      false
    );
    expect(canShowSaveAnyway({ isInvalid: false, saveStatus: "idle" })).toBe(
      false
    );
  });

  it("canShowDiscard hides during saving (race prevention) and after saved", () => {
    expect(canShowDiscard({ saveStatus: "idle" })).toBe(true);
    expect(canShowDiscard({ saveStatus: "error" })).toBe(true);
    expect(canShowDiscard({ saveStatus: "saving" })).toBe(false);
    expect(canShowDiscard({ saveStatus: "saved" })).toBe(false);
  });

  it("canShowShare requires both valid and saved", () => {
    expect(canShowShare({ isInvalid: false, saveStatus: "saved" })).toBe(true);
    expect(canShowShare({ isInvalid: false, saveStatus: "idle" })).toBe(false);
    expect(canShowShare({ isInvalid: true, saveStatus: "saved" })).toBe(false);
  });

  it("canExportGpx additionally requires an outdoor GPS run", () => {
    expect(
      canExportGpx({
        isInvalid: false,
        isOutdoorGpsRun: true,
        saveStatus: "saved",
      })
    ).toBe(true);
    expect(
      canExportGpx({
        isInvalid: false,
        isOutdoorGpsRun: false,
        saveStatus: "saved",
      })
    ).toBe(false);
    expect(
      canExportGpx({
        isInvalid: true,
        isOutdoorGpsRun: true,
        saveStatus: "saved",
      })
    ).toBe(false);
    expect(
      canExportGpx({
        isInvalid: false,
        isOutdoorGpsRun: true,
        saveStatus: "idle",
      })
    ).toBe(false);
  });

  it("canShowDone fires only on saved", () => {
    expect(canShowDone({ saveStatus: "saved" })).toBe(true);
    expect(canShowDone({ saveStatus: "idle" })).toBe(false);
    expect(canShowDone({ saveStatus: "saving" })).toBe(false);
    expect(canShowDone({ saveStatus: "error" })).toBe(false);
  });

  it("canShowRetrySave fires only on error", () => {
    expect(canShowRetrySave({ saveStatus: "error" })).toBe(true);
    expect(canShowRetrySave({ saveStatus: "idle" })).toBe(false);
    expect(canShowRetrySave({ saveStatus: "saving" })).toBe(false);
    expect(canShowRetrySave({ saveStatus: "saved" })).toBe(false);
  });
});

describe("unsizedRunHeading — 'Run saved' is a claim about the write", () => {
  /* The reported case: a short run showed "Run saved" the moment the
     summary opened, above a Save button nobody had tapped. The heading
     was decided from the distance alone and never consulted the write. */
  it("says Run recorded before the run is written", () => {
    expect(unsizedRunHeading({ saveStatus: "idle" })).toBe("Run recorded");
  });

  it("still says Run recorded while the write is in flight", () => {
    // "Saving" is not "saved" — the write can still fail.
    expect(unsizedRunHeading({ saveStatus: "saving" })).toBe("Run recorded");
  });

  it("does not claim saved after a FAILED write", () => {
    // The case that would be worst to get wrong: the run is not on the
    // user's account and the heading must not say it is.
    expect(unsizedRunHeading({ saveStatus: "error" })).toBe("Run recorded");
  });

  it("says Run saved once the write lands — the counterweight", () => {
    // Without this, the three above are satisfied by a function that never
    // says "Run saved" at all.
    expect(unsizedRunHeading({ saveStatus: "saved" })).toBe("Run saved");
  });
});

describe("hasUnsavedFieldEdits — the post-save correction", () => {
  const base = {
    notes: "felt good",
    relativeEffort: "matched" as string | null,
  };

  it("is false before the run is written", () => {
    // Nothing to update yet, and the ordinary Save button is still on screen.
    expect(
      hasUnsavedFieldEdits({
        saved: null,
        notes: "anything",
        relativeEffort: null,
      })
    ).toBe(false);
  });

  it("is false when nothing has changed since the write", () => {
    expect(
      hasUnsavedFieldEdits({
        saved: base,
        notes: "felt good",
        relativeEffort: "matched",
      })
    ).toBe(false);
  });

  it("catches an edited note", () => {
    expect(
      hasUnsavedFieldEdits({
        saved: base,
        notes: "felt hard actually",
        relativeEffort: "matched",
      })
    ).toBe(true);
  });

  it("catches a changed effort", () => {
    expect(
      hasUnsavedFieldEdits({
        saved: base,
        notes: "felt good",
        relativeEffort: "harder",
      })
    ).toBe(true);
  });

  it("catches effort being cleared back to skipped", () => {
    // null is a first-class answer here, so clearing it is a real edit.
    expect(
      hasUnsavedFieldEdits({
        saved: base,
        notes: "felt good",
        relativeEffort: null,
      })
    ).toBe(true);
  });

  it("ignores trailing whitespace — the written form was trimmed", () => {
    expect(
      hasUnsavedFieldEdits({
        saved: base,
        notes: "felt good   ",
        relativeEffort: "matched",
      })
    ).toBe(false);
  });
});
