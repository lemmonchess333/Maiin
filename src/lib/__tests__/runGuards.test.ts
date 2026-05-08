import { describe, it, expect } from 'vitest';
import {
  isOutdoorGpsRun,
  requiresManualDistance,
  isInvalidRun,
  canShowFullSummary,
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
} from '../runGuards';

/* The guards module is the canonical answer to "is this run real?" /
 * "what should we render?" — these tests pin the contract so future
 * activityType additions (or threshold changes) require deliberate
 * test updates rather than silently shifting behaviour.
 *
 * The 'manual' activityType added with the "Track without GPS" rename
 * is treated identically to 'treadmill' for routing/validation
 * purposes; the distinction is cosmetic (post-run labelling). The
 * tests here pin both shapes so a future change that diverges them
 * has to confront the test. */

describe('isOutdoorGpsRun', () => {
  it('returns true for the standard outdoor activity types', () => {
    expect(isOutdoorGpsRun('freerun')).toBe(true);
    expect(isOutdoorGpsRun('easy')).toBe(true);
    expect(isOutdoorGpsRun('tempo')).toBe(true);
    expect(isOutdoorGpsRun('intervals')).toBe(true);
    expect(isOutdoorGpsRun('long')).toBe(true);
    expect(isOutdoorGpsRun('race')).toBe(true);
    expect(isOutdoorGpsRun('guided')).toBe(true);
  });

  it('returns false for treadmill and manual (both bypass GPS)', () => {
    expect(isOutdoorGpsRun('treadmill')).toBe(false);
    expect(isOutdoorGpsRun('manual')).toBe(false);
  });

  it('treats undefined activityType as outdoor (legacy / mid-config)', () => {
    /* Run.tsx's `runConfig?.activityType` resolves to undefined while
       the modal is mounting; the original inline check
       (`!== 'treadmill'`) returned true for undefined and the helper
       must preserve that to avoid regressions in the lifecycle. */
    expect(isOutdoorGpsRun(undefined)).toBe(true);
  });
});

describe('requiresManualDistance', () => {
  it('returns true for treadmill and manual', () => {
    expect(requiresManualDistance('treadmill')).toBe(true);
    expect(requiresManualDistance('manual')).toBe(true);
  });

  it('returns false for every outdoor activity type', () => {
    expect(requiresManualDistance('freerun')).toBe(false);
    expect(requiresManualDistance('easy')).toBe(false);
    expect(requiresManualDistance('tempo')).toBe(false);
    expect(requiresManualDistance('intervals')).toBe(false);
    expect(requiresManualDistance('long')).toBe(false);
    expect(requiresManualDistance('race')).toBe(false);
    expect(requiresManualDistance('guided')).toBe(false);
  });

  it('returns false for undefined (matches the original inline check)', () => {
    expect(requiresManualDistance(undefined)).toBe(false);
  });
});

describe('isInvalidRun', () => {
  describe('outdoor', () => {
    it('flags runs under the distance floor', () => {
      expect(isInvalidRun({ activityType: 'freerun', distanceKm: 0.04, elapsedSeconds: 60 })).toBe(true);
    });

    it('flags runs under the elapsed-time floor', () => {
      expect(isInvalidRun({ activityType: 'freerun', distanceKm: 0.5, elapsedSeconds: 20 })).toBe(true);
    });

    it('passes runs above both floors', () => {
      expect(isInvalidRun({ activityType: 'freerun', distanceKm: 0.5, elapsedSeconds: 60 })).toBe(false);
    });

    it('flags 0km / under-30s — the canonical screenshot bug from QA', () => {
      expect(isInvalidRun({ activityType: 'easy', distanceKm: 0, elapsedSeconds: 14 })).toBe(true);
    });
  });

  describe('treadmill', () => {
    it('flags runs under the distance floor', () => {
      expect(isInvalidRun({ activityType: 'treadmill', distanceKm: 0.04, elapsedSeconds: 60 })).toBe(true);
    });

    it('does NOT enforce the elapsed-time floor (manual entry, brief warmup is real)', () => {
      /* A 100m / 0:20 treadmill warmup is a legitimate save. The
         original implementation incorrectly flagged this — this test
         pins the corrected contract. */
      expect(isInvalidRun({ activityType: 'treadmill', distanceKm: 0.1, elapsedSeconds: 20 })).toBe(false);
    });
  });

  describe('manual', () => {
    it('mirrors treadmill: distance floor only, no elapsed gate', () => {
      expect(isInvalidRun({ activityType: 'manual', distanceKm: 0.04, elapsedSeconds: 60 })).toBe(true);
      expect(isInvalidRun({ activityType: 'manual', distanceKm: 0.1, elapsedSeconds: 20 })).toBe(false);
      expect(isInvalidRun({ activityType: 'manual', distanceKm: 0.05, elapsedSeconds: 1 })).toBe(false);
    });
  });
});

