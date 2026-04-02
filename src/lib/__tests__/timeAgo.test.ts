import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTimeAgo } from '../timeAgo';

describe('getTimeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for less than 60 seconds', () => {
    const date = new Date(Date.now() - 30_000); // 30 seconds ago
    expect(getTimeAgo(date)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60_000); // 5 minutes ago
    expect(getTimeAgo(date)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    const date = new Date(Date.now() - 3 * 3_600_000); // 3 hours ago
    expect(getTimeAgo(date)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const date = new Date(Date.now() - 2 * 86_400_000); // 2 days ago
    expect(getTimeAgo(date)).toBe('2d ago');
  });

  it('returns formatted date for more than 7 days', () => {
    const date = new Date(Date.now() - 10 * 86_400_000); // 10 days ago
    const result = getTimeAgo(date);
    // Should be a localized date string like "23 Mar"
    expect(result).not.toContain('ago');
    expect(result).toMatch(/\d{1,2}\s\w{3}/);
  });

  it('returns "just now" at exactly 0 seconds', () => {
    const date = new Date();
    expect(getTimeAgo(date)).toBe('just now');
  });

  it('returns "1m ago" at exactly 60 seconds', () => {
    const date = new Date(Date.now() - 60_000);
    expect(getTimeAgo(date)).toBe('1m ago');
  });

  it('returns "1h ago" at exactly 3600 seconds', () => {
    const date = new Date(Date.now() - 3_600_000);
    expect(getTimeAgo(date)).toBe('1h ago');
  });

  it('returns "6d ago" at 6 days', () => {
    const date = new Date(Date.now() - 6 * 86_400_000);
    expect(getTimeAgo(date)).toBe('6d ago');
  });
});
