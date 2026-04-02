import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIntervalWorkout, type IntervalConfig } from '../useIntervalWorkout';

describe('useIntervalWorkout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const basicConfig: IntervalConfig = {
    reps: 3,
    workDuration: 5,
    restDuration: 3,
  };

  it('starts in idle phase', () => {
    const { result } = renderHook(() => useIntervalWorkout(basicConfig));
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.currentRep).toBe(0);
  });

  it('transitions to work phase on start (no warmup)', () => {
    const { result } = renderHook(() => useIntervalWorkout(basicConfig));
    act(() => result.current.start());
    expect(result.current.state.phase).toBe('work');
    expect(result.current.state.currentRep).toBe(1);
  });

  it('transitions to warmup phase when configured', () => {
    const config: IntervalConfig = { ...basicConfig, warmupDuration: 10 };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());
    expect(result.current.state.phase).toBe('warmup');
    expect(result.current.state.currentRep).toBe(0);
  });

  it('transitions from work to rest after work duration', () => {
    const { result } = renderHook(() => useIntervalWorkout(basicConfig));
    act(() => result.current.start());

    // Simulate time passing beyond work duration
    vi.advanceTimersByTime(6000);
    act(() => result.current.tick(6, 0));

    expect(result.current.state.phase).toBe('rest');
  });

  it('transitions from rest to work for next rep', () => {
    const { result } = renderHook(() => useIntervalWorkout(basicConfig));
    act(() => result.current.start());

    // Complete work phase
    vi.advanceTimersByTime(6000);
    act(() => result.current.tick(6, 0));
    expect(result.current.state.phase).toBe('rest');

    // Complete rest phase
    vi.advanceTimersByTime(4000);
    act(() => result.current.tick(10, 0));
    expect(result.current.state.phase).toBe('work');
    expect(result.current.state.currentRep).toBe(2);
  });

  it('completes after all reps are done (no cooldown)', () => {
    const config: IntervalConfig = { reps: 1, workDuration: 2, restDuration: 2 };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());

    // Complete the single work rep
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(3, 0));

    expect(result.current.state.phase).toBe('complete');
  });

  it('goes to cooldown before complete when configured', () => {
    const config: IntervalConfig = { reps: 1, workDuration: 2, restDuration: 2, cooldownDuration: 5 };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());

    // Complete work
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(3, 0));

    expect(result.current.state.phase).toBe('cooldown');
  });

  it('prevents rep counter from exceeding totalReps on rest→work transition', () => {
    const config: IntervalConfig = { reps: 2, workDuration: 2, restDuration: 2 };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());

    // Rep 1: work → rest
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(3, 0));
    expect(result.current.state.phase).toBe('rest');

    // rest → work (rep 2)
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(6, 0));
    expect(result.current.state.phase).toBe('work');
    expect(result.current.state.currentRep).toBe(2);

    // Rep 2: work → complete (no rest after final rep because reps exhausted)
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(9, 0));
    expect(result.current.state.phase).toBe('complete');
  });

  it('handles distance-based work phases', () => {
    const config: IntervalConfig = { reps: 1, workDistance: 400, restDuration: 3 };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());
    expect(result.current.state.isDistanceBased).toBe(true);

    // Simulate running 400m
    vi.advanceTimersByTime(2000);
    act(() => result.current.tick(2, 450));

    expect(result.current.state.phase).toBe('complete');
  });

  it('does nothing when config is undefined', () => {
    const { result } = renderHook(() => useIntervalWorkout(undefined));
    act(() => result.current.start());
    expect(result.current.state.phase).toBe('idle');
  });
});