describe('threshold constants', () => {
  it('are exposed and have the expected values (changing them requires updating this test)', () => {
    expect(MIN_RUN_DURATION_SECONDS).toBe(30);
    expect(MIN_OUTDOOR_DISTANCE_KM).toBe(0.05);
    expect(MIN_TREADMILL_DISTANCE_KM).toBe(0.05);
    expect(MIN_MANUAL_DISTANCE_KM).toBe(0.05);
  });
});

describe('action-visibility guards', () => {
  /* Light coverage — these are pure boolean compositions over
   * SaveStatus + isInvalid. Detailed behaviour (which combinations
   * surface which buttons) lives in the action-row JSX. */

  it('canShowFullSummary hides the rich surface for invalid runs', () => {
    expect(canShowFullSummary({ isInvalid: true })).toBe(false);
    expect(canShowFullSummary({ isInvalid: false })).toBe(true);
  });

  it('canShowNormalSave only fires for valid runs in idle/saving', () => {
    expect(canShowNormalSave({ isInvalid: false, saveStatus: 'idle' })).toBe(true);
    expect(canShowNormalSave({ isInvalid: false, saveStatus: 'saving' })).toBe(true);
    expect(canShowNormalSave({ isInvalid: false, saveStatus: 'saved' })).toBe(false);
    expect(canShowNormalSave({ isInvalid: false, saveStatus: 'error' })).toBe(false);
    expect(canShowNormalSave({ isInvalid: true, saveStatus: 'idle' })).toBe(false);
  });

  it('canShowSaveAnyway is the invalid-run mirror of canShowNormalSave', () => {
    expect(canShowSaveAnyway({ isInvalid: true, saveStatus: 'idle' })).toBe(true);
    expect(canShowSaveAnyway({ isInvalid: true, saveStatus: 'saving' })).toBe(true);
    expect(canShowSaveAnyway({ isInvalid: true, saveStatus: 'saved' })).toBe(false);
    expect(canShowSaveAnyway({ isInvalid: false, saveStatus: 'idle' })).toBe(false);
  });

  it('canShowDiscard hides during saving (race prevention) and after saved', () => {
    expect(canShowDiscard({ saveStatus: 'idle' })).toBe(true);
    expect(canShowDiscard({ saveStatus: 'error' })).toBe(true);
    expect(canShowDiscard({ saveStatus: 'saving' })).toBe(false);
    expect(canShowDiscard({ saveStatus: 'saved' })).toBe(false);
  });

  it('canShowShare requires both valid and saved', () => {
    expect(canShowShare({ isInvalid: false, saveStatus: 'saved' })).toBe(true);
    expect(canShowShare({ isInvalid: false, saveStatus: 'idle' })).toBe(false);
    expect(canShowShare({ isInvalid: true, saveStatus: 'saved' })).toBe(false);
  });

  it('canExportGpx additionally requires an outdoor GPS run', () => {
    expect(canExportGpx({ isInvalid: false, isOutdoorGpsRun: true, saveStatus: 'saved' })).toBe(true);
    expect(canExportGpx({ isInvalid: false, isOutdoorGpsRun: false, saveStatus: 'saved' })).toBe(false);
    expect(canExportGpx({ isInvalid: true, isOutdoorGpsRun: true, saveStatus: 'saved' })).toBe(false);
    expect(canExportGpx({ isInvalid: false, isOutdoorGpsRun: true, saveStatus: 'idle' })).toBe(false);
  });

  it('canShowDone fires only on saved', () => {
    expect(canShowDone({ saveStatus: 'saved' })).toBe(true);
    expect(canShowDone({ saveStatus: 'idle' })).toBe(false);
    expect(canShowDone({ saveStatus: 'saving' })).toBe(false);
    expect(canShowDone({ saveStatus: 'error' })).toBe(false);
  });

  it('canShowRetrySave fires only on error', () => {
    expect(canShowRetrySave({ saveStatus: 'error' })).toBe(true);
    expect(canShowRetrySave({ saveStatus: 'idle' })).toBe(false);
    expect(canShowRetrySave({ saveStatus: 'saving' })).toBe(false);
    expect(canShowRetrySave({ saveStatus: 'saved' })).toBe(false);
  });
});
