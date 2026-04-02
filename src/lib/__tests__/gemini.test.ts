import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Mock firebase/functions before importing gemini
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('../firebase', () => ({
  functions: {},
}));

import { httpsCallable } from 'firebase/functions';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('askGemini (Cloud Function proxy)', () => {
  it('returns text on successful response', async () => {
    const mockCallable = vi.fn().mockResolvedValue({
      data: { text: 'AI response here' },
    });
    vi.mocked(httpsCallable).mockReturnValue(mockCallable as never);

    // Re-import to pick up fresh mock
    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.text).toBe('AI response here');
  });

  it('handles rate limit errors', async () => {
    const mockCallable = vi.fn().mockRejectedValue(
      new Error('resource-exhausted: Rate limit reached'),
    );
    vi.mocked(httpsCallable).mockReturnValue(mockCallable as never);

    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.error).toMatch(/Rate limit/i);
    expect(result.text).toBe('');
  });

  it('handles network errors', async () => {
    const mockCallable = vi.fn().mockRejectedValue(new Error('Network failure'));
    vi.mocked(httpsCallable).mockReturnValue(mockCallable as never);

    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.error).toBe('Network failure');
    expect(result.text).toBe('');
  });

  it('handles unknown errors', async () => {
    const mockCallable = vi.fn().mockRejectedValue('string error');
    vi.mocked(httpsCallable).mockReturnValue(mockCallable as never);

    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.error).toBe('AI request failed');
    expect(result.text).toBe('');
  });
});

describe('generateWeeklyPlan', () => {
  it('calls askGemini with athlete type', async () => {
    const mockCallable = vi.fn().mockResolvedValue({
      data: { text: 'Weekly plan here' },
    });
    vi.mocked(httpsCallable).mockReturnValue(mockCallable as never);

    const { generateWeeklyPlan } = await import('../gemini');
    const result = await generateWeeklyPlan('hybrid', { squat: 100 });
    expect(result.text).toBe('Weekly plan here');
  });
});

describe('adjustMacros', () => {
  it('calls askGemini with macro prompt', async () => {
    const mockCallable = vi.fn().mockResolvedValue({
      data: { text: 'Adjust protein up' },
    });
    vi.mocked(httpsCallable).mockReturnValue(mockCallable as never);

    const { adjustMacros } = await import('../gemini');
    const result = await adjustMacros({ protein: 150 }, { weight: 80 });
    expect(result.text).toBe('Adjust protein up');
  });
});
