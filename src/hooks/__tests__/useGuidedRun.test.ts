import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGuidedRun } from '../useGuidedRun';
import type { GuidedRunWorkout } from '@/lib/guidedRun';

// Mock speechSynthesis + SpeechSynthesisUtterance
const mockSpeak = vi.fn();
const mockGetVoices = vi.fn(() => []);
Object.defineProperty(window, 'speechSynthesis', {
  value: { speak: mockSpeak, getVoices: mockGetVoices, cancel: vi.fn() },
  writable: true,
});
// @ts-expect-error — mock class for jsdom
globalThis.SpeechSynthesisUtterance = class {
  text = '';
  rate = 1;
  voice: unknown = null;
  constructor(text = '') { this.text = text; }
};

const makeWorkout = (segments: { label: string; instruction: string; durationSeconds: number }[]): GuidedRunWorkout => ({
  id: 'test',
  name: 'Test Run',
  description: 'A test guided run',
  totalMinutes: segments.reduce((s, seg) => s + seg.durationSeconds, 0) / 60,
  difficulty: 'easy' as const,
  color: '#22b558',
  segments: segments.map((s, i) => ({ ...s, type: 'easy' as const, order: i })),
});

describe('useGuidedRun', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSpeak.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with first segment', () => {
    const workout = makeWorkout([
      { label: 'Warm Up', instruction: 'Easy pace', durationSeconds: 60 },
      { label: 'Run', instruction: 'Steady pace', durationSeconds: 120 },
    ]);

    const { result } = renderHook(() => useGuidedRun(workout, false));

    expect(result.current.currentSegmentIndex).toBe(0);
    expect(result.current.timeRemaining).toBe(60);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.currentSegment?.label).toBe('Warm Up');
    expect(result.current.nextSegment?.label).toBe('Run');
  });

  it('does not tick when not running', () => {
    const workout = makeWorkout([
      { label: 'Run', instruction: 'Go', durationSeconds: 30 },
    ]);

    const { result } = renderHook(() => useGuidedRun(workout, false));

    act(() => { vi.advanceTimersByTime(5000); });

    expect(result.current.timeRemaining).toBe(30);
    expect(result.current.totalElapsed).toBe(0);
  });

  it('counts down when running', () => {
    const workout = makeWorkout([
      { label: 'Run', instruction: 'Go', durationSeconds: 10 },
    ]);

    const { result } = renderHook(() => useGuidedRun(workout, true));

    act(() => { vi.advanceTimersByTime(3000); });

    expect(result.current.timeRemaining).toBeLessThanOrEqual(8);
    expect(result.current.totalElapsed).toBeGreaterThanOrEqual(2);
  });

  it('transitions between segments', () => {
    const workout = makeWorkout([
      { label: 'Warm Up', instruction: 'Easy', durationSeconds: 3 },
      { label: 'Run', instruction: 'Fast', durationSeconds: 5 },
    ]);

    const { result } = renderHook(() => useGuidedRun(workout, true));

    // Advance past first segment
    act(() => { vi.advanceTimersByTime(4000); });

    expect(result.current.currentSegmentIndex).toBe(1);
    expect(result.current.currentSegment?.label).toBe('Run');
    expect(result.current.nextSegment).toBeNull();
  });

  it('completes when all segments finish', () => {
    const workout = makeWorkout([
      { label: 'Run', instruction: 'Go', durationSeconds: 2 },
    ]);

    const { result } = renderHook(() => useGuidedRun(workout, true));

    act(() => { vi.advanceTimersByTime(3000); });

    expect(result.current.isComplete).toBe(true);
    expect(result.current.totalProgress).toBe(1);
  });

  it('pauses when isRunning becomes false', () => {
    const workout = makeWorkout([
      { label: 'Run', instruction: 'Go', durationSeconds: 20 },
    ]);

    const { result, rerender } = renderHook(
      ({ running }) => useGuidedRun(workout, running),
      { initialProps: { running: true } }
    );

    act(() => { vi.advanceTimersByTime(3000); });
    const elapsedBeforePause = result.current.totalElapsed;

    // Pause
    rerender({ running: false });
    act(() => { vi.advanceTimersByTime(5000); });

    // Time should not have advanced significantly while paused
    expect(result.current.totalElapsed).toBeLessThanOrEqual(elapsedBeforePause + 1);
  });

  it('returns null state when no workout provided', () => {
    const { result } = renderHook(() => useGuidedRun(null, false));

    expect(result.current.currentSegment).toBeNull();
    expect(result.current.isComplete).toBe(false);
    expect(result.current.totalElapsed).toBe(0);
  });
});
