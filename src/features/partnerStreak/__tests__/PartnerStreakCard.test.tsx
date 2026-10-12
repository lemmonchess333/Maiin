/**
 * PartnerStreakCard for a restricted account (S4e): starting a streak
 * reaches the partner and the rules refuse it, so it is not offered. A
 * streak that already exists still shows, and can still be ended.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const H = vi.hoisted(() => ({
  partner: {
    loading: false,
    mutualFollow: true,
    bond: null as null | { id: string; streak: number },
    busy: false,
    start: vi.fn(),
    end: vi.fn(),
  },
  restriction: { isRestricted: false, loading: false },
}));
vi.mock("../usePartnerStreak", () => ({
  usePartnerStreak: () => H.partner,
}));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => H.restriction,
}));
vi.mock("@/lib/auth", () => ({ useUid: () => "me" }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PartnerStreakCard from "../PartnerStreakCard";

beforeEach(() => {
  H.partner.bond = null;
  H.restriction.isRestricted = false;
});
afterEach(cleanup);

describe("PartnerStreakCard", () => {
  it("offers a streak to two people who follow each other", () => {
    render(<PartnerStreakCard partnerUid="maya" partnerName="Maya" />);
    expect(
      screen.getByRole("button", { name: "Start streak" })
    ).toBeInTheDocument();
  });

  it("offers no new streak to a restricted account", () => {
    H.restriction.isRestricted = true;
    const { container } = render(
      <PartnerStreakCard partnerUid="maya" partnerName="Maya" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("still shows a restricted account's existing streak, with End", () => {
    H.restriction.isRestricted = true;
    H.partner.bond = { id: "bond-1", streak: 4 };
    render(<PartnerStreakCard partnerUid="maya" partnerName="Maya" />);
    expect(
      screen.getByText("day streak", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End" })).toBeInTheDocument();
  });
});
