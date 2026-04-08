import { useState } from 'react';

const STORAGE_KEY_BASE = 'tropos-coach-marks-dismissed';

/**
 * One-shot dismissible coach mark state, optionally keyed.
 *
 * Without a key (legacy): a single global "have we shown the welcome yet?"
 * flag. Dismissing it hides all unkeyed coach marks forever.
 *
 * With a key: per-mark dismissal. Each feature gets its own flag so the
 * user can dismiss the Home welcome without auto-dismissing every other
 * coach mark on the app. Use this for targeted explainers (e.g. the Food
 * hero's "+250 FUEL" caption explainer).
 */
export function useCoachMarks(key?: string) {
  const storageKey = key ? `${STORAGE_KEY_BASE}:${key}` : STORAGE_KEY_BASE;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !!window.localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Storage unavailable (private mode etc) — state still updates in memory
    }
  };

  return { showCoachMarks: !dismissed, dismiss };
}
