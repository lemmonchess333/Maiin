import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the auth context so we don't need a provider in tests.
const mockUser = { uid: 'me' };
let mockProfile: { crewId?: string } | null = { crewId: undefined };
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
}));

// Mock Firestore + socialApi. The hook reads N follow profiles to
// bucket their crewIds; tests stub getDoc to return controlled data.
let mockFollowingIds: Set<string> = new Set();
const mockUserCrewIds: Record<string, string | undefined> = {};

vi.mock('@/lib/socialApi', () => ({
  getFollowingIds: vi.fn(async () => mockFollowingIds),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, _coll: string, uid: string) => ({ id: uid })),
  getDoc: vi.fn(async (ref: { id: string }) => ({
    exists: () => mockUserCrewIds[ref.id] !== undefined,
    data: () => ({ crewId: mockUserCrewIds[ref.id] }),
  })),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { useSuggestedCrews } from '../useSuggestedCrews';
import type { Crew } from '../useCrews';

function makeCrew(id: string, name: string, memberCount = 10): Crew {
  return {
    id,
    name,
    description: '',
    icon: 'dumbbell',
    memberCount,
    leaderboardMetric: 'hybrid_score',
    type: 'default',
    createdAt: null,
    createdBy: 'system',
  };
}

describe('useSuggestedCrews', () => {
  beforeEach(() => {
    mockFollowingIds = new Set();
    Object.keys(mockUserCrewIds).forEach((k) => delete mockUserCrewIds[k]);
    mockProfile = { crewId: undefined };
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns empty list when the hook is inactive (Crews tab not open)', async () => {
    mockFollowingIds = new Set(['a', 'b', 'c']);
    mockUserCrewIds.a = 'crew-1';
    mockUserCrewIds.b = 'crew-1';
    const allCrews = [makeCrew('crew-1', 'Hybrid')];
    const { result } = renderHook(() => useSuggestedCrews(false, allCrews));
    expect(result.current.crews).toEqual([]);
  });

  it('returns empty list when the user follows fewer than 2 people', async () => {
    mockFollowingIds = new Set(['a']);
    mockUserCrewIds.a = 'crew-1';
    const allCrews = [makeCrew('crew-1', 'Hybrid')];
    const { result } = renderHook(() => useSuggestedCrews(true, allCrews));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.crews).toEqual([]);
  });

  it('suggests crews with ≥2 follows as members', async () => {
    mockFollowingIds = new Set(['a', 'b', 'c']);
    mockUserCrewIds.a = 'crew-1';
    mockUserCrewIds.b = 'crew-1';
    mockUserCrewIds.c = 'crew-2'; // single overlap, should NOT suggest
    const allCrews = [makeCrew('crew-1', 'Hybrid'), makeCrew('crew-2', 'Runners')];
    const { result } = renderHook(() => useSuggestedCrews(true, allCrews));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.crews.map((c) => c.id)).toEqual(['crew-1']);
    expect(result.current.crews[0].matchedFollows).toBe(2);
  });

  it("excludes the user's own crew from suggestions", async () => {
    mockProfile = { crewId: 'crew-1' };
    mockFollowingIds = new Set(['a', 'b']);
    mockUserCrewIds.a = 'crew-1';
    mockUserCrewIds.b = 'crew-1';
    const allCrews = [makeCrew('crew-1', 'Hybrid')];
    const { result } = renderHook(() => useSuggestedCrews(true, allCrews));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.crews).toEqual([]);
  });

  it('sorts suggestions by match count desc, then memberCount desc', async () => {
    mockFollowingIds = new Set(['a', 'b', 'c', 'd']);
    mockUserCrewIds.a = 'crew-1';
    mockUserCrewIds.b = 'crew-1';
    mockUserCrewIds.c = 'crew-2';
    mockUserCrewIds.d = 'crew-2';
    const allCrews = [
      makeCrew('crew-1', 'Hybrid', 50),
      makeCrew('crew-2', 'Runners', 100), // higher memberCount, tied match count
    ];
    const { result } = renderHook(() => useSuggestedCrews(true, allCrews));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.crews.map((c) => c.id)).toEqual(['crew-2', 'crew-1']);
  });

  it('persists dismissals to localStorage and excludes them on next load', async () => {
    mockFollowingIds = new Set(['a', 'b']);
    mockUserCrewIds.a = 'crew-1';
    mockUserCrewIds.b = 'crew-1';
    const allCrews = [makeCrew('crew-1', 'Hybrid')];
    const { result, rerender } = renderHook(() => useSuggestedCrews(true, allCrews));
    await waitFor(() => expect(result.current.crews).toHaveLength(1));
    act(() => result.current.dismiss('crew-1'));
    expect(result.current.crews).toEqual([]);
    const stored = JSON.parse(
      window.localStorage.getItem('tropos-social-dismissed-crews') ?? '[]',
    );
    expect(stored).toContain('crew-1');
    // Simulate a re-mount — dismissals should be respected.
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.crews).toEqual([]);
  });
});
