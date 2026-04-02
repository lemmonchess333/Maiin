import { describe, it, expect } from 'vitest';
import { parseDailyLog, parseGroup, parseCrew } from '../firestoreGuards';

describe('parseDailyLog', () => {
  it('returns safe defaults for empty data', () => {
    const result = parseDailyLog('doc1', {});
    expect(result).toEqual({
      id: 'doc1',
      date: '',
      workouts: 0,
      meals: 0,
      hasPR: false,
      weightKg: undefined,
      notes: '',
      createdAt: undefined,
    });
  });

  it('parses valid data correctly', () => {
    const data = {
      date: '2026-04-01',
      workouts: 2,
      meals: 3,
      hasPR: true,
      weightKg: 80.5,
      notes: 'Good day',
      createdAt: { seconds: 1000 },
    };
    const result = parseDailyLog('doc2', data);
    expect(result.date).toBe('2026-04-01');
    expect(result.workouts).toBe(2);
    expect(result.meals).toBe(3);
    expect(result.hasPR).toBe(true);
    expect(result.weightKg).toBe(80.5);
    expect(result.notes).toBe('Good day');
    expect(result.createdAt).toEqual({ seconds: 1000 });
  });

  it('handles non-numeric workouts/meals gracefully', () => {
    const result = parseDailyLog('doc3', { workouts: 'two', meals: null, weightKg: 'heavy' });
    expect(result.workouts).toBe(0);
    expect(result.meals).toBe(0);
    expect(result.weightKg).toBeUndefined();
  });

  it('coerces truthy values to boolean for hasPR', () => {
    expect(parseDailyLog('x', { hasPR: 1 }).hasPR).toBe(true);
    expect(parseDailyLog('x', { hasPR: 0 }).hasPR).toBe(false);
    expect(parseDailyLog('x', { hasPR: '' }).hasPR).toBe(false);
  });
});

describe('parseGroup', () => {
  it('returns safe defaults for empty data', () => {
    const result = parseGroup('g1', {});
    expect(result).toEqual({
      id: 'g1',
      name: '',
      description: '',
      icon: '',
      memberCount: 0,
      createdAt: undefined,
      createdBy: '',
    });
  });

  it('parses valid group data', () => {
    const result = parseGroup('g2', {
      name: 'Test Group',
      description: 'A group',
      icon: '🏋️',
      memberCount: 5,
      createdBy: 'user1',
    });
    expect(result.name).toBe('Test Group');
    expect(result.memberCount).toBe(5);
    expect(result.createdBy).toBe('user1');
  });

  it('handles non-numeric memberCount', () => {
    expect(parseGroup('g3', { memberCount: 'many' }).memberCount).toBe(0);
  });
});

describe('parseCrew', () => {
  it('returns safe defaults for empty data', () => {
    const result = parseCrew('c1', {});
    expect(result.leaderboardMetric).toBe('workout_count');
    expect(result.type).toBe('custom');
    expect(result.memberCount).toBe(0);
  });

  it('accepts valid type values', () => {
    expect(parseCrew('c2', { type: 'default' }).type).toBe('default');
    expect(parseCrew('c3', { type: 'custom' }).type).toBe('custom');
  });

  it('defaults invalid type to custom', () => {
    expect(parseCrew('c4', { type: 'invalid' }).type).toBe('custom');
    expect(parseCrew('c5', { type: 123 }).type).toBe('custom');
  });
});
