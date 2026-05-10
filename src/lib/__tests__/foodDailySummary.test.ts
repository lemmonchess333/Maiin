import { describe, it, expect } from 'vitest';
import { buildGlanceLine } from '../foodDailySummary';

const TARGETS = { finalTarget: 2200, protein: 160, carbs: 250, fat: 60 };

describe('buildGlanceLine — empty + missing-target states', () => {
  it('returns "Ready when you are" when nothing is logged', () => {
    expect(
      buildGlanceLine({ calories: 0, protein: 0, carbs: 0, fat: 0 }, TARGETS),
    ).toBe('Ready when you are');
  });

  it('returns the prompt copy when targets are default and nothing logged', () => {
    expect(
      buildGlanceLine({ calories: 0, protein: 0, carbs: 0, fat: 0 }, TARGETS, {
        targetsAreDefault: true,
      }),
    ).toBe('Set targets to personalise your day');
  });

  it('returns the prompt copy when targets are default even after logging', () => {
    expect(
      buildGlanceLine({ calories: 800, protein: 40, carbs: 80, fat: 20 }, TARGETS, {
        targetsAreDefault: true,
      }),
    ).toBe('Set targets to personalise your day');
  });

  it('returns null for a malformed (zero) calorie target', () => {
    expect(
      buildGlanceLine(
        { calories: 800, protein: 40, carbs: 80, fat: 20 },
        { ...TARGETS, finalTarget: 0 },
      ),
    ).toBeNull();
  });

  it('returns null for NaN target', () => {
    expect(
      buildGlanceLine(
        { calories: 800, protein: 40, carbs: 80, fat: 20 },
        { ...TARGETS, finalTarget: NaN },
      ),
    ).toBeNull();
  });
});

describe('buildGlanceLine — protein-led states', () => {
  it('leads with protein when protein is short and calories are also short', () => {
    /* Spec example: "Still need 40g protein · 800 cal left" */
    expect(
      buildGlanceLine(
        { calories: 1400, protein: 120, carbs: 100, fat: 30 },
        TARGETS,
      ),
    ).toBe('Still need 40g protein · 800 cal left');
  });

  it('leads with protein in compact form when calories are over', () => {
    /* Spec example: "30g protein left · 200 cal over" */
    expect(
      buildGlanceLine(
        { calories: 2400, protein: 130, carbs: 280, fat: 70 },
        TARGETS,
      ),
    ).toBe('30g protein left · 200 cal over');
  });

  it('omits the calorie clause when calories are within the on-track band', () => {
    /* protein short, calories within ±150 of target → just the
       protein clause, no noisy calorie mention. */
    expect(
      buildGlanceLine(
        { calories: 2100, protein: 120, carbs: 230, fat: 55 },
        TARGETS,
      ),
    ).toBe('Still need 40g protein');
  });
});

describe('buildGlanceLine — protein hit + calorie variants', () => {
  it('shows "Protein hit · N cal left" when significantly under calories', () => {
    /* Spec example: "Protein hit · 450 cal left" — and the spec
       explicitly calls out that on-track must NOT show when
       significantly under. */
    expect(
      buildGlanceLine(
        { calories: 1750, protein: 160, carbs: 200, fat: 40 },
        TARGETS,
      ),
    ).toBe('Protein hit · 450 cal left');
  });

  it('shows "N cal over · Protein hit" when over calories with protein hit', () => {
    /* Spec example: "200 cal over · Protein hit" */
    expect(
      buildGlanceLine(
        { calories: 2400, protein: 165, carbs: 280, fat: 70 },
        TARGETS,
      ),
    ).toBe('200 cal over · Protein hit');
  });

  it('shows "On track for today" when protein hit and calories within ±150', () => {
    expect(
      buildGlanceLine(
        { calories: 2150, protein: 160, carbs: 245, fat: 60 },
        TARGETS,
      ),
    ).toBe('On track for today');
  });

  it('does not show "On track for today" when significantly under calories with protein hit', () => {
    /* Spec rule: "Do not show On track for today if the user is
       significantly under calories. For example, if they are 1000
       cal under, show 'Protein hit · 1000 cal left'." */
    const result = buildGlanceLine(
      { calories: 1200, protein: 160, carbs: 150, fat: 30 },
      TARGETS,
    );
    expect(result).not.toBe('On track for today');
    expect(result).toBe('Protein hit · 1000 cal left');
  });

  it('treats over-protein as protein hit (not "still need negative grams")', () => {
    expect(
      buildGlanceLine(
        { calories: 2150, protein: 200, carbs: 245, fat: 60 },
        TARGETS,
      ),
    ).toBe('On track for today');
  });
});

describe('buildGlanceLine — tiny-deficit guard', () => {
  it('does not nag about a 3g protein gap', () => {
    /* Spec: "avoid 'Still need 1g protein' — treat tiny deficits
       as broadly hit." 3g is below the 10g meaningful threshold. */
    const result = buildGlanceLine(
      { calories: 2150, protein: 157, carbs: 245, fat: 60 },
      TARGETS,
    );
    expect(result).toBe('On track for today');
    expect(result).not.toContain('protein');
  });

  it('does not surface a 50 cal under deficit', () => {
    /* 50 cal is well within the ±150 on-track band. Protein hit. */
    expect(
      buildGlanceLine(
        { calories: 2150, protein: 160, carbs: 245, fat: 60 },
        TARGETS,
      ),
    ).toBe('On track for today');
  });

  it('does not produce "0g over" or "-0g" copy', () => {
    /* Exactly-on-target inputs shouldn't produce zero-rounding
       artefacts in the copy. */
    const result = buildGlanceLine(
      { calories: 2200, protein: 160, carbs: 250, fat: 60 },
      TARGETS,
    );
    expect(result).toBe('On track for today');
    expect(result).not.toMatch(/-?0\b/);
  });
});

describe('buildGlanceLine — defensive numeric handling', () => {
  it('treats NaN intake as zero rather than crashing', () => {
    /* The empty-state path should win when intake is missing. */
    const result = buildGlanceLine(
      { calories: NaN, protein: NaN, carbs: NaN, fat: NaN },
      TARGETS,
    );
    expect(result).toBe('Ready when you are');
  });

  it('coerces negative intake to zero', () => {
    /* Bad data path — shouldn't happen, but if a corrupt sum
       lands here we want a sane render rather than negative
       remainders or "5g protein left" with negative consumed. */
    const result = buildGlanceLine(
      { calories: -100, protein: -10, carbs: 0, fat: 0 },
      TARGETS,
    );
    expect(result).toBe('Ready when you are');
  });
});
