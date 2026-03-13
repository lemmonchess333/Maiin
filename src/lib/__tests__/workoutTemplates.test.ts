import { describe, it, expect } from 'vitest';
import { RUN_TEMPLATES } from '../workoutTemplates';

describe('RUN_TEMPLATES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(RUN_TEMPLATES)).toBe(true);
    expect(RUN_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('every template has required fields', () => {
    for (const t of RUN_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.type).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.estimatedDuration).toBeGreaterThan(0);
      expect(t.config).toBeDefined();
    }
  });

  it('all template ids are unique', () => {
    const ids = RUN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all template types are valid', () => {
    const validTypes = ['easy', 'tempo', 'intervals', 'long', 'race'];
    for (const t of RUN_TEMPLATES) {
      expect(validTypes).toContain(t.type);
    }
  });

  it('interval templates have interval config', () => {
    const intervalTemplates = RUN_TEMPLATES.filter((t) => t.type === 'intervals');
    expect(intervalTemplates.length).toBeGreaterThan(0);
    for (const t of intervalTemplates) {
      expect(t.config.intervals).toBeDefined();
      expect(t.config.intervals!.reps).toBeGreaterThan(0);
      expect(t.config.intervals!.restDuration).toBeGreaterThan(0);
    }
  });

  it('tempo templates have target pace', () => {
    const tempoTemplates = RUN_TEMPLATES.filter((t) => t.type === 'tempo');
    for (const t of tempoTemplates) {
      expect(t.config.targetPace).toBeGreaterThan(0);
    }
  });

  it('long/race templates have target distance', () => {
    const distanceTemplates = RUN_TEMPLATES.filter((t) => t.type === 'long' || t.type === 'race');
    for (const t of distanceTemplates) {
      expect(t.config.targetDistance).toBeGreaterThan(0);
    }
  });

  it('contains expected template ids', () => {
    const ids = RUN_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('easy_30');
    expect(ids).toContain('5x1k');
    expect(ids).toContain('long_10k');
    expect(ids).toContain('5k_race');
  });
});
