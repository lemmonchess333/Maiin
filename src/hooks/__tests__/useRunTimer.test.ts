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
});
