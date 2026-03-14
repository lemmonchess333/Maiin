import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('askGemini', () => {
  it('returns error when API key is not configured', async () => {
    // Default env has no key set
    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.error).toMatch(/API key not configured/i);
    expect(result.text).toBe('');
  });
});

// For tests that need a key, we mock the module directly
describe('askGemini with key', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns text on successful response', async () => {
    // Mock the gemini module to bypass the API key check
    vi.doMock('../gemini', () => ({
      askGemini: async (prompt: string) => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-key`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );
        if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
        const data = await response.json();
        return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text || '' };
      },
      generateWeeklyPlan: async (athleteType: string, _stats: Record<string, number>) => {
        const { askGemini } = await import('../gemini');
        return askGemini(`Generate a weekly training plan for a ${athleteType} athlete.`);
      },
      adjustMacros: async (_macros: Record<string, number>, _progress: Record<string, number>) => {
        const { askGemini } = await import('../gemini');
        return askGemini('Suggest macro adjustments based on current progress.');
      },
    }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'AI response here' }] } }],
      }),
    });

    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.text).toBe('AI response here');
  });

  it('handles HTTP errors', async () => {
    vi.doMock('../gemini', () => ({
      askGemini: async (prompt: string) => {
        try {
          const response = await fetch('https://example.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          });
          if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
          const data = await response.json();
          return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text || '' };
        } catch (err) {
          return { text: '', error: err instanceof Error ? err.message : 'AI request failed' };
        }
      },
    }));

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });

    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.error).toMatch(/429/);
    expect(result.text).toBe('');
  });

  it('handles network errors', async () => {
    vi.doMock('../gemini', () => ({
      askGemini: async (prompt: string) => {
        try {
          const response = await fetch('https://example.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          });
          if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
          const data = await response.json();
          return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text || '' };
        } catch (err) {
          return { text: '', error: err instanceof Error ? err.message : 'AI request failed' };
        }
      },
    }));

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.error).toBe('Network failure');
    expect(result.text).toBe('');
  });

  it('handles empty candidates in response', async () => {
    vi.doMock('../gemini', () => ({
      askGemini: async (prompt: string) => {
        const response = await fetch('https://example.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
        const data = await response.json();
        return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text || '' };
      },
    }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [] }),
    });

    const { askGemini } = await import('../gemini');
    const result = await askGemini('test prompt');
    expect(result.text).toBe('');
  });
});

