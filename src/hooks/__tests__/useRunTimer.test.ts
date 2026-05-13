import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRunTimer } from '../useRunTimer';

describe('useRunTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at zero', () => {
    const { result } = renderHook(() => useRunTimer());
    expect(result.current.elapsed).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('starts and tracks elapsed time', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.start());
    expect(result.current.isRunning).toBe(true);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.elapsed).toBeGreaterThanOrEqual(2);
  });

  it('pauses and resumes', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.start());
    vi.advanceTimersByTime(2000);
    act(() => result.current.pause());
    expect(result.current.isRunning).toBe(false);

    const pausedElapsed = result.current.elapsed;
    vi.advanceTimersByTime(5000);
    expect(result.current.elapsed).toBe(pausedElapsed);

    act(() => result.current.resume());
    expect(result.current.isRunning).toBe(true);
  });

  it('resets to zero', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.start());
    vi.advanceTimersByTime(3000);
    act(() => result.current.reset());
    expect(result.current.elapsed).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('formatTime formats correctly', () => {
    const { result } = renderHook(() => useRunTimer());
    expect(result.current.formatTime(0)).toBe('0:00');
    expect(result.current.formatTime(65)).toBe('1:05');
    expect(result.current.formatTime(3661)).toBe('1:01:01');
    expect(result.current.formatTime(7200)).toBe('2:00:00');
  });

  it('recalcNow forces immediate elapsed update while running', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.start());

    // Advance time but don't let setInterval fire
    vi.advanceTimersByTime(5500);

    // Force recalc — should immediately update elapsed
    act(() => result.current.recalcNow());
    expect(result.current.elapsed).toBeGreaterThanOrEqual(5);
  });

  it('recalcNow does nothing when paused', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.start());
    vi.advanceTimersByTime(3000);
    act(() => result.current.pause());

    const pausedElapsed = result.current.elapsed;
    vi.advanceTimersByTime(10000);
    act(() => result.current.recalcNow());

    // Should not change — timer is paused
    expect(result.current.elapsed).toBe(pausedElapsed);
  });

  /* ── Phase B3 ─────────────────────────────────────────────────
     rehydrate + getAccumulatedSeconds are the two persistence
     primitives. The tests below pin their contract — the run-
     resume flow depends on:
       - rehydrate restoring accumulatedSeconds + isRunning, with
         elapsed updating before the next interval tick
       - getAccumulatedSeconds returning live (running) or frozen
         (paused) seconds without flooring
  */
  it('rehydrate restores elapsed and isRunning=true', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.rehydrate({ accumulatedSeconds: 120, isRunning: true }));
    expect(result.current.elapsed).toBe(120);
    expect(result.current.isRunning).toBe(true);
  });

  it('rehydrate restores elapsed and isRunning=false', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.rehydrate({ accumulatedSeconds: 75, isRunning: false }));
    expect(result.current.elapsed).toBe(75);
    expect(result.current.isRunning).toBe(false);
  });

  it('rehydrate then advance — elapsed climbs from the restored base while running', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.rehydrate({ accumulatedSeconds: 100, isRunning: true }));
    act(() => { vi.advanceTimersByTime(3000); });
    // The setInterval inside the hook should have ticked; elapsed
    // climbs above the restored base.
    expect(result.current.elapsed).toBeGreaterThanOrEqual(102);
  });

  it('rehydrate then advance — elapsed stays at the restored base while paused', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.rehydrate({ accumulatedSeconds: 50, isRunning: false }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.elapsed).toBe(50);
  });

  it('getAccumulatedSeconds returns the frozen value when paused', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.start());
    vi.advanceTimersByTime(3000);
    act(() => result.current.pause());
    const acc = result.current.getAccumulatedSeconds();
    // Should equal the frozen accumulated seconds — within rounding.
    expect(acc).toBeGreaterThanOrEqual(2.9);
    expect(acc).toBeLessThanOrEqual(3.1);
  });

  it('getAccumulatedSeconds returns the live value while running', () => {
    const { result } = renderHook(() => useRunTimer());
    act(() => result.current.start());
    vi.advanceTimersByTime(4500);
    const acc = result.current.getAccumulatedSeconds();
    // Running: returns accumulatedRef + (Date.now() - startTimeRef).
    // Real-time tracking — flooring isn't applied here so we expect
    // a value close to 4.5s.
    expect(acc).toBeGreaterThanOrEqual(4.3);
    expect(acc).toBeLessThanOrEqual(4.7);
  });

  it('accumulates time correctly across pause/resume cycles', () => {
    const { result } = renderHook(() => useRunTimer());

    // Run for 3s
    act(() => result.current.start());
    vi.advanceTimersByTime(3000);
    act(() => { vi.advanceTimersByTime(0); }); // flush interval

    // Pause for 5s
    act(() => result.current.pause());
    const afterFirstRun = result.current.elapsed;
    vi.advanceTimersByTime(5000);

    // Resume for 2s
    act(() => result.current.resume());
    vi.advanceTimersByTime(2000);
    act(() => result.current.recalcNow());

    // Should be ~5s total (3 + 2), not 10 (3 + 5 + 2)
    expect(result.current.elapsed).toBeGreaterThanOrEqual(afterFirstRun + 1);
    expect(result.current.elapsed).toBeLessThanOrEqual(afterFirstRun + 3);
  });
});
