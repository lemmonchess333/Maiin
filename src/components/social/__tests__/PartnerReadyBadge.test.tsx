/**
 * PartnerReadyBadge (SOC-P2d) — the partner-streak discovery chip on
 * People rows. Pins the visibility contract: MUTUAL follow + NO
 * existing bond + not-self, and the read gate (the eligibility hook
 * must stay INERT for non-follower rows — the common case pays zero
 * reads).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockFollowers = vi.fn<() => Set<string>>();
const mockUsePartnerStreak = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
  useUid: () => ({ user: { uid: "me" } }).user?.uid ?? null,
}));
vi.mock("../../../hooks/useFollowersOfMe", () => ({
  useFollowersOfMe: () => ({ followers: mockFollowers() }),
}));
vi.mock("@/features/partnerStreak/usePartnerStreak", () => ({
  usePartnerStreak: (uid?: string) => mockUsePartnerStreak(uid),
}));

import PartnerReadyBadge from "../PartnerReadyBadge";

beforeEach(() => {
  vi.clearAllMocks();
  mockFollowers.mockReturnValue(new Set());
  mockUsePartnerStreak.mockReturnValue({
    loading: false,
    mutualFollow: false,
    bond: null,
  });
});

describe("PartnerReadyBadge", () => {
  it("renders for a mutual follow with no bond", () => {
    mockFollowers.mockReturnValue(new Set(["ally"]));
    mockUsePartnerStreak.mockReturnValue({
      loading: false,
      mutualFollow: true,
      bond: null,
    });
    render(<PartnerReadyBadge uid="ally" />);
    expect(screen.getByText(/streak ready/i)).toBeInTheDocument();
  });

  it("stays INERT (hook gets undefined — no reads) when they don't follow me", () => {
    render(<PartnerReadyBadge uid="stranger" />);
    expect(screen.queryByText(/streak ready/i)).toBeNull();
    expect(mockUsePartnerStreak).toHaveBeenCalledWith(undefined);
  });

  it("hidden when a bond already exists (no noise on live streaks)", () => {
    mockFollowers.mockReturnValue(new Set(["ally"]));
    mockUsePartnerStreak.mockReturnValue({
      loading: false,
      mutualFollow: true,
      bond: { streak: 3 },
    });
    render(<PartnerReadyBadge uid="ally" />);
    expect(screen.queryByText(/streak ready/i)).toBeNull();
  });

  it("hidden while eligibility is loading and when follow-back is absent", () => {
    mockFollowers.mockReturnValue(new Set(["ally"]));
    mockUsePartnerStreak.mockReturnValue({
      loading: true,
      mutualFollow: false,
      bond: null,
    });
    const { rerender } = render(<PartnerReadyBadge uid="ally" />);
    expect(screen.queryByText(/streak ready/i)).toBeNull();
    mockUsePartnerStreak.mockReturnValue({
      loading: false,
      mutualFollow: false,
      bond: null,
    });
    rerender(<PartnerReadyBadge uid="ally" />);
    expect(screen.queryByText(/streak ready/i)).toBeNull();
  });

  it("never renders for the current user's own row", () => {
    mockFollowers.mockReturnValue(new Set(["me"]));
    mockUsePartnerStreak.mockReturnValue({
      loading: false,
      mutualFollow: true,
      bond: null,
    });
    render(<PartnerReadyBadge uid="me" />);
    expect(screen.queryByText(/streak ready/i)).toBeNull();
    expect(mockUsePartnerStreak).toHaveBeenCalledWith(undefined);
  });
});
