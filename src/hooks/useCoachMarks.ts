import { useState } from 'react';

const STORAGE_KEY = 'tropos-coach-marks-dismissed';

export function useCoachMarks() {
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(STORAGE_KEY));

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, '1');
  };

  return { showCoachMarks: !dismissed, dismiss };
}
