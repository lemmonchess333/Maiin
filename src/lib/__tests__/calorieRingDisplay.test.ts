import { describe, it, expect } from 'vitest';
import { getCalorieRingDisplay } from '../calorieRingDisplay';

/* The label/value mapping for the calorie ring. The pre-F3.1
 * inline expression rendered "5,700 KCAL OVER" in eaten mode +
 * over target, where 5,700 was the consumed amount but the label
 * said "over". The correct read in that scenario is "5,700 KCAL
 * EATEN" — the ring shows the lens the user picked; the glance
 * line below surfaces the over amount separately. */

describe('getCalorieRingDisplay — left mode', () => {
  it('shows the magnitude of overshoot with "over" label when over target', () => {
    /* The spec's first anchor case. Target 4033, consumed 5700 →
       remaining = -1667. Left mode reports the magnitude (1667)
       with the "over" label so the user sees "1667 KCAL OVER". */
    const r = getCalorieRingDisplay({ consumed: 5700, target: 4033, isLeftMode: true });
    expect(r.displayValue).toBe(1667);
    expect(r.labelMode).toBe('over');
    expect(r.isOver).toBe(true);
  });

  it('shows the remaining with "left" label when under target', () => {
    /* The spec's third anchor case. Target 2200, consumed 1500 →
       remaining = 700. */
    const r = getCalorieRingDisplay({ consumed: 1500, target: 2200, isLeftMode: true });
    expect(r.displayValue).toBe(700);
    expect(r.labelMode).toBe('left');
    expect(r.isOver).toBe(false);
  });

  it('shows zero remaining with "left" label when exactly on target', () => {
    /* Edge case: consumed === target. remaining is 0, not over,
       so the ring reads "0 KCAL LEFT" rather than "0 KCAL OVER". */
    const r = getCalorieRingDisplay({ consumed: 2200, target: 2200, isLeftMode: true });
    expect(r.displayValue).toBe(0);
    expect(r.labelMode).toBe('left');
    expect(r.isOver).toBe(false);
  });
});

describe('getCalorieRingDisplay — eaten mode', () => {
  it('shows consumed with "eaten" label even when over target — the F3.1 bug fix', () => {
    /* The spec's second anchor case AND the bug. Target 4033,
       consumed 5700 → ring shows "5700 KCAL EATEN" not
       "5700 KCAL OVER". Pre-F3.1 the label flipped to "over"
       which read as nonsense (5,700 isn't the over amount). */
    const r = getCalorieRingDisplay({ consumed: 5700, target: 4033, isLeftMode: false });
    expect(r.displayValue).toBe(5700);
    expect(r.labelMode).toBe('eaten');
    expect(r.isOver).toBe(true);
  });

  it('shows consumed with "eaten" label when under target', () => {
    /* The spec's fourth anchor case. */
    const r = getCalorieRingDisplay({ consumed: 1500, target: 2200, isLeftMode: false });
    expect(r.displayValue).toBe(1500);
    expect(r.labelMode).toBe('eaten');
    expect(r.isOver).toBe(false);
  });

  it('keeps isOver true in eaten mode + over target so the overshoot arc still renders', () => {
    /* The spec's fifth anchor case. The component reads `isOver`
       to decide whether to render the darker-purple overshoot
       arc. The label fix must not suppress that — the user
       still gets the visual cue that they're over, just with
       eaten-mode wording at the centre. */
    const r = getCalorieRingDisplay({ consumed: 5700, target: 4033, isLeftMode: false });
    expect(r.isOver).toBe(true);
  });
});

describe('getCalorieRingDisplay — defensive', () => {
  it('reports no-target state safely (target === 0)', () => {
    /* hasTarget is false → remaining = 0, isOver = false, so
       neither "over" nor a meaningful left can render. The
       caller falls back to no-target rendering elsewhere. */
    const r = getCalorieRingDisplay({ consumed: 1000, target: 0, isLeftMode: true });
    expect(r.isOver).toBe(false);
    expect(r.labelMode).toBe('left');
  });
});
